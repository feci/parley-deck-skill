"use strict";

/*
 * parley-design-check — the run engine.
 *
 * Everything the checker claims about itself is derived here rather than declared: the
 * capability summary comes from scanning the detector directory, the executed tiers come
 * from the detectors found, and the rules it cannot decide are named with the reason it
 * cannot decide them. A rule is never dropped in silence — it appears as UNJUDGEABLE, or
 * out of scope for the surface, or with a finding.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { CheckError, loadRegistry, resolveRegistryPath, tierRank, tierWord } = require("./registry.js");
const { ARTIFACT_KINDS, aliasTarget, readArtifact, readTokens, resolveValue, toSrgb } = require("./artifacts.js");
const { scanStylesheet } = require("./css.js");

const VERDICTS = ["PASS", "VIOLATION", "NEEDS_REVIEW", "UNJUDGEABLE"];
const CAPABLE_TIERS = ["T0", "T1"];
const STYLE_EXTENSIONS = new Set([".css"]);
const MARKUP_EXTENSIONS = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

// The fields PDS gives each artifact kind. Presence only: an empty field is present.
// `declined` is absent from DIRECTION on purpose: §2 makes it required only where the
// proposer declined, and a field required conditionally is not a presence check.
const REQUIRED_FIELDS = {
  "DESIGN-BRIEF": ["run-id", "axes", "primary-axis", "anti-goals", "targets", "level", "decider"],
  DIRECTION: ["handle", "signature", "positions", "assigned", "tokens", "states", "effects"],
  CRITIQUE: ["agent", "targets", "findings"],
  VERDICT: ["outcome", "grafts", "tokens-digest", "answers", "dissent", "decided-by"],
  CONTRACT: ["winner", "tokens", "named-rules", "states", "effect-budget", "waivers", "level"],
  "DESIGN-SYSTEM": ["author", "source-commit", "groups", "divergences"],
  AUDIT: ["implements", "registry-digest", "tiers", "findings", "level"],
  WAIVERS: ["entries"]
};

/* ------------------------------------------------------------ capability */

/** Load every detector module in a directory. The set of files is the capability claim. */
function loadDetectors(directory) {
  const detectors = [];
  const entries = fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith(".js"))
    .sort();
  for (const entry of entries) {
    const modulePath = path.join(directory, entry);
    const detector = require(modulePath);
    const name = entry.replace(/\.js$/, "");
    for (const field of ["rule", "tier", "inputs", "summary", "run"]) {
      if (detector[field] === undefined) {
        throw new CheckError(`detector ${name} declares no ${field}`);
      }
    }
    if (typeof detector.run !== "function") throw new CheckError(`detector ${name} has no run function`);
    if (!CAPABLE_TIERS.includes(detector.tier)) {
      throw new CheckError(`detector ${name} declares tier ${detector.tier}, which this checker cannot obtain`);
    }
    detectors.push({ name, path: modulePath, ...detector });
  }
  return detectors;
}

function capabilityOf(detectors) {
  const tiers = [...new Set(detectors.map((detector) => detector.tier))].sort();
  return {
    tiers: tiers.map(tierWord),
    "rules-with-detector": detectors.map((detector) => detector.rule).sort(),
    detectors: detectors
      .map((detector) => ({
        detector: detector.name,
        rule: detector.rule,
        tier: tierWord(detector.tier),
        inputs: detector.inputs,
        summary: detector.summary
      }))
      .sort((a, b) => a.detector.localeCompare(b.detector))
  };
}

/* ---------------------------------------------------------------- inputs */

// Symlinks are recorded and not followed: a cycle would otherwise end the run in a stack
// trace, and a file reached twice would be reported twice.
function walk(target, collected, skipped) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    skipped.push({ path: target, reason: "a symbolic link, which this checker records rather than follows" });
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) {
      if (entry.startsWith(".") || SKIP_DIRECTORIES.has(entry)) continue;
      walk(path.join(target, entry), collected, skipped);
    }
    return;
  }
  collected.push(target);
}

// A file that declares the spec is a PDS artifact whatever its frontmatter does next. The
// declaration is read off the raw head rather than through the parser, because the parser
// failing is the case this exists for: §2 rule 6 says such a file is reported as violating
// the canonical subset, never dropped from conformance while its neighbours keep a level.
const SPEC_DECLARATION = /^spec:[ \t]*(?:"|')?PDS\/1\.0(?:"|')?[ \t]*$/m;

function declaresSpec(text) {
  return SPEC_DECLARATION.test(text.split(/\r?\n/).slice(0, 40).join("\n"));
}

function collectInputs(targets) {
  const inputs = {
    artifacts: [],
    tokenDocs: [],
    styles: [],
    markup: [],
    notInspected: [],
    unparsable: [],
    unreadable: [],
    untyped: []
  };
  const files = [];
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) throw new CheckError(`no such path: ${target}`);
    walk(resolved, files, inputs.notInspected);
  }
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    // A file that is not the kind it looked like is named in the report with the reason.
    // The run continues, because a malformed neighbour is not evidence about the design.
    if (extension === ".md") {
      const text = fs.readFileSync(file, "utf8");
      let artifact = null;
      try {
        artifact = readArtifact(file);
      } catch (error) {
        const reason = error.message;
        inputs.notInspected.push({ path: file, reason });
        // The finding already carries the file it is against, so the reason does not repeat it.
        if (declaresSpec(text)) {
          inputs.unparsable.push({ path: file, reason: reason.split(`${file}: `).join("").split(`${file} `).join("") });
        }
        continue;
      }
      if (artifact && artifact.kind && ARTIFACT_KINDS.includes(artifact.kind)) {
        artifact.text = text;
        inputs.artifacts.push(artifact);
      } else if (artifact && artifact.kind && String(artifact.kind).trim() !== "" && declaresSpec(text)) {
        /*
         * §2 rule 1: a file declaring the spec and naming a kind §2 does not define is a
         * candidate artifact with a broken type, not a stranger. Demoting it to `not-inspected`
         * let a typo'd kind stand beside a verified L1 while the artifact it was meant to be was
         * missing from the run entirely. A file declaring the spec and no kind at all is not an
         * artifact instance — that is how the spec and the registry declare the spec they define —
         * and it stays uninspected rather than becoming a finding against the doctrine itself.
         */
        inputs.untyped.push({ path: file, kind: String(artifact.kind).trim() });
      } else {
        inputs.notInspected.push({
          path: file,
          reason: artifact ? "frontmatter carrying no kind PDS defines" : "markdown with no PDS artifact frontmatter"
        });
      }
      continue;
    }
    if (extension === ".json") {
      let document_ = null;
      try {
        document_ = readTokens(file);
      } catch (error) {
        inputs.notInspected.push({ path: file, reason: error.message });
        continue;
      }
      if (document_.tokens.size > 0) inputs.tokenDocs.push(document_);
      else inputs.notInspected.push({ path: file, reason: "JSON with no design tokens" });
      continue;
    }
    if (STYLE_EXTENSIONS.has(extension)) {
      /*
       * The readability fail-safe. A stylesheet the scanner could not tokenise is kept — what
       * it did read is still evidence — and recorded as unreadable, because the alternative is
       * the failure this whole family has: fewer declarations come back, every detector reports
       * nothing against them, and the file is certified clean while a browser applies them.
       */
      const text = fs.readFileSync(file, "utf8");
      const scan = scanStylesheet(text);
      inputs.styles.push({ path: file, text, blocks: scan.blocks, unreadable: scan.unreadable });
      if (scan.unreadable.length > 0) inputs.unreadable.push({ path: file, reasons: scan.unreadable });
      continue;
    }
    if (MARKUP_EXTENSIONS.has(extension)) {
      inputs.markup.push({ path: file, text: fs.readFileSync(file, "utf8") });
      continue;
    }
    inputs.notInspected.push({ path: file, reason: `no reader for ${extension || "an extensionless file"}` });
  }
  return inputs;
}

function mergeTokens(tokenDocs) {
  const index = new Map();
  for (const document_ of tokenDocs) {
    for (const [key, token] of document_.tokens) {
      if (!index.has(key)) index.set(key, token);
    }
  }
  return index;
}

/* --------------------------------------------------------------- waivers */

function loadWaivers(waiverPath) {
  const artifact = readArtifact(waiverPath);
  if (!artifact) throw new CheckError(`${waiverPath}: no frontmatter, so it is not a WAIVERS artifact`);
  if (artifact.kind !== "WAIVERS") throw new CheckError(`${waiverPath}: kind is ${artifact.kind}, not WAIVERS`);
  const entries = Array.isArray(artifact.data.entries) ? artifact.data.entries : [];
  return { path: waiverPath, entries };
}

// A scope is a path, read relative to the waiver file that carries it or to the working
// directory. Two readings, both exact: neither of them is a tree, and neither is a pattern.
function scopePaths(scope, context) {
  return [path.resolve(context.waiverDir, scope), path.resolve(context.cwd, scope)];
}

// A participant id is machine-readable: one token, optionally namespaced as `human:tomas`.
// A name written in prose cannot be compared with another name, and a counter-signature
// nobody can compare is the signature this check exists to refuse.
const PARTICIPANT_ID = /^[A-Za-z][A-Za-z0-9._-]*(:[A-Za-z0-9._-]+)?$/;

function normaliseIdentity(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/*
 * Whether one participant id is minted from another: the same id with something appended
 * across a non-alphanumeric boundary, in either direction. `claude-1.critique` is minted from
 * `claude-1`; `hermes-10` is not minted from `hermes-1`, because the boundary character is
 * part of the id rather than a separator. Two ids in one run standing in that relation are
 * one identity as far as any reader is concerned, and nothing in the run distinguishes them.
 */
function mintedFrom(derived, base) {
  if (derived === base || base === "" || !derived.startsWith(base)) return false;
  return !/[a-z0-9]/.test(derived.charAt(base.length));
}

/**
 * The protocol owner of a path, from §1's naming: a round directory holds one file per agent,
 * named for the agent id — `round-01/<agent>.md`, `round-01/<agent>.tokens.json`. The owner is
 * the basename up to its first dot, so a file minted from a proposer's id resolves to that
 * proposer. A path outside a round directory names work §1 assigns no owner to, and returns
 * the empty string: §8 rule 2 excludes the authors of the waived work, and where the run
 * records no author there is none to exclude.
 */
function workOwner(target) {
  if (!ROUND_DIR.test(path.basename(path.dirname(target)))) return "";
  const id = path.basename(target).split(".")[0];
  return PARTICIPANT_ID.test(id) ? normaliseIdentity(id) : "";
}

/**
 * Validate one waiver. Every field PDS requires, no wildcard, an unexpired date, an
 * independence that can be established rather than asserted, and, for a system-blind rule,
 * a scope that is not the ratified system itself, since waiving a system-blind rule at the
 * system layer is the widening the flag exists to forbid.
 *
 * §8 rule 2 is the reason the identity work is here and not in a comment: a counter-signature
 * by the grantor is not a counter-signature, and where independence cannot be established
 * the waiver MUST NOT suppress its finding.
 */
function waiverProblem(entry, rule, context) {
  if (entry === null || typeof entry !== "object") return "the entry is not a set of fields";
  const id = entry["rule-id"];
  if (typeof id !== "string" || id.trim() === "") return "the entry names no rule id";
  if (/[*?]/.test(id)) return "wildcards are rejected: a waiver names exactly one rule id";
  if (!rule) return `${id} is not a rule in the loaded registry`;
  const scope = entry.scope;
  if (typeof scope !== "string" || scope.trim() === "") return "the entry names no scope";
  if (/[*?]/.test(scope)) return "wildcards are rejected: a scope is a path, not a tree";
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") return "the entry gives no reason";
  const grantor = entry["granted-by"];
  const signer = entry["counter-signed-by"];
  if (typeof grantor !== "string" || grantor.trim() === "") {
    return "the entry names no granting participant, so independence cannot be established";
  }
  if (typeof signer !== "string" || signer.trim() === "") return "the entry carries no counter-signature";
  if (!PARTICIPANT_ID.test(grantor.trim())) {
    return `the granting identity ${JSON.stringify(grantor)} is not a machine-readable participant id`;
  }
  if (!PARTICIPANT_ID.test(signer.trim())) {
    return `the counter-signature ${JSON.stringify(signer)} is not a machine-readable participant id`;
  }
  if (normaliseIdentity(grantor) === normaliseIdentity(signer)) {
    return `${grantor} counter-signed its own waiver, which is not a counter-signature`;
  }
  const expiry = entry.expiry === undefined ? null : String(entry.expiry);
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return "the entry carries no expiry date";
  if (Date.parse(`${expiry}T23:59:59Z`) < context.now) return `the waiver expired on ${expiry} and is treated as absent`;
  if (rule.systemBlind) {
    const resolved = scopePaths(scope, context);
    for (const systemPath of context.systemPaths) {
      if (resolved.includes(path.resolve(systemPath))) {
        return `${id} is system-blind and this waiver scopes to the ratified system itself`;
      }
    }
  }
  /*
   * Independence, last, so a waiver that is wrong for a nameable reason is told that reason.
   * §8 rule 2: where independence cannot be established the waiver MUST NOT suppress its
   * finding. Two ids differing is distinctness, and distinctness is not independence — with
   * no participant-bearing artifact among the inputs there is no roster to check either name
   * against, and `granted-by: nobody-1, counter-signed-by: ghost-2` would otherwise pass. So
   * the finding stays in the ledger and the report says why, rather than a silent suppression
   * that reports as independence something the run never established.
   */
  if (context.participants.size === 0) {
    return `the run records no participants, so the independence of ${grantor} and ${signer} cannot be established; pass the run's design artifacts, or fix the finding`;
  }
  for (const [role, identity] of [["granting participant", grantor], ["counter-signer", signer]]) {
    if (!context.participants.has(normaliseIdentity(identity))) {
      return `the ${role} ${identity} is not a participant this run records, so independence cannot be established`;
    }
  }
  /*
   * §8 rule 2's third conjunct, which distinctness does not reach: the counter-signer must not
   * be an author of the waived work. Naming another participant as grantor costs nothing, so
   * without this an author approves its own exception by asking a colleague to hold the pen.
   * The scope resolves to a path, §1 names a round's files for their agent, and both readings
   * of the scope are tested because either is where the waiver meant to point.
   */
  const signerId = normaliseIdentity(signer);
  for (const resolved of scopePaths(scope, context)) {
    if (signerId === "" || workOwner(resolved) !== signerId) continue;
    return `the counter-signer ${signer} authored the waived work, which §1 names for its agent id, so this is a self-approval rather than a counter-signature`;
  }
  /*
   * An identity the run records only through an artifact that identity wrote is a name the run
   * cannot corroborate: a proposer filing one extra critique under a fresh id reads exactly
   * like a genuine critic, and §8 rule 2 says a waiver whose independence cannot be established
   * MUST NOT suppress its finding. The corroborated set is the one recusal already uses.
   */
  if (!context.corroborated.has(signerId)) {
    return `the counter-signer ${signer} is recorded only by an artifact it authored itself, so its independence cannot be established; counter-sign with an id the run records elsewhere`;
  }
  return null;
}

function waiverMatches(entry, finding, context) {
  if (entry["rule-id"] !== finding.rule) return false;
  if (!finding.absolutePath) return false;
  return scopePaths(entry.scope, context).includes(path.resolve(finding.absolutePath));
}

/* ------------------------------------------------------- conformance */

/*
 * A conformance level is an obligation set, not an impression. Every obligation is declared
 * before it is tested, so the report names what the claim owed as well as what failed, and
 * an obligation whose evidence the run did not carry ends `unverified` — which is not a
 * pass, and which leaves the level unverified. §9 rule 3: a claim whose evidence was
 * unavailable is a conformance failure, not a warning.
 */

const MET = "met";
const FAILED = "failed";
const UNVERIFIED = "unverified";

function conformanceLedger() {
  const declared = new Map();
  const problems = [];
  const mark = (id, state) => {
    const entry = declared.get(id);
    if (!entry) throw new CheckError(`the obligation ${id} was tested without being declared`);
    if (state === FAILED || entry.result === MET) entry.result = state;
  };
  return {
    declared,
    problems,
    // Declaring an obligation is what makes its absence visible: one nobody declared cannot
    // be reported as unverified, and a level would then be verified by omission.
    declare(id, level, owed) {
      if (!declared.has(id)) declared.set(id, { obligation: id, level, owed, result: MET });
    },
    fail(id, violation, remedy, site) {
      mark(id, FAILED);
      problems.push({ rule: id, verdict: "VIOLATION", violation, remedy, path: site || null });
    },
    unverified(id, violation, remedy, site) {
      mark(id, UNVERIFIED);
      problems.push({ rule: id, verdict: "UNJUDGEABLE", violation, remedy, path: site || null });
    },
    // The defect is already in the ledger under its own finding; this records that the
    // obligation it belongs to is not met, without printing the same line twice.
    failRecorded(id) {
      mark(id, FAILED);
    }
  };
}

function byKind(artifacts, kind) {
  return artifacts.filter((artifact) => artifact.kind === kind);
}

function agentOf(artifact) {
  return path.basename(artifact.path).replace(/\.md$/, "");
}

// Codepoint order, which is what §4 rule 2 sorts by. localeCompare is not it.
function codepoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * §4 rule 2, recomputed rather than trusted: the sorted primary positions rotated by the
 * first eight hex characters of sha256("PDS/1" || run_id) read big-endian, modulo the
 * position count. The rotated list maps to the sorted proposer ids in order.
 */
function rotateAssignment(runId, positions) {
  const sorted = [...positions].sort(codepoint);
  const digest = crypto.createHash("sha256").update(`PDS/1${runId}`, "utf8").digest("hex");
  const shift = Number.parseInt(digest.slice(0, 8), 16) % sorted.length;
  return [...sorted.slice(shift), ...sorted.slice(0, shift)];
}

// §1's mapping, as a test over a path. The round directories carry the step; the three
// single-file steps carry the artifact name §1 gives them. Case is folded because a
// case-insensitive filesystem is not a second process.
const ROUND_DIR = /^round-\d+$/i;

function inRound(target, round) {
  return path.basename(path.dirname(target)).toLowerCase() === round;
}

function named(target, file) {
  return path.basename(target).toLowerCase() === file;
}

const PROCESS_HOMES = {
  "DESIGN-BRIEF": { where: "DESIGN-BRIEF.md, alongside 00-prompt.md", test: (p) => named(p, "design-brief.md") },
  DIRECTION: { where: "round-01/<agent>.md", test: (p) => inRound(p, "round-01") },
  CRITIQUE: { where: "round-02/<agent>.md", test: (p) => inRound(p, "round-02") },
  VERDICT: { where: "consensus.md", test: (p) => named(p, "consensus.md") },
  CONTRACT: { where: "FINAL.md", test: (p) => named(p, "final.md") }
};

// Gate outcomes live on a `gates` list on any artifact of the run. The vocabulary is §3's:
// a gate passes, fails, or returns ABSTAIN, and nothing else is an outcome a reader can act on.
const GATE_OUTCOMES = new Set(["pass", "fail", "abstain"]);

function gateRecords(artifacts) {
  const records = new Map();
  for (const artifact of artifacts) {
    const gates = artifact.data.gates;
    if (!Array.isArray(gates)) continue;
    for (const gate of gates) {
      if (gate === null || typeof gate !== "object" || gate.id === undefined) continue;
      const id = String(gate.id).trim().toUpperCase();
      if (!records.has(id)) records.set(id, { entry: gate, path: artifact.path });
    }
  }
  return records;
}

/** The banned-slop ban list, derived from the registry exactly as RULES.md derives it. */
function banList(registry) {
  return new Set(
    [...registry.rules.values()].filter((rule) => rule.class === "slop" && rule.tier === "T0").map((rule) => rule.id)
  );
}

// One recorded signature entry is `<rule-id>=<the declared value that evidenced it>`. The
// id alone is accepted; without the evidence only the two-id sharing test can fire.
function parseSignature(raw) {
  const text = String(raw).trim();
  const split = text.indexOf("=");
  if (split < 0) return { id: text, evidence: null };
  return { id: text.slice(0, split).trim(), evidence: text.slice(split + 1).trim() };
}

/**
 * RULES.md's sharing test, over two signature sets: they share when they intersect in two or
 * more ids, or in one id evidenced by the same declared value in both. Returns the shared
 * ids, or null. One test, used for the signatures the run recorded and for the ones this run
 * observed for itself, so the two can be compared on the same terms.
 */
function sharedSignature(a, b) {
  const shared = a.filter((entry) => b.some((other) => other.id === entry.id));
  const sameEvidence = shared.filter(
    (entry) =>
      entry.evidence !== null &&
      b.some((other) => other.id === entry.id && other.evidence !== null && other.evidence === entry.evidence)
  );
  if (shared.length < 2 && sameEvidence.length < 1) return null;
  return [...new Set(shared.map((entry) => entry.id))].sort(codepoint);
}

/**
 * The banned-slop signature G1 records for each direction, read from a `g1-signatures` list
 * on any artifact of the run. It is a flat block list because the canonical frontmatter
 * subset stops at a flow collection holding flow collections: the ledger the gate must
 * record has to be writable in the language the spec publishes.
 */
function signatureLedger(artifacts) {
  const ledger = new Map();
  for (const artifact of artifacts) {
    const recorded = artifact.data["g1-signatures"];
    if (!Array.isArray(recorded)) continue;
    for (const entry of recorded) {
      if (entry === null || typeof entry !== "object" || entry.direction === undefined) continue;
      const handle = String(entry.direction).trim();
      if (ledger.has(handle)) continue;
      const fires = entry.fires === undefined ? [] : Array.isArray(entry.fires) ? entry.fires : [entry.fires];
      ledger.set(handle, {
        path: artifact.path,
        entries: fires.filter((item) => String(item).trim() !== "").map(parseSignature)
      });
    }
  }
  return ledger;
}

function readTokenIndexFor(artifact, field, ctx) {
  const declaredPath = artifact.data[field];
  if (typeof declaredPath !== "string" || declaredPath.trim() === "") {
    return { error: `${artifact.kind} names no ${field} file` };
  }
  const resolved = path.resolve(path.dirname(artifact.path), declaredPath);
  const known = ctx.inputs.tokenDocs.find((document_) => path.resolve(document_.path) === resolved);
  if (known) return { index: known.tokens, path: resolved };
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { error: `${declaredPath} is not a file this run could read` };
  }
  try {
    return { index: readTokens(resolved).tokens, path: resolved };
  } catch (error) {
    return { error: error.message };
  }
}

// The same twelve hex characters §11 rule 3 uses for the registry, over any file. A digest
// is the only thing that lets a later run say what a file was when it was ratified.
function fileDigest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 12);
}

const DIGEST = /^[0-9a-f]{12}$/;

function checkL1(ledger, ctx) {
  const artifacts = ctx.inputs.artifacts;
  ledger.declare("pds-check:l1-artifacts-present", "L1", "the run carries the PDS artifacts a level claim is read from");
  ledger.declare("pds-check:l1-frontmatter-parses", "L1", "every file declaring the spec parses as the canonical frontmatter subset (§2 rule 5)");
  ledger.declare("pds-check:l1-spec-version", "L1", "every artifact declares spec PDS/1.0");
  ledger.declare("pds-check:l1-artifact-kind", "L1", "every file declaring the spec names a kind §2 defines");
  ledger.declare("pds-check:l1-required-fields", "L1", "every artifact carries the fields its kind requires");
  // The findings themselves are raised whether or not a level was claimed; here they only
  // sink the obligation, because a run whose artifacts do not parse has not linted.
  if (ctx.inputs.unparsable.length > 0) ledger.failRecorded("pds-check:l1-frontmatter-parses");
  if (ctx.inputs.untyped.length > 0) ledger.failRecorded("pds-check:l1-artifact-kind");
  if (artifacts.length === 0) {
    ledger.unverified(
      "pds-check:l1-artifacts-present",
      "no PDS artifact among the inputs",
      "pass the run's design artifacts to verify a level claim"
    );
    return;
  }
  for (const artifact of artifacts) {
    if (artifact.spec !== "PDS/1.0") {
      ledger.fail(
        "pds-check:l1-spec-version",
        `declares spec ${artifact.spec || "(none)"} rather than PDS/1.0`,
        "carry the spec version on every artifact from its first commit",
        artifact.path
      );
    }
    const missing = (REQUIRED_FIELDS[artifact.kind] || []).filter((field) => artifact.data[field] === undefined);
    if (missing.length > 0) {
      ledger.fail(
        "pds-check:l1-required-fields",
        `${artifact.kind} is missing ${missing.join(", ")}`,
        "add the field, or state it explicitly as empty; an absent field is a violation, an empty one is not",
        artifact.path
      );
    }
  }
}

function checkL2(ledger, ctx) {
  const artifacts = ctx.inputs.artifacts;
  const directions = byKind(artifacts, "DIRECTION");
  const critiques = byKind(artifacts, "CRITIQUE");
  const verdicts = byKind(artifacts, "VERDICT");
  const contracts = byKind(artifacts, "CONTRACT");
  const audits = byKind(artifacts, "AUDIT");
  const briefs = byKind(artifacts, "DESIGN-BRIEF");
  const gates = gateRecords(artifacts);

  ledger.declare("pds-check:l2-process-order", "L2", "§1's mapping is present: brief, directions, critique, verdict, contract");
  ledger.declare("pds-check:l2-recusal", "L2", "no proposer critiques its own direction");
  ledger.declare("pds-check:l2-assignment", "L2", "each proposer holds the primary-axis position §4 rule 2 assigns it");
  ledger.declare("pds-check:l2-gate-g1", "L2", "no pair of directions converges, and no pair shares a banned-slop signature");
  ledger.declare("pds-check:l2-gate-g2", "L2", "one winner, bounded grafts in the winner's tokens, every violation against the winner answered");
  ledger.declare("pds-check:l2-gate-recorded", "L2", "every §3 transition the run crossed carries a recorded outcome");
  ledger.declare("pds-check:l2-cited-rules", "L2", "every rule id the run cites resolves in the loaded registry");

  for (const [kind, minimum] of [
    ["DESIGN-BRIEF", 1],
    ["DIRECTION", 2],
    ["CRITIQUE", 1],
    ["VERDICT", 1],
    ["CONTRACT", 1]
  ]) {
    const present = byKind(artifacts, kind).length;
    if (present < minimum) {
      ledger.fail(
        "pds-check:l2-process-order",
        `the run shows ${present} ${kind} artifacts where the mapping needs at least ${minimum}`,
        "record every step of the mapping in the Parley phase named for it"
      );
    }
  }

  /*
   * §1 rule 1: each step is performed in the Parley phase named for it and produces the
   * artifact named for it. A presence count says a critique exists; it says nothing about
   * when it was written. A run with its rounds swapped — directions filed in round-02,
   * critiques in round-01 — satisfies every count while inverting the order the level
   * certifies, so the artifacts are read against §1's mapping and not merely tallied.
   */
  for (const [kind, home] of Object.entries(PROCESS_HOMES)) {
    for (const artifact of byKind(artifacts, kind)) {
      if (home.test(artifact.path)) continue;
      ledger.fail(
        "pds-check:l2-process-order",
        `the ${kind} is filed outside §1's mapping, which names it ${home.where}`,
        "file each artifact where §1 maps its step; process order is read from the mapping, never from the order the files happen to be passed in",
        artifact.path
      );
    }
  }

  checkTokenSidecars(ledger, directions);

  // Recusal: a critique must not target the direction its own author proposed. The author is
  // read off the artifact path, never off the `agent` field: §1 names a round's files by
  // agent id, so the path is the one identity the run does not assert about itself, and a
  // proposer writing `agent: someone-else` is exactly the evasion this gate exists to catch.
  // A declared agent that disagrees with the file it is written in fails on its own — the
  // two identities cannot both be right, and a checker that picks one is guessing.
  for (const critique of critiques) {
    const author = agentOf(critique);
    const declared = critique.data.agent === undefined ? "" : String(critique.data.agent).trim();
    if (declared !== "" && normaliseIdentity(declared) !== normaliseIdentity(author)) {
      ledger.fail(
        "pds-check:l2-recusal",
        `the critique declares agent '${declared}' and is filed as '${author}'`,
        "file a critique under the id that wrote it; recusal is decided from the artifact path, never from what the artifact says about itself",
        critique.path
      );
    }
    const targets = Array.isArray(critique.data.targets) ? critique.data.targets.map(String) : [];
    const own = directions.find((direction) => normaliseIdentity(agentOf(direction)) === normaliseIdentity(author));
    if (own && targets.includes(String(own.data.handle))) {
      ledger.fail(
        "pds-check:l2-recusal",
        `${author} critiques its own direction "${own.data.handle}"`,
        "a proposer neither critiques, ranks, scores nor decides its own direction",
        critique.path
      );
    }
    /*
     * The evasion that needs no collision: a proposer files its critique under an id minted
     * from its own — `round-02/claude-1.critique.md` — so the equality above finds no direction
     * and recusal never fires. Impersonating an existing id is the harder route, and it is not
     * the only one. An id minted from a proposer's, critiquing that proposer's own direction,
     * is a self-assessment on its face; §5 rule 2 discards those rather than down-weighting them.
     */
    for (const proposer of directions) {
      const proposerId = normaliseIdentity(agentOf(proposer));
      if (!mintedFrom(normaliseIdentity(author), proposerId)) continue;
      if (!targets.includes(String(proposer.data.handle))) continue;
      ledger.fail(
        "pds-check:l2-recusal",
        `the critique is filed as '${author}', an id minted from the proposer id '${proposerId}', and critiques that proposer's own direction "${proposer.data.handle}"`,
        "file critiques under the participant id the run already records; an id minted from a proposer's own is not a second participant, and recusal cannot be decided from it",
        critique.path
      );
    }
  }

  checkAssignment(ledger, { briefs, directions });
  checkG1(ledger, ctx, { briefs, directions, gates });
  checkG2(ledger, ctx, { directions, critiques, verdicts });

  // A transition the run crossed carries a recorded gate; one it never reached does not.
  const ratified = contracts.length > 0 || Boolean(ctx.contract);
  const crossed = [];
  if (directions.length > 0 && critiques.length > 0) crossed.push(["G1", "between round-01 and round-02"]);
  if (verdicts.length > 0) crossed.push(["G2", "after the graft, before the contract"]);
  if (ratified) crossed.push(["G3", "at token ratification"]);
  if (audits.length > 0) crossed.push(["G4", "at the audit, before a terminal state"]);
  for (const [gate, where] of crossed) {
    const record = gates.get(gate);
    if (!record) {
      ledger.fail(
        "pds-check:l2-gate-recorded",
        `${gate} has no recorded outcome and the run crossed the transition ${where}`,
        "record the gate at the transition named for it, as a gates entry carrying its id and outcome"
      );
      continue;
    }
    const outcome = String(record.entry.outcome === undefined ? "" : record.entry.outcome).trim().toLowerCase();
    if (!GATE_OUTCOMES.has(outcome)) {
      ledger.fail(
        "pds-check:l2-gate-recorded",
        `${gate} records the outcome ${JSON.stringify(String(record.entry.outcome ?? ""))}, which is not pass, fail or abstain`,
        "record one of the three outcomes §3 gives a gate, so a reader can act on it",
        record.path
      );
      continue;
    }
    /*
     * A recorded outcome is a self-report. G1 and G2 are recomputed above; G3 and G4 are
     * recomputed here from the conditions §3 gives them, so a gate recorded `pass` beside
     * findings the same run raised sinks the obligation instead of certifying against them.
     * Before this, `outcome: pass` was the whole of the test and a raw literal or an open
     * quality violation left "verified L2" standing with an empty unmet set.
     */
    if (outcome !== "pass") continue;
    const refuting = gateRefutations(gate, ctx);
    if (refuting.length > 0) {
      ledger.fail(
        "pds-check:l2-gate-recorded",
        `${gate} is recorded pass and this run's own findings refute its conditions: ${refuting.join(", ")}`,
        "record the outcome the evidence supports, or resolve the findings; a gate recorded pass against evidence the same run raised certifies nothing",
        record.path
      );
    }
  }
  // §3 G1: a failed set MUST NOT proceed to critique; G2 fails the graft before the contract.
  for (const [gate, past, what] of [
    ["G1", critiques.length > 0, "the run went on to critique"],
    ["G2", ratified, "the run went on to a contract"]
  ]) {
    const record = gates.get(gate);
    if (!record || !past) continue;
    const outcome = String(record.entry.outcome === undefined ? "" : record.entry.outcome).trim().toLowerCase();
    if (outcome === "fail" || outcome === "abstain") {
      ledger.fail(
        "pds-check:l2-gate-recorded",
        `${gate} is recorded ${outcome} and ${what}`,
        "a gate that did not pass stops the run at its transition; remedy the gate and record the new outcome",
        record.path
      );
    }
  }

  if (!ctx.registry) {
    ledger.unverified(
      "pds-check:l2-cited-rules",
      "the registry is absent, so no rule id the run cites could be resolved",
      "install parley-design, or pass --registry <path to RULES.md>"
    );
  } else if (ctx.unknownCitations.length > 0) {
    ledger.unverified(
      "pds-check:l2-cited-rules",
      `the run cites ${ctx.unknownCitations.length} rule ids the loaded registry does not declare, each listed under UNJUDGEABLE`,
      "cite ids this registry declares, or load the registry that declares them (§10 rule 3)"
    );
  }
}

/*
 * §1's DIVERGE row maps a proposer to two files, not one: `round-01/<agent>.md` together with
 * `<agent>.tokens.json`, and §1 rule 3 resolves the declared path against the directory the
 * DIRECTION sits in. Reading the markdown locations alone left the token half unchecked, so
 * two DIRECTIONs naming one root-level file passed process conformance — one input standing in
 * for two independently authored token proposals, which is the divergence the level certifies.
 * The sidecar is therefore resolved, held to the adjacent name §1 gives it, required to exist,
 * and required to be owned by exactly one DIRECTION.
 */
function checkTokenSidecars(ledger, directions) {
  const id = "pds-check:l2-process-order";
  const owners = new Map();
  for (const direction of directions) {
    const agent = agentOf(direction);
    const sidecar = `${agent}.tokens.json`;
    const declared = direction.data.tokens === undefined ? "" : String(direction.data.tokens).trim();
    if (declared === "") {
      ledger.fail(
        id,
        `the DIRECTION filed as '${agent}' names no token file, and §1 maps its sidecar to ${sidecar} beside it`,
        "name the proposer's own token document; a DIRECTION proposes a token layer as well as a prose one, and an unnamed sidecar is not an empty one",
        direction.path
      );
      continue;
    }
    const home = path.dirname(direction.path);
    const resolved = path.resolve(home, declared);
    const owed = path.resolve(home, sidecar);
    if (resolved !== owed) {
      ledger.fail(
        id,
        `the DIRECTION filed as '${agent}' names the token file ${declared}, and §1 maps its sidecar to ${sidecar} beside it`,
        "name the adjacent <agent>.tokens.json §1 gives the proposer; the path resolves against the DIRECTION's own directory, and one resolving anywhere else is a token layer this run cannot attribute",
        direction.path
      );
    } else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      ledger.fail(
        id,
        `the DIRECTION filed as '${agent}' names ${declared} and this run could read no file there`,
        "commit the proposer's token document beside its DIRECTION; §1 maps the pair together, and a level verified without the token half is verified on a file nobody read",
        direction.path
      );
    }
    const owner = owners.get(resolved);
    if (owner !== undefined) {
      ledger.fail(
        id,
        `the DIRECTIONs filed as '${owner}' and '${agent}' resolve their token files to one path`,
        "give each proposer its own <agent>.tokens.json; one file standing for two proposals replaces two independently authored inputs with one, which is the convergence the divergence step exists to prevent",
        direction.path
      );
      continue;
    }
    owners.set(resolved, agent);
  }
}

function checkAssignment(ledger, { briefs, directions }) {
  const id = "pds-check:l2-assignment";
  const unverified = (why) =>
    ledger.unverified(
      id,
      why,
      "carry the brief's run-id and primary axis, and record what each proposer was assigned, so §4 rule 2 recomputes from the artifacts alone"
    );
  if (briefs.length !== 1) {
    unverified(`the run carries ${briefs.length} DESIGN-BRIEF artifacts, and the assignment is seeded from exactly one`);
    return;
  }
  const brief = briefs[0];
  const runId = typeof brief.data["run-id"] === "string" ? brief.data["run-id"].trim() : "";
  const primaryAxis = brief.data["primary-axis"] === undefined ? "" : String(brief.data["primary-axis"]).trim();
  const axes = brief.data.axes && typeof brief.data.axes === "object" && !Array.isArray(brief.data.axes) ? brief.data.axes : null;
  const enumerated = axes && Array.isArray(axes[primaryAxis]) ? axes[primaryAxis].map(String) : null;
  if (!runId) {
    unverified("the brief declares no run-id, which §4 rule 2 hashes, so the rotation is not reproducible");
    return;
  }
  if (!primaryAxis || !enumerated || enumerated.length === 0) {
    unverified("the brief enumerates no positions on its primary axis, so there is nothing to rotate");
    return;
  }
  if (directions.length === 0) {
    unverified("the run carries no DIRECTION, so no assignment can be compared against one");
    return;
  }
  const proposers = directions.map((direction) => ({ id: agentOf(direction), direction })).sort((a, b) => codepoint(a.id, b.id));
  const distinct = new Set(enumerated);
  if (distinct.size < proposers.length) {
    ledger.fail(
      id,
      `the brief enumerates ${distinct.size} distinct positions on '${primaryAxis}' for ${proposers.length} proposers`,
      "enumerate at least one materially distinct primary position per proposer, or the full route MUST NOT start (§4 rule 2)",
      brief.path
    );
  }
  /*
   * §4 rule 2 gives each proposer a distinct position. Rotating the list as written hands the
   * same position to two proposers as soon as it repeats one — `[flat, flat, layered]` assigns
   * `flat` twice and both DIRECTIONs then record what they were "given", so the obligation
   * reports met while the assignment did the one thing it exists to prevent. The repeat is a
   * defect in the brief, and the rotation is computed over the deduplicated list so the
   * mapping stays reproducible while the brief is fixed.
   */
  if (distinct.size < enumerated.length) {
    ledger.fail(
      id,
      `the brief enumerates '${primaryAxis}' with a position it lists more than once, so the rotation gives one position to more than one proposer`,
      "enumerate each primary position exactly once; §4 rule 2 assigns distinct positions and cannot do that from a list that repeats one",
      brief.path
    );
  }
  const assignment = rotateAssignment(runId, [...distinct]);
  proposers.forEach((proposer, index) => {
    const owed = assignment[index % assignment.length];
    const declared = proposer.direction.data.assigned;
    if (declared === undefined) {
      unverified(`${proposer.id} records no assigned position, so the rotation cannot be compared against it`);
      return;
    }
    if (String(declared).trim() !== owed) {
      ledger.fail(
        id,
        `${proposer.id} is assigned '${owed}' by the seeded rotation and records '${String(declared).trim()}'`,
        "record the position the rotation gives; the rotation is recomputed from the brief, never taken on trust",
        proposer.direction.path
      );
      return;
    }
    const positions = proposer.direction.data.positions;
    const taken = positions && typeof positions === "object" && positions[primaryAxis] !== undefined ? String(positions[primaryAxis]).trim() : null;
    if (taken === null) {
      unverified(`${proposer.id} declares no position on the primary axis '${primaryAxis}'`);
      return;
    }
    const declined = proposer.direction.data.declined;
    const recorded = typeof declined === "string" && declined.trim() !== "";
    if (taken !== owed && !recorded) {
      ledger.fail(
        id,
        `${proposer.id} is assigned '${owed}', takes '${taken}' and records no decline`,
        "record the one-line decline reason §4 rule 3 requires, or take the assigned position",
        proposer.direction.path
      );
    }
  });
}

function checkG1(ledger, ctx, { briefs, directions, gates }) {
  const id = "pds-check:l2-gate-g1";
  const positioned = directions.filter((direction) => direction.data.positions && typeof direction.data.positions === "object");

  /*
   * §2 DESIGN-BRIEF: "The axes are G1's input, and each declared position is checked against
   * them." Counting the union of whatever keys the DIRECTIONs happen to supply makes the
   * proposers the authors of the gate's input: two directions that agree on every brief axis
   * invent one nobody declared, differ on it, and G1's two-axis test is satisfied by a word.
   * So the axes come from the brief, each position is checked against the brief's enumeration,
   * and the difference count runs over the brief's axes alone.
   */
  const brief = briefs.length === 1 ? briefs[0] : null;
  const declared =
    brief && brief.data.axes && typeof brief.data.axes === "object" && !Array.isArray(brief.data.axes)
      ? brief.data.axes
      : null;
  const briefAxes = declared ? Object.keys(declared) : null;
  if (!briefAxes || briefAxes.length === 0) {
    ledger.unverified(
      id,
      `the run carries ${briefs.length} DESIGN-BRIEF artifacts declaring axes, and G1 counts differences on the brief's declared axes alone`,
      "carry exactly one brief enumerating the axes and their positions, so a direction's position can be checked against the set G1 is a gate on"
    );
  } else {
    for (const direction of positioned) {
      const positions = direction.data.positions;
      const handle = String(direction.data.handle);
      for (const axis of Object.keys(positions)) {
        if (briefAxes.includes(axis)) continue;
        ledger.fail(
          id,
          `G1 DISTINCTNESS: '${handle}' declares a position on '${axis}', which the brief does not declare as an axis`,
          "declare positions on the brief's axes; an axis a proposer invents is not one G1 is a gate on, and a difference on it is not distinctness",
          direction.path
        );
      }
      for (const axis of briefAxes) {
        const enumerated = Array.isArray(declared[axis]) ? declared[axis].map(String) : null;
        if (positions[axis] === undefined) {
          ledger.fail(
            id,
            `G1 DISTINCTNESS: '${handle}' declares no position on the brief axis '${axis}'`,
            "declare one position per brief axis; an axis left blank is not a difference and cannot be counted as one",
            direction.path
          );
          continue;
        }
        if (!enumerated) {
          ledger.unverified(
            id,
            `the brief enumerates no positions on '${axis}', so '${handle}' declares a position nothing can be checked against`,
            "enumerate each axis's positions in the brief; §2 DESIGN-BRIEF gives named axes with enumerated positions, never free text",
            brief.path
          );
          continue;
        }
        if (!enumerated.includes(String(positions[axis]).trim())) {
          ledger.fail(
            id,
            `G1 DISTINCTNESS: '${handle}' takes '${String(positions[axis]).trim()}' on '${axis}', which the brief does not enumerate`,
            "take a position the brief enumerates, or amend the brief before the run diverges",
            direction.path
          );
        }
      }
    }
  }

  for (let i = 0; i < positioned.length; i += 1) {
    for (let j = i + 1; j < positioned.length; j += 1) {
      const first = positioned[i];
      const second = positioned[j];
      const axes = briefAxes || new Set([...Object.keys(first.data.positions), ...Object.keys(second.data.positions)]);
      let differing = 0;
      for (const axis of axes) {
        if (String(first.data.positions[axis]) !== String(second.data.positions[axis])) differing += 1;
      }
      const a = String(first.data.handle);
      const b = String(second.data.handle);
      if (differing < 2) {
        ledger.fail(
          id,
          `G1 DISTINCTNESS: directions '${a}' and '${b}' differ on ${differing} declared ${differing === 1 ? "axis" : "axes"}; 2 are required`,
          "re-diverge once with the seeded assignment, or take the ban list, the category-plus-avoidance test and recorded human ratification"
        );
      }
      if (String(first.data.signature || "").trim() === String(second.data.signature || "").trim()) {
        ledger.fail(
          id,
          `G1 DISTINCTNESS: directions '${a}' and '${b}' declare the same Signature`,
          "one of them has not made a decision of its own; re-diverge"
        );
      }
    }
  }
  // The banned-slop signature, recomputed from the ledger G1 is required to record. The ban
  // list is derived from the registry; the signatures are the run's own recorded evidence.
  if (directions.length < 2) return;
  if (!ctx.registry) {
    ledger.unverified(
      id,
      "G1's ban list is derived from the registry's slop rules at T0 ARTIFACT, and the registry is absent",
      "install parley-design, or pass --registry <path to RULES.md>"
    );
    return;
  }
  const banned = banList(ctx.registry);
  const record = gates.get("G1");

  /*
   * What this run itself watched fire against the direction artifacts, taken from its own
   * ban-list findings before any waiver touched them. G1 is a gate on the set of directions,
   * so a suppression scoped at one file is not an answer to what the pair shares.
   *
   * The recorded ledger is a self-report. A self-report the run's own output refutes must
   * never certify, so the sharing test is recomputed here from the findings as well, and a
   * ledger that omits an id this run observed firing is a contradiction rather than a
   * difference of opinion.
   */
  const observed = new Map();
  for (const finding of ctx.banFindings) {
    if (!finding.path) continue;
    const key = path.resolve(finding.path);
    const entries = observed.get(key) || [];
    if (!entries.some((entry) => entry.id === finding.rule && entry.evidence === finding.evidence)) {
      entries.push({ id: finding.rule, evidence: finding.evidence });
    }
    observed.set(key, entries);
  }
  const observedFor = new Map();
  for (const direction of directions) {
    observedFor.set(String(direction.data.handle), observed.get(path.resolve(direction.path)) || []);
  }
  const shareTest = (sets, source, site) => {
    const handles = [...sets.keys()].sort(codepoint);
    for (let i = 0; i < handles.length; i += 1) {
      for (let j = i + 1; j < handles.length; j += 1) {
        const ids = sharedSignature(sets.get(handles[i]), sets.get(handles[j]));
        if (!ids) continue;
        ledger.fail(
          id,
          `G1 DISTINCTNESS: directions '${handles[i]}' and '${handles[j]}' share a banned-slop signature (${ids.join(", ")}) by ${source}`,
          "re-diverge once with the seeded assignment; a shared signature is the set reaching for the same avoided answer",
          site
        );
      }
    }
  };
  shareTest(observedFor, "this run's own ban-list findings", null);

  const recorded = signatureLedger(ctx.inputs.artifacts);
  if (recorded.size === 0) {
    ledger.unverified(
      id,
      "the G1 outcome records no banned-slop signature for the directions, so the sharing test cannot be recomputed",
      "record one g1-signatures entry per direction, empty or not, each fired id written as rule-id=the declared value that evidenced it",
      record ? record.path : null
    );
    return;
  }
  const bySignature = new Map();
  for (const direction of directions) {
    const handle = String(direction.data.handle);
    const entry = recorded.get(handle);
    if (!entry) {
      ledger.unverified(
        id,
        `the G1 outcome records no banned-slop signature for '${handle}'`,
        "record one signature per direction, empty or not; an unrecorded signature is not an empty one",
        record ? record.path : null
      );
      continue;
    }
    for (const fired of entry.entries) {
      if (!banned.has(fired.id)) {
        ledger.fail(
          id,
          `G1 DISTINCTNESS: '${handle}' records '${fired.id}' in its banned-slop signature and the ban list does not carry it`,
          "the ban list is exactly the registry's slop rules at T0 ARTIFACT; record anything else under its own rule id",
          entry.path
        );
      }
    }
    // The ledger against the run's own findings: an id this run watched fire against the
    // direction and the ledger does not carry is a self-report its own output refutes.
    const declaredIds = new Set(entry.entries.map((fired) => fired.id));
    for (const fired of observedFor.get(handle) || []) {
      if (declaredIds.has(fired.id)) continue;
      ledger.fail(
        id,
        `G1 DISTINCTNESS: the recorded signature for '${handle}' omits '${fired.id}', which this run's own findings show firing against it`,
        "record the signature the run observed, empty or not; a gate recorded against evidence the same run contradicts certifies nothing",
        entry.path
      );
    }
    bySignature.set(handle, entry.entries.filter((fired) => banned.has(fired.id)));
  }
  shareTest(bySignature, "the recorded signatures", record ? record.path : null);
}

function checkG2(ledger, ctx, { directions, critiques, verdicts }) {
  const id = "pds-check:l2-gate-g2";
  const dispositions = new Set(["accepted", "rejected", "waived"]);
  for (const verdict of verdicts) {
    const outcome = verdict.data.outcome;
    const names = outcome && typeof outcome === "object" && !Array.isArray(outcome) ? Object.keys(outcome) : [];
    const wellFormed = names.length === 1 && (names[0] === "winner" || names[0] === "abstain");
    if (!wellFormed) {
      ledger.fail(
        id,
        "G2 COHERENCE: the outcome is neither exactly one winner nor an abstain",
        "select one direction whole, or abstain with a reason; a ranking is not an outcome",
        verdict.path
      );
    }
    const grafts = Array.isArray(verdict.data.grafts) ? verdict.data.grafts : [];
    if (grafts.length > 3) {
      ledger.fail(
        id,
        `G2 COHERENCE: the verdict takes ${grafts.length} grafts, above the bound of three`,
        "drop the grafts that are not load-bearing",
        verdict.path
      );
    }
    for (const graft of grafts) {
      if (graft === null || typeof graft !== "object" || !graft.from || !graft.part || !graft.as) {
        ledger.fail(
          id,
          "G2 COHERENCE: a graft does not name its source, its part and the winner token it is re-expressed in",
          "name all three, or drop the graft",
          verdict.path
        );
      }
    }
    const winner = wellFormed && names[0] === "winner" ? String(outcome.winner) : null;
    if (!winner) continue;
    const direction = directions.find((candidate) => String(candidate.data.handle) === winner);
    if (!direction) {
      ledger.unverified(
        id,
        `the verdict names '${winner}' as the winner and the run carries no DIRECTION with that handle`,
        "pass the winning direction, so the grafts can be read against the tokens they must be re-expressed in",
        verdict.path
      );
    } else {
      // A graft MUST NOT modify the winner's token file: every graft names a token the
      // winner already declares, or it is a token this run added on the winner's behalf.
      const tokens = readTokenIndexFor(direction, "tokens", ctx);
      const named = grafts.filter((graft) => graft && typeof graft === "object" && graft.as).map((graft) => graft);
      /*
       * §3 G2's first conjunct, which no re-expression test can reach: a graft that adds its
       * token to the winner's file re-expresses perfectly and has still modified the file the
       * contract ratifies. The ratified state is identified by the digest the VERDICT records
       * (§2 VERDICT, tokens-digest); the file is re-read here and compared with it. Without a
       * recorded digest there is nothing to compare and the conjunct is unverified — never
       * met, because a level verified on a comparison nobody made is the certificate this
       * checker exists to refuse.
       */
      const declaredDigest = verdict.data["tokens-digest"] === undefined ? "" : String(verdict.data["tokens-digest"]).trim();
      const unreadable = tokens.path ? tokens.error || null : tokens.error || "the DIRECTION resolves it to no path";
      if (unreadable) {
        // One line: both halves of the conjunct rest on the same file, and reporting the same
        // absence twice reads as two problems.
        ledger.unverified(
          id,
          `the winner's token file could not be read, so neither the ratified digest nor any graft could be checked against it: ${unreadable}`,
          "pass the winner's token document, or name it on the DIRECTION as PDS requires",
          direction.path
        );
      } else {
        if (!DIGEST.test(declaredDigest)) {
          ledger.unverified(
            id,
            "the verdict records no twelve-character tokens-digest, so a modification to the winner's token file cannot be detected",
            "record the first twelve hex characters of sha256 over the winner's token file as ratified, so G2 can compare the file against it",
            verdict.path
          );
        } else {
          const actual = fileDigest(tokens.path);
          if (actual !== declaredDigest) {
            ledger.fail(
              id,
              `G2 COHERENCE: the winner's token file digests ${actual} and the verdict ratified ${declaredDigest}, so a graft modifies the winner's token file`,
              "re-express every graft in a token the winner already declares and restore the ratified file, or re-ratify the tokens and record the new digest",
              tokens.path
            );
          }
        }
        for (const graft of named) {
          const target = String(graft.as).trim();
          if (!tokens.index.has(target)) {
            ledger.fail(
              id,
              `G2 COHERENCE: graft '${String(graft.part)}' from '${String(graft.from)}' is re-expressed as '${target}', which the winner's tokens do not declare`,
              "re-express it in an existing winner token, or drop the graft; a graft never modifies the winner's token file",
              verdict.path
            );
          }
        }
      }
    }
    /*
     * The work a waived answer has to excuse. A finding answered here was recorded against the
     * winner, so the narrowest scope that covers it (§8 rule 3) is the winner's own DIRECTION or
     * the token file that DIRECTION names — nothing else in the run is the work the critique
     * targets. Empty only where the winner's DIRECTION is not among the inputs, which the
     * unverified above already reports.
     */
    const covered = [];
    if (direction) {
      covered.push(direction.path);
      const declaredTokens = direction.data.tokens;
      if (typeof declaredTokens === "string" && declaredTokens.trim() !== "") {
        covered.push(path.resolve(path.dirname(direction.path), declaredTokens));
      }
    }
    // Every VIOLATION recorded against the winner is answered: accepted, rejected with a
    // reason, or waived. An unanswered violation is the condition G2 exists to catch.
    const answers = Array.isArray(verdict.data.answers) ? verdict.data.answers : [];
    const answered = new Set();
    for (const answer of answers) {
      if (answer === null || typeof answer !== "object" || answer["rule-id"] === undefined) {
        ledger.fail(
          id,
          "G2 COHERENCE: an answer names no rule id",
          "answer each open finding by its rule id",
          verdict.path
        );
        continue;
      }
      const disposition = String(answer.disposition === undefined ? "" : answer.disposition).trim().toLowerCase();
      if (!dispositions.has(disposition)) {
        ledger.fail(
          id,
          `G2 COHERENCE: the answer to '${String(answer["rule-id"])}' is disposed ${JSON.stringify(String(answer.disposition ?? ""))}, which is not accepted, rejected or waived`,
          "dispose every answer as accepted, rejected with a reason, or waived",
          verdict.path
        );
        continue;
      }
      if (disposition === "rejected" && String(answer.reason === undefined ? "" : answer.reason).trim() === "") {
        ledger.fail(
          id,
          `G2 COHERENCE: the answer to '${String(answer["rule-id"])}' is rejected with no reason`,
          "give the reason the rejection rests on; a rejection nobody can read is a suppression",
          verdict.path
        );
      }
      // `waived` is not an answer, it is a reference to one. §8 puts every waiver in the
      // single file the contract names, with a grantor, an independent counter-signer, an
      // unexpired date and a scope no wider than the work; a disposition that resolves to no
      // such entry is a violation the verdict answered with a word.
      if (disposition === "waived") {
        const ruleId = String(answer["rule-id"]).trim();
        const named = ctx.waivers
          ? ctx.waivers.valid.filter((entry) => String(entry["rule-id"]).trim() === ruleId)
          : [];
        if (!ctx.registry) {
          ledger.unverified(
            id,
            `the answer to '${ruleId}' is disposed waived and the registry is absent, so no waiver could be validated against a rule`,
            "install parley-design, or pass --registry <path to RULES.md>",
            verdict.path
          );
        } else if (!ctx.waivers) {
          ledger.unverified(
            id,
            `the answer to '${ruleId}' is disposed waived and this run resolved no waiver file, so the waiver it rests on was never read`,
            "name the single waiver file on the contract, or pass it with --waivers; a waived answer is read against the file, never asserted",
            verdict.path
          );
        } else if (named.length === 0) {
          ledger.fail(
            id,
            `G2 COHERENCE: the answer to '${ruleId}' is disposed waived and the waiver file carries no valid entry for it`,
            "record a counter-signed waiver with a narrow scope and an expiry, or accept the finding or reject it with a reason (§8)",
            ctx.waivers.path
          );
        } else if (
          covered.length > 0 &&
          !named.some((entry) =>
            covered.some((target) =>
              waiverMatches(entry, { rule: entry["rule-id"], absolutePath: target }, ctx.waivers.context)
            )
          )
        ) {
          /*
           * A rule id is not a waiver. §8 rule 3 requires the narrowest scope covering the work,
           * and a scope that resolves to neither the winner's DIRECTION nor the token file it
           * names bears on no part of the answered finding — it excuses something else, or
           * nothing at all. The path test is `waiverMatches`, the same one a detector finding is
           * resolved by, so a scope cannot mean one thing here and another there.
           */
          ledger.fail(
            id,
            `G2 COHERENCE: the answer to '${ruleId}' is disposed waived and every valid entry for it scopes outside the winner's work`,
            "scope the waiver at the work the finding is against: the winner's DIRECTION, or the token file that DIRECTION names, so the narrowest scope covers it (§8 rule 3)",
            ctx.waivers.path
          );
        }
      }
      answered.add(String(answer["rule-id"]).trim());
    }
    const open = new Set();
    for (const critique of critiques) {
      const targets = Array.isArray(critique.data.targets) ? critique.data.targets.map(String) : [];
      if (!targets.includes(winner)) continue;
      const findings = Array.isArray(critique.data.findings) ? critique.data.findings : [];
      for (const finding of findings) {
        if (finding === null || typeof finding !== "object") continue;
        if (String(finding.verdict || "").trim().toUpperCase() !== "VIOLATION") continue;
        if (finding["rule-id"] !== undefined) open.add(String(finding["rule-id"]).trim());
      }
    }
    for (const ruleId of [...open].sort(codepoint)) {
      if (answered.has(ruleId)) continue;
      ledger.fail(
        id,
        `G2 COHERENCE: '${ruleId}' is recorded VIOLATION against the winner '${winner}' and the verdict answers it nowhere`,
        "accept it, reject it with a reason, or waive it; an unanswered violation against the winner fails the gate",
        verdict.path
      );
    }
  }
}

/*
 * §3 G3's token-integrity conjuncts over the merged token graph, returned as problems rather
 * than written straight to a ledger: L3's obligations and the G3 gate recomputation are two
 * readings of one list, and a gate that disagreed with the level about the same token file
 * would be two answers to one question.
 */

/*
 * Alias direction, as §3 G3 defines it. A token document that names its tiers by group states
 * which way a reference may point: a component may reach a semantic, a semantic may reach a
 * primitive, and a primitive is the floor — it holds a value, never another primitive.
 * A document naming none of these groups declares no tiers and the conjunct is vacuous, which
 * is why this reads the group name and never guesses a tier from the shape of a value.
 */
const TIER_GROUPS = { primitive: 0, primitives: 0, semantic: 1, semantics: 1, component: 2, components: 2 };
const TIER_NAMES = ["primitive", "semantic", "component"];

function tierOfToken(tokenPath) {
  const head = String(tokenPath).split(".")[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIER_GROUPS, head) ? TIER_GROUPS[head] : null;
}

function tokenProblems(tokenDocs) {
  const problems = [];
  const index = mergeTokens(tokenDocs);
  const raise = (obligation, violation, remedy, site) => problems.push({ obligation, violation, remedy, site });
  for (const token of [...index.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (typeof token.type !== "string" || token.type.trim() === "") {
      raise(
        "pds-check:l3-token-document",
        `${token.path} declares no $type, directly or from its group`,
        "type the token, or type the group it sits in; an untyped leaf is not a DTCG token",
        token.file
      );
    }
    const target = aliasTarget(token.value);
    const resolved = resolveValue(index, token.path);
    if (target && resolved.error) {
      raise(
        "pds-check:l3-alias-resolves",
        `${token.path} aliases ${target}: ${resolved.error}`,
        "point the alias at a declared token, and break any cycle by making one end a value",
        token.file
      );
      continue;
    }
    if (target) {
      const from = tierOfToken(token.path);
      const to = tierOfToken(target);
      if (from !== null && to !== null && to > from) {
        raise(
          "pds-check:l3-alias-direction",
          `${token.path} is a ${TIER_NAMES[from]} and aliases ${target}, which is a ${TIER_NAMES[to]}`,
          "point the alias down the tiers §3 G3 names; a lower tier that reaches up inverts the layer the token file exists to have",
          token.file
        );
      } else if (from !== null && to !== null && to === from) {
        /*
         * §3 G3 orders references down `primitive`, `semantic`, `component`, and sideways is
         * not down: a same-tier edge descends nothing and leaves a cycle inside one tier
         * structurally possible. Only the primitive floor was tested before, so
         * `semantic.medium -> {semantic.small}` resolved, reported the obligation met and
         * certified L3. The requirement is `targetTier < sourceTier` at every tier.
         */
        raise(
          "pds-check:l3-alias-direction",
          `${token.path} is a ${TIER_NAMES[from]} and aliases the ${TIER_NAMES[to]} ${target}`,
          from === 0
            ? "give the primitive its own value; a primitive is the floor of the token graph and never references another"
            : `give the token its own value, or point it at a lower tier; §3 G3 has a reference descend the tier order, and one ${TIER_NAMES[from]} reaching another descends nothing`,
          token.file
        );
      }
    }
    if (token.type !== "color" || resolved.error) continue;
    const value = resolved.value;
    const space = value !== null && typeof value === "object" && !Array.isArray(value) ? value.colorSpace : undefined;
    if (typeof space !== "string" || space.trim() === "") {
      raise(
        "pds-check:l3-colour-space",
        `${token.path} declares no colorSpace on the value it resolves to`,
        "declare the space the value is in; a bare literal is computable and states nothing about the space it was chosen in",
        token.file
      );
    }
    const srgb = toSrgb(value);
    if (srgb.error) {
      raise(
        "pds-check:l3-colour-computable",
        `${token.path}: ${srgb.error}`,
        "give a value the target can display, in a space this checker can compute",
        token.file
      );
    }
  }
  return problems;
}

/**
 * What this run's own findings say about a gate recorded `pass`. §3 G3 is the token layer's
 * integrity — the system rules the level already reads it as, plus the token-graph conjuncts;
 * §3 G4 is the absence of an unresolved `quality` violation, which is read after waivers
 * because a validly waived finding is not an open one.
 */
function gateRefutations(gate, ctx) {
  const refuting = [];
  const openRules = (className) =>
    [...ctx.registry.rules.values()]
      .filter((rule) => rule.class === className)
      .filter((rule) => rule.surface === "core" || rule.surface === ctx.surface)
      .filter((rule) => ctx.outcomes.get(rule.id) === "VIOLATION")
      .map((rule) => rule.id)
      .sort(codepoint);
  if (gate === "G3") {
    if (ctx.registry) refuting.push(...openRules("system"));
    if (ctx.inputs.tokenDocs.length > 0) {
      refuting.push(...[...new Set(tokenProblems(ctx.inputs.tokenDocs).map((problem) => problem.obligation))].sort(codepoint));
    }
  }
  if (gate === "G4" && ctx.registry) refuting.push(...openRules("quality"));
  return refuting;
}

function checkL3(ledger, ctx) {
  ledger.declare("pds-check:l3-token-document", "L3", "the run carries a DTCG token document, every token typed");
  ledger.declare("pds-check:l3-alias-resolves", "L3", "every alias resolves to a declared token, with no cycle");
  ledger.declare("pds-check:l3-alias-direction", "L3", "every alias points down the tiers a token document names");
  ledger.declare("pds-check:l3-colour-space", "L3", "every colour token declares the space its value is in");
  ledger.declare("pds-check:l3-colour-computable", "L3", "every colour token computes to a value the target can display");
  ledger.declare("pds-check:l3-system-rules", "L3", "the system rules G3 names were decided against real source, and came back clean");

  if (ctx.inputs.tokenDocs.length === 0) {
    ledger.unverified(
      "pds-check:l3-token-document",
      "no token document among the inputs",
      "pass the ratified token file to verify token integrity"
    );
  } else {
    for (const problem of tokenProblems(ctx.inputs.tokenDocs)) {
      ledger.fail(problem.obligation, problem.violation, problem.remedy, problem.site);
    }
  }

  if (!ctx.registry) {
    ledger.unverified(
      "pds-check:l3-system-rules",
      "the registry is absent, so the rules G3 names were never run",
      "install parley-design so the rule checks can run, or verify G3 by hand"
    );
    return;
  }
  const relevant = [...ctx.registry.rules.values()]
    .filter((rule) => rule.class === "system")
    .filter((rule) => rule.surface === "core" || rule.surface === ctx.surface)
    .filter((rule) => tierRank(rule.tier) <= tierRank(CAPABLE_TIERS[CAPABLE_TIERS.length - 1]))
    .filter((rule) => ctx.implemented.has(rule.id))
    .sort((a, b) => codepoint(a.id, b.id));
  if (relevant.length === 0) {
    ledger.unverified(
      "pds-check:l3-system-rules",
      "the loaded registry declares no system rule this checker can decide, so G3 rests on nothing it ran",
      "load the registry whose system rules the contract ratified"
    );
    return;
  }
  for (const rule of relevant) {
    const outcome = ctx.outcomes.get(rule.id) || "UNJUDGEABLE";
    if (outcome === "UNJUDGEABLE") {
      ledger.unverified(
        "pds-check:l3-system-rules",
        `${rule.id} was not decided in this run, so the token layer's integrity rests on evidence nobody obtained`,
        "pass the source the rule is decided from; a level claim is not verified by the absence of its evidence"
      );
    } else if (outcome !== "PASS") {
      ledger.fail(
        "pds-check:l3-system-rules",
        `${rule.id} is open against the ratified system`,
        "resolve it, or record a counter-signed waiver with a narrow scope and an expiry (§8)"
      );
    }
  }
}

/* -------------------------------------------------------------- the run */

function relative(target, cwd) {
  const rel = path.relative(cwd, target);
  return rel === "" ? path.basename(target) : rel;
}

// One separator, used in exactly one place, so a reader and a script split a finding the
// same way.
const SEPARATOR = " — ";

function formatFinding(finding) {
  return `${finding.rule}${SEPARATOR}${finding.violation}${SEPARATOR}${finding.remedy}`;
}

/**
 * Run the checker. Returns a report; it throws only when the run itself cannot proceed.
 */
function runCheck(options) {
  const cwd = options.cwd || process.cwd();
  const now = options.now === undefined ? Date.now() : options.now;
  const detectors = loadDetectors(options.detectorsDir);
  const capability = capabilityOf(detectors);
  const byRule = new Map(detectors.map((detector) => [detector.rule, detector]));

  const inputs = collectInputs(options.paths);
  const contract = options.contractPath
    ? readArtifact(path.resolve(options.contractPath))
    : inputs.artifacts.find((artifact) => artifact.kind === "CONTRACT") || null;
  if (options.contractPath && (!contract || contract.kind !== "CONTRACT")) {
    throw new CheckError(`${options.contractPath}: not a CONTRACT artifact`);
  }
  // A contract naming a token file pulls it in, so checking source alone still knows the
  // ratified set rather than reporting every reference as undeclared.
  // The same empty-path reading as the waiver field below: `tokens: ""` resolves to the
  // contract's own directory, and reading a directory as a token document is a crash, not a
  // finding about the design.
  if (contract && typeof contract.data.tokens === "string" && contract.data.tokens.trim() !== "") {
    const tokenPath = path.resolve(path.dirname(contract.path), contract.data.tokens);
    const known = inputs.tokenDocs.some((document_) => path.resolve(document_.path) === tokenPath);
    if (!known && fs.existsSync(tokenPath) && fs.statSync(tokenPath).isFile()) inputs.tokenDocs.push(readTokens(tokenPath));
  }
  const tokenIndex = mergeTokens(inputs.tokenDocs);

  const surface = options.surface || (inputs.styles.length + inputs.markup.length > 0 ? "web" : "core");

  const report = {
    implements: "PDS/1.0",
    kind: "AUDIT",
    "generated-by": "parley-design-check",
    surface,
    registry: null,
    capability,
    tiers: {
      requested: CAPABLE_TIERS.map(tierWord),
      executed: capability.tiers,
      unavailable: ["T2", "T3"].map(tierWord)
    },
    inputs: {
      artifacts: inputs.artifacts.map((artifact) => relative(artifact.path, cwd)),
      tokens: inputs.tokenDocs.map((document_) => relative(document_.path, cwd)),
      styles: inputs.styles.map((style) => relative(style.path, cwd)),
      markup: inputs.markup.map((source) => relative(source.path, cwd)),
      "not-inspected": inputs.notInspected.map((entry) => `${relative(entry.path, cwd)} (${entry.reason})`),
      unparsable: inputs.unparsable.map((entry) => `${relative(entry.path, cwd)} (${entry.reason})`),
      unreadable: inputs.unreadable.map((entry) => `${relative(entry.path, cwd)} (${entry.reasons.join("; ")})`),
      "invalid-kind": inputs.untyped.map((entry) => `${relative(entry.path, cwd)} (kind ${entry.kind})`)
    },
    contract: contract ? relative(contract.path, cwd) : null,
    level: null,
    findings: [],
    "findings-detail": [],
    unjudgeable: [],
    "out-of-scope": [],
    "waivers-applied": [],
    "waiver-errors": [],
    notes: [],
    counts: {},
    verdict: "PASS",
    exit: 0
  };

  /* registry */
  const resolution = resolveRegistryPath({
    explicit: options.registryPath,
    env: options.registryEnv,
    addonRoot: options.addonRoot,
    cwd
  });
  let registry = null;
  if (resolution.path) {
    registry = loadRegistry(resolution.path);
    report.registry = {
      status: "loaded",
      path: relative(registry.path, cwd),
      version: registry.version,
      digest: registry.digest,
      files: registry.files.map((file) => ({ path: relative(file.path, cwd), digest: file.digest })),
      "declared-without-record": registry.missingRecords,
      warnings: registry.warnings
    };
    const declaredDigest = declaredRegistryDigest(registry.dir);
    if (declaredDigest && declaredDigest !== registry.digest) {
      report.notes.push(
        `registry-digest mismatch: the spec declares ${declaredDigest}, the registry file computes ${registry.digest}`
      );
    }
  } else {
    report.registry = {
      status: "absent",
      path: null,
      refused: "rule checks were refused: no parley-design registry was found and this checker carries no copy of one",
      searched: resolution.tried.map((candidate) => relative(candidate, cwd))
    };
  }

  /* rules */
  const detectorErrors = [];
  if (registry) {
    for (const rule of [...registry.rules.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (rule.surface !== "core" && rule.surface !== surface) {
        report["out-of-scope"].push(`${rule.id} — surface ${rule.surface}, this run targets ${surface}`);
        continue;
      }
      const unjudgeable = (reason, remedy) => {
        report.unjudgeable.push({ rule: rule.id, verdict: "UNJUDGEABLE", violation: reason, remedy });
      };
      if (tierRank(rule.tier) > tierRank(CAPABLE_TIERS[CAPABLE_TIERS.length - 1])) {
        unjudgeable(
          `${tierWord(rule.tier)} evidence is above this checker, which reaches ${capability.tiers.join(" and ")}`,
          "obtain evidence at that tier and judge the rule there; a checker without it cannot report a pass"
        );
        continue;
      }
      if (rule.enforcedBy === "agent-judgement") {
        unjudgeable(
          "the registry enforces this rule by agent judgement, not by a detector",
          "judge it in review and record the finding in the same three-part form"
        );
        continue;
      }
      const detector = byRule.get(rule.id);
      if (!detector) {
        unjudgeable(
          "no detector implements this rule in this checker",
          "judge it by hand, or add a detector; a rule the registry marks checkable and the checker cannot see is never reported as passing"
        );
        continue;
      }
      if (rule.class === "system" && !contract) {
        unjudgeable(
          "a system rule is meaningless before ratification and no CONTRACT was given",
          "pass the contract with --contract, or include it among the paths"
        );
        continue;
      }
      const missingInput = detector.inputs.find((kind) => {
        if (kind === "artifacts") return inputs.artifacts.length === 0;
        if (kind === "tokens") return tokenIndex.size === 0;
        if (kind === "styles") return inputs.styles.length === 0;
        if (kind === "markup") return inputs.markup.length === 0;
        throw new CheckError(`detector ${detector.name} declares the unknown input kind ${kind}`);
      });
      if (missingInput) {
        unjudgeable(
          `no ${missingInput} among the inputs`,
          `pass the ${missingInput} this rule is decided from`
        );
        continue;
      }
      /*
       * A source the scanner could not tokenise is not a source this rule was decided against.
       * The detector still runs — what was read is still evidence, and a violation found in the
       * readable part is a real one — but the rule can no longer report a clean pass over the
       * file, because the declarations the scanner lost are exactly the ones a hole in this
       * family hides. This is the part that does not need the next construct to be found first.
       */
      if (detector.inputs.includes("styles")) {
        for (const entry of inputs.unreadable) {
          unjudgeable(
            `${relative(entry.path, cwd)} could not be tokenised, so this rule was decided on a partial reading of it: ${entry.reasons.join("; ")}`,
            "fix the source so it tokenises, or judge the rule by hand against the file as written; a file the scanner could not read is never reported as clean"
          );
        }
      }
      let results;
      try {
        results = detector.run({
          rule,
          artifacts: inputs.artifacts,
          tokenDocs: inputs.tokenDocs,
          tokenIndex,
          styles: inputs.styles,
          markup: inputs.markup,
          contract,
          registry
        });
      } catch (error) {
        detectorErrors.push(`${detector.name}: ${error.message}`);
        continue;
      }
      for (const result of results || []) {
        if (!VERDICTS.includes(result.verdict)) {
          detectorErrors.push(`${detector.name} returned the unknown verdict ${result.verdict}`);
          continue;
        }
        if (!result.violation || !result.remedy) {
          detectorErrors.push(`${detector.name} returned a result without both a violation and a remedy`);
          continue;
        }
        if (result.verdict === "UNJUDGEABLE") {
          report.unjudgeable.push({
            rule: rule.id,
            verdict: "UNJUDGEABLE",
            violation: result.violation,
            remedy: result.remedy
          });
          continue;
        }
        report["findings-detail"].push({
          rule: rule.id,
          verdict: result.verdict,
          class: rule.class,
          severity: rule.severity,
          tier: tierWord(rule.tier),
          "system-blind": rule.systemBlind,
          path: result.path ? relative(result.path, cwd) : null,
          absolutePath: result.path || null,
          // The declared value that evidenced the finding, where the detector can name one.
          // G1's sharing test is defined over exactly that value, so a detector that knows it
          // says so rather than leaving the gate to re-derive it from a prose violation.
          evidence: typeof result.evidence === "string" && result.evidence.trim() !== "" ? result.evidence.trim() : null,
          line: result.line || 0,
          violation: result.violation,
          remedy: result.remedy
        });
      }
    }
  }

  /* cited rule ids: §10 rule 3 says an unknown id is UNJUDGEABLE, never dropped */
  const unknownCitations = [];
  if (registry) {
    for (const { id, artifact } of citedRuleIds(inputs.artifacts)) {
      if (registry.rules.has(id)) continue;
      if (unknownCitations.some((entry) => entry.id === id && entry.path === artifact.path)) continue;
      unknownCitations.push({ id, path: artifact.path });
      report.unjudgeable.push({
        rule: id,
        verdict: "UNJUDGEABLE",
        violation: `cited by ${relative(artifact.path, cwd)}, and the loaded registry does not declare it`,
        remedy: "load the registry that declares the id, or cite one this registry carries; an unknown id is never a pass"
      });
    }
  }

  /*
   * The ban-list findings this run produced, taken before waivers touch them. G1 is a gate on
   * the whole set of directions; a waiver scoped at one file excuses a finding at that file
   * and says nothing about what two directions share, so laundering the gate through a waiver
   * is not a route this checker leaves open.
   */
  const banned = registry ? banList(registry) : new Set();
  const banFindings = report["findings-detail"]
    .filter((finding) => finding.verdict === "VIOLATION" && banned.has(finding.rule))
    .map((finding) => ({ rule: finding.rule, path: finding.absolutePath, evidence: finding.evidence }));

  /* waivers, before conformance: a finding a valid waiver suppressed is not an open one */
  let waivers = null;
  let validWaivers = null;
  // §2 rule 3: empty is not absent — and `waivers: ""` is a value the canonical frontmatter
  // subset publishes. Resolving it gives the contract's own directory, which every existence
  // test passes and every reader crashes on. An empty path names no file, so it is read as
  // one: the field is present, it points nowhere, and the run continues.
  const declaredWaivers =
    contract && typeof contract.data.waivers === "string" && contract.data.waivers.trim() !== ""
      ? path.resolve(path.dirname(contract.path), contract.data.waivers)
      : null;
  const waiverPath = options.waiversPath || declaredWaivers;
  const waiverFileReadable = Boolean(waiverPath) && fs.existsSync(waiverPath) && fs.statSync(waiverPath).isFile();
  if (waiverFileReadable) {
    waivers = loadWaivers(waiverPath);
  } else if (options.waiversPath) {
    throw new CheckError(`no such waiver file: ${options.waiversPath}`);
  }
  /*
   * A contract that names a waiver file resolving to no readable file. Naming no file and naming
   * a file that is not there are two different states, and only the first is "this run has no
   * waivers": the second is a contract pointing at something nobody can read, and reading it as
   * the first meant a `waived` answer resolved against a file that was never opened, silently.
   * The silent path is the one this checker exists to refuse, so it is reported — and reported
   * whether or not a level was claimed, because the defect is in the contract, not in a claim.
   */
  if (declaredWaivers && !waiverFileReadable && !options.waiversPath) {
    report["findings-detail"].push({
      rule: "pds-check:l2-process-order",
      verdict: "VIOLATION",
      class: "conformance",
      severity: 4,
      tier: tierWord("T0"),
      "system-blind": false,
      path: relative(contract.path, cwd),
      absolutePath: contract.path,
      line: 0,
      violation: `names the waiver file ${contract.data.waivers}, which resolves to ${relative(declaredWaivers, cwd)} and is not a readable file`,
      remedy: "write the waiver file the contract names, or clear the field; a named file nobody can read is not the same state as no file named, and this run will not read it as one"
    });
  }
  if (waivers) {
    const systemPaths = [];
    if (contract) {
      systemPaths.push(contract.path);
      if (typeof contract.data.tokens === "string" && contract.data.tokens.trim() !== "") {
        systemPaths.push(path.resolve(path.dirname(contract.path), contract.data.tokens));
      }
    }
    const waiverContext = {
      now,
      systemPaths,
      cwd,
      waiverDir: path.dirname(waivers.path),
      participants: runParticipants(inputs.artifacts),
      corroborated: corroboratedIdentities(inputs.artifacts)
    };
    const valid = [];
    for (const entry of waivers.entries) {
      const rule = registry && entry && typeof entry === "object" ? registry.rules.get(entry["rule-id"]) : null;
      const problem = registry
        ? waiverProblem(entry, rule, waiverContext)
        : "the registry is absent, so no waiver can be validated against a rule";
      if (problem) {
        report["waiver-errors"].push(
          `${relative(waivers.path, cwd)}: ${problem}${entry && entry["rule-id"] ? ` (${entry["rule-id"]})` : ""}`
        );
        continue;
      }
      valid.push(entry);
    }
    // The context travels with the valid entries: a `waived` answer is resolved by the same
    // path test a detector finding is, and one scope reading in this file is the only way the
    // two can be held to the same standard.
    validWaivers = { path: waivers.path, valid, context: waiverContext };
    const kept = [];
    for (const finding of report["findings-detail"]) {
      const waiver =
        finding.verdict === "VIOLATION" ? valid.find((entry) => waiverMatches(entry, finding, waiverContext)) : null;
      if (!waiver) {
        kept.push(finding);
        continue;
      }
      report["waivers-applied"].push(
        `${finding.rule} at ${finding.path} — expires ${waiver.expiry}, granted by ${waiver["granted-by"]}, counter-signed by ${waiver["counter-signed-by"]}`
      );
    }
    report["findings-detail"] = kept;
  }

  /* an unparsable artifact is a finding whether or not a level was claimed */
  for (const entry of inputs.unparsable) {
    report["findings-detail"].push({
      rule: "pds-check:l1-frontmatter-parses",
      verdict: "VIOLATION",
      class: "conformance",
      severity: 4,
      tier: tierWord("T0"),
      "system-blind": false,
      path: relative(entry.path, cwd),
      absolutePath: entry.path,
      line: 0,
      violation: `declares spec PDS/1.0 and its frontmatter is outside the canonical subset: ${entry.reason}`,
      remedy: "write the frontmatter in the subset §2 rule 5 publishes; a candidate artifact that does not parse is reported, never dropped"
    });
  }

  /* a candidate whose kind PDS does not define is a broken artifact, never a stranger */
  for (const entry of inputs.untyped) {
    report["findings-detail"].push({
      rule: "pds-check:l1-artifact-kind",
      verdict: "VIOLATION",
      class: "conformance",
      severity: 4,
      tier: tierWord("T0"),
      "system-blind": false,
      path: relative(entry.path, cwd),
      absolutePath: entry.path,
      line: 0,
      violation: `declares spec PDS/1.0 and names the kind ${entry.kind}, which §2 does not define`,
      remedy: `name one of the kinds §2 defines: ${ARTIFACT_KINDS.join(", ")}; a candidate artifact with a broken type is reported, never demoted to a file nobody inspected`
    });
  }

  /* conformance */
  if (options.level) {
    const claimed = options.level.toUpperCase();
    const order = ["L1", "L2", "L3", "L4"];
    if (!order.includes(claimed)) throw new CheckError(`unknown level ${options.level}`);
    const ledger = conformanceLedger();
    const ctx = {
      inputs,
      registry,
      surface,
      contract,
      unknownCitations,
      implemented: new Set(byRule.keys()),
      outcomes: ruleOutcomes(report, registry, surface),
      banFindings,
      waivers: validWaivers
    };
    checkL1(ledger, ctx);
    if (order.indexOf(claimed) >= 1) checkL2(ledger, ctx);
    if (order.indexOf(claimed) >= 2) checkL3(ledger, ctx);
    if (claimed === "L4") {
      ledger.declare("pds-check:l4-rendered", "L4", "the applied interface passes the rendered-tier quality rules");
      ledger.unverified(
        "pds-check:l4-rendered",
        "L4 asserts the applied interface passes the rendered-tier rules, and this checker obtains no rendered evidence",
        "verify L4 with a runtime that renders the interface; a claim whose evidence tier was unavailable is not verified here"
      );
    }
    for (const problem of ledger.problems) {
      if (problem.verdict === "UNJUDGEABLE") {
        report.unjudgeable.push({
          rule: problem.rule,
          verdict: "UNJUDGEABLE",
          violation: problem.violation,
          remedy: problem.remedy
        });
        continue;
      }
      report["findings-detail"].push({
        rule: problem.rule,
        verdict: problem.verdict,
        class: "conformance",
        severity: 4,
        tier: tierWord("T0"),
        "system-blind": false,
        path: problem.path ? relative(problem.path, cwd) : null,
        absolutePath: problem.path || null,
        line: 0,
        violation: problem.violation,
        remedy: problem.remedy
      });
    }
    const obligations = [...ledger.declared.values()];
    const unmet = obligations.filter((entry) => entry.result !== MET);
    report.level = {
      claimed,
      verified: unmet.length === 0 ? claimed : null,
      "highest-verifiable": "L3",
      obligations: obligations.map((entry) => ({
        obligation: entry.obligation,
        level: entry.level,
        owed: entry.owed,
        result: entry.result
      })),
      unmet: unmet.map((entry) => entry.obligation)
    };
    if (order.indexOf(claimed) >= 1) {
      report.level["recusal-not-anchored"] = recusalNotAnchored(inputs.artifacts);
    }
    if (registry && order.indexOf(claimed) >= 2) {
      report.level["system-rules-not-decided"] = [...registry.rules.values()]
        .filter((rule) => rule.class === "system")
        .filter((rule) => rule.surface === "core" || rule.surface === surface)
        .filter((rule) => !byRule.has(rule.id))
        .map((rule) => rule.id)
        .sort();
    }
  }

  /* roll-up */
  report["findings-detail"].sort(
    (a, b) =>
      (a.path || "").localeCompare(b.path || "") ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule) ||
      a.violation.localeCompare(b.violation)
  );
  for (const finding of report["findings-detail"]) {
    const site = finding.path ? `${finding.path}${finding.line ? `:${finding.line}` : ""} ` : "";
    finding.violation = `${site}${finding.violation}`;
    delete finding.absolutePath;
    delete finding.evidence;
  }
  // A part carrying the separator would make its own finding unsplittable, so it is a run
  // failure rather than a line nobody can parse.
  for (const entry of [...report["findings-detail"], ...report.unjudgeable]) {
    if (entry.violation.includes(SEPARATOR) || entry.remedy.includes(SEPARATOR)) {
      detectorErrors.push(`${entry.rule} emitted a part containing the finding separator`);
    }
  }
  report.findings = report["findings-detail"].map(formatFinding);
  report.unjudgeable.sort((a, b) => a.rule.localeCompare(b.rule) || a.violation.localeCompare(b.violation));
  report["out-of-scope"].sort();

  const violations = report["findings-detail"].filter((finding) => finding.verdict === "VIOLATION").length;
  const needsReview = report["findings-detail"].filter((finding) => finding.verdict === "NEEDS_REVIEW").length;
  report.counts = {
    violation: violations,
    "needs-review": needsReview,
    unjudgeable: report.unjudgeable.length,
    waived: report["waivers-applied"].length,
    "out-of-scope": report["out-of-scope"].length
  };

  if (detectorErrors.length > 0) {
    report.notes.push(...detectorErrors.map((entry) => `detector failure: ${entry}`));
    report.verdict = "UNJUDGEABLE";
    report.exit = 2;
    return report;
  }
  // §9 rule 3: a level claimed and not verified is a conformance failure, not a footnote.
  // It cannot roll up to PASS even when every obligation that failed did so for want of
  // evidence rather than for a defect.
  const claimUnverified = Boolean(report.level && report.level.verified === null);
  /*
   * A run that could not read one of its own inputs never rolls up to PASS. The per-rule
   * UNJUDGEABLE above already stops those rules certifying, and a green process exit over a
   * file the scanner could not tokenise would put the same false clean back one level up:
   * CI gates on the exit code, not on a later reading of the JSON.
   */
  const unreadableInputs = inputs.unreadable.length > 0;
  if (violations > 0) report.verdict = "VIOLATION";
  else if (needsReview > 0) report.verdict = "NEEDS_REVIEW";
  else if (!registry || claimUnverified || unreadableInputs || judgedNothing(report, registry, byRule)) {
    report.verdict = "UNJUDGEABLE";
  } else report.verdict = "PASS";

  // Exit 0 is reserved for PASS. Everything else has a code of its own, because CI gates on
  // the process code and never on a later reading of the JSON: a checker that inspected
  // nothing, or whose level claim went unverified, must not leave a green tick behind.
  if (!registry) report.exit = 3;
  else if (report.verdict === "VIOLATION" || report.verdict === "NEEDS_REVIEW") report.exit = 1;
  else if (report.verdict === "UNJUDGEABLE") report.exit = 4;
  else report.exit = 0;
  return report;
}

// A run that judged no rule at all reports UNJUDGEABLE rather than PASS: an empty finding
// list from a checker that looked at nothing is not a clean result.
function judgedNothing(report, registry, byRule) {
  const inScope = [...registry.rules.values()].filter(
    (rule) => (rule.surface === "core" || rule.surface === report.surface) && byRule.has(rule.id)
  );
  const unjudged = new Set(report.unjudgeable.map((entry) => entry.rule));
  return inScope.every((rule) => unjudged.has(rule.id));
}

/**
 * What each in-scope registry rule came to in this run, after waivers. A rule with no result
 * at all is a rule nothing looked at, which is UNJUDGEABLE rather than clean.
 */
function ruleOutcomes(report, registry, surface) {
  const outcomes = new Map();
  if (!registry) return outcomes;
  const rank = { PASS: 0, NEEDS_REVIEW: 1, UNJUDGEABLE: 2, VIOLATION: 3 };
  for (const rule of registry.rules.values()) {
    if (rule.surface !== "core" && rule.surface !== surface) continue;
    outcomes.set(rule.id, "PASS");
  }
  const worsen = (id, verdict) => {
    if (!outcomes.has(id)) return;
    if (rank[verdict] > rank[outcomes.get(id)]) outcomes.set(id, verdict);
  };
  for (const entry of report.unjudgeable) worsen(entry.rule, "UNJUDGEABLE");
  for (const finding of report["findings-detail"]) worsen(finding.rule, finding.verdict);
  return outcomes;
}

/** Every rule id the run's own artifacts cite, with the artifact that cites it. */
function citedRuleIds(artifacts) {
  const cited = [];
  const add = (raw, artifact) => {
    const id = String(raw === undefined ? "" : raw).trim();
    if (id !== "") cited.push({ id, artifact });
  };
  for (const artifact of artifacts) {
    const data = artifact.data;
    if (artifact.kind === "CRITIQUE" && Array.isArray(data.findings)) {
      for (const finding of data.findings) {
        if (finding !== null && typeof finding === "object") add(finding["rule-id"], artifact);
      }
    }
    if (artifact.kind === "VERDICT" && Array.isArray(data.answers)) {
      for (const answer of data.answers) {
        if (answer !== null && typeof answer === "object") add(answer["rule-id"], artifact);
      }
    }
    if (artifact.kind === "AUDIT" && Array.isArray(data.findings)) {
      // An AUDIT records findings in the one shape: `rule-id — violation — remedy`.
      for (const finding of data.findings) add(String(finding).split(SEPARATOR)[0], artifact);
    }
    if (artifact.kind === "WAIVERS" && Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        if (entry !== null && typeof entry === "object" && !/[*?]/.test(String(entry["rule-id"] ?? ""))) {
          add(entry["rule-id"], artifact);
        }
      }
    }
  }
  return cited;
}

/**
 * The participants a run records, read off its own artifacts. This is what a waiver's
 * counter-signature is checked against: with no roster the checker can establish that two
 * ids differ and no more, and it says so rather than implying it verified more.
 */
/**
 * The critique authors this run names nowhere but on the critique's own file. Recusal is
 * decided by comparing that author against the DIRECTION authors, so an author the run
 * records nowhere else is a name the run cannot corroborate: a genuine critic who proposed
 * nothing reads exactly like a proposer that filed under a fresh id, and PDS/1.0 defines no
 * roster to tell them apart. The list is reported on the level rather than swallowed, so
 * "verified L2" is never read without the ids whose recusal rests on a self-chosen path.
 */
/**
 * The identities some artifact of the run records other than the one that identity wrote: a
 * DIRECTION author (which the brief's assignment, G1 and the VERDICT all bear on), the
 * Decider, and a named DESIGN-SYSTEM author. A CRITIQUE author appears nowhere but on its own
 * file, so it is not in this set — the run cannot tell it from an id minted for the occasion.
 */
function corroboratedIdentities(artifacts) {
  const corroborated = new Set();
  for (const artifact of artifacts) {
    if (artifact.kind === "DIRECTION") corroborated.add(normaliseIdentity(agentOf(artifact)));
    if (artifact.kind === "VERDICT") corroborated.add(normaliseIdentity(artifact.data["decided-by"]));
    if (artifact.kind === "DESIGN-BRIEF") corroborated.add(normaliseIdentity(artifact.data.decider));
    if (artifact.kind === "DESIGN-SYSTEM") corroborated.add(normaliseIdentity(artifact.data.author));
  }
  corroborated.delete("");
  return corroborated;
}

function recusalNotAnchored(artifacts) {
  const corroborated = corroboratedIdentities(artifacts);
  const unanchored = new Set();
  for (const artifact of artifacts) {
    if (artifact.kind !== "CRITIQUE") continue;
    const author = normaliseIdentity(agentOf(artifact));
    if (author !== "" && !corroborated.has(author)) unanchored.add(author);
  }
  return [...unanchored].sort(codepoint);
}

function runParticipants(artifacts) {
  const ids = new Set();
  const add = (raw) => {
    const id = normaliseIdentity(raw);
    if (id !== "" && PARTICIPANT_ID.test(id)) ids.add(id);
  };
  for (const artifact of artifacts) {
    if (artifact.kind === "DIRECTION") add(agentOf(artifact));
    if (artifact.kind === "CRITIQUE") add(agentOf(artifact));
    if (artifact.kind === "VERDICT") add(artifact.data["decided-by"]);
    if (artifact.kind === "DESIGN-BRIEF") add(artifact.data.decider);
    if (artifact.kind === "DESIGN-SYSTEM") add(artifact.data.author);
  }
  return ids;
}

// PDS carries the digest it was written against; a mismatch is reported, never accepted in
// silence. Read from the spec file beside the registry, when there is one.
function declaredRegistryDigest(directory) {
  const specPath = path.join(directory, "PDS.md");
  if (!fs.existsSync(specPath)) return null;
  const text = fs.readFileSync(specPath, "utf8");
  const match = /^registry-digest:\s*([0-9a-f]{12})\s*$/m.exec(text);
  return match ? match[1] : null;
}

module.exports = { capabilityOf, loadDetectors, runCheck };
