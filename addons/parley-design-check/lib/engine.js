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

const { CheckError, loadRegistry, resolveRegistryPath, tierRank, tierWord } = require("./registry.js");
const { ARTIFACT_KINDS, aliasTarget, readArtifact, readTokens, resolveValue, toSrgb } = require("./artifacts.js");
const { parseStylesheet } = require("./css.js");

const VERDICTS = ["PASS", "VIOLATION", "NEEDS_REVIEW", "UNJUDGEABLE"];
const CAPABLE_TIERS = ["T0", "T1"];
const STYLE_EXTENSIONS = new Set([".css"]);
const MARKUP_EXTENSIONS = new Set([".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

// The fields PDS gives each artifact kind. Presence only: an empty field is present.
const REQUIRED_FIELDS = {
  "DESIGN-BRIEF": ["axes", "primary-axis", "anti-goals", "targets", "level", "decider"],
  DIRECTION: ["handle", "signature", "positions", "tokens", "states", "effects"],
  CRITIQUE: ["agent", "targets", "findings"],
  VERDICT: ["outcome", "grafts", "answers", "dissent", "decided-by"],
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

function collectInputs(targets) {
  const inputs = { artifacts: [], tokenDocs: [], styles: [], markup: [], notInspected: [] };
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
      let artifact = null;
      try {
        artifact = readArtifact(file);
      } catch (error) {
        inputs.notInspected.push({ path: file, reason: error.message });
        continue;
      }
      if (artifact && artifact.kind && ARTIFACT_KINDS.includes(artifact.kind)) {
        artifact.text = fs.readFileSync(file, "utf8");
        inputs.artifacts.push(artifact);
      } else {
        inputs.notInspected.push({ path: file, reason: "markdown with no PDS artifact frontmatter" });
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
      const text = fs.readFileSync(file, "utf8");
      inputs.styles.push({ path: file, text, blocks: parseStylesheet(text) });
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

/**
 * Validate one waiver. Every field PDS requires, no wildcard, an unexpired date, and, for
 * a system-blind rule, a scope that is not the ratified system itself, since waiving a
 * system-blind rule at the system layer is the widening the flag exists to forbid.
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
  if (typeof entry["counter-signed-by"] !== "string" || entry["counter-signed-by"].trim() === "") {
    return "the entry carries no counter-signature";
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
  return null;
}

function waiverMatches(entry, finding, context) {
  if (entry["rule-id"] !== finding.rule) return false;
  if (!finding.absolutePath) return false;
  return scopePaths(entry.scope, context).includes(path.resolve(finding.absolutePath));
}

/* ------------------------------------------------------- conformance */

function levelResult(id, verdict, violation, remedy, site) {
  return { rule: id, verdict, violation, remedy, path: site || null, line: 0, conformance: true };
}

function checkL1(inputs) {
  const results = [];
  if (inputs.artifacts.length === 0) {
    results.push(
      levelResult(
        "pds-check:l1-artifacts-present",
        "UNJUDGEABLE",
        "no PDS artifact among the inputs",
        "pass the run's design artifacts to verify a level claim"
      )
    );
    return results;
  }
  for (const artifact of inputs.artifacts) {
    if (artifact.spec !== "PDS/1.0") {
      results.push(
        levelResult(
          "pds-check:l1-spec-version",
          "VIOLATION",
          `declares spec ${artifact.spec || "(none)"} rather than PDS/1.0`,
          "carry the spec version on every artifact from its first commit",
          artifact.path
        )
      );
    }
    const required = REQUIRED_FIELDS[artifact.kind] || [];
    const missing = required.filter((field) => artifact.data[field] === undefined);
    if (missing.length > 0) {
      results.push(
        levelResult(
          "pds-check:l1-required-fields",
          "VIOLATION",
          `${artifact.kind} is missing ${missing.join(", ")}`,
          "add the field, or state it explicitly as empty; an absent field is a violation, an empty one is not",
          artifact.path
        )
      );
    }
  }
  return results;
}

function checkL2(inputs) {
  const results = [];
  const byKind = (kind) => inputs.artifacts.filter((artifact) => artifact.kind === kind);
  const directions = byKind("DIRECTION");
  const wanted = [
    ["DESIGN-BRIEF", 1],
    ["DIRECTION", 2],
    ["CRITIQUE", 1],
    ["VERDICT", 1],
    ["CONTRACT", 1]
  ];
  for (const [kind, minimum] of wanted) {
    if (byKind(kind).length < minimum) {
      results.push(
        levelResult(
          "pds-check:l2-process-order",
          "VIOLATION",
          `the run shows ${byKind(kind).length} ${kind} artifacts where the mapping needs at least ${minimum}`,
          "record every step of the mapping in the Parley phase named for it"
        )
      );
    }
  }
  // Recusal: a critique must not target the direction its own author proposed.
  for (const critique of byKind("CRITIQUE")) {
    const agent = critique.data.agent ? String(critique.data.agent) : null;
    const targets = Array.isArray(critique.data.targets) ? critique.data.targets.map(String) : [];
    if (!agent) continue;
    const own = directions.find((direction) => path.basename(direction.path).replace(/\.md$/, "") === agent);
    if (own && targets.includes(String(own.data.handle))) {
      results.push(
        levelResult(
          "pds-check:l2-recusal",
          "VIOLATION",
          `${agent} critiques its own direction "${own.data.handle}"`,
          "a proposer neither critiques, ranks, scores nor decides its own direction",
          critique.path
        )
      );
    }
  }
  // G1, recomputed rather than trusted, where the directions declare their positions.
  const positioned = directions.filter((direction) => direction.data.positions && typeof direction.data.positions === "object");
  for (let i = 0; i < positioned.length; i += 1) {
    for (let j = i + 1; j < positioned.length; j += 1) {
      const first = positioned[i];
      const second = positioned[j];
      const axes = new Set([...Object.keys(first.data.positions), ...Object.keys(second.data.positions)]);
      let differing = 0;
      for (const axis of axes) {
        if (String(first.data.positions[axis]) !== String(second.data.positions[axis])) differing += 1;
      }
      const a = String(first.data.handle);
      const b = String(second.data.handle);
      if (differing < 2) {
        results.push(
          levelResult(
            "pds-check:l2-gate-g1",
            "VIOLATION",
            `G1 DISTINCTNESS: directions '${a}' and '${b}' differ on ${differing} declared ${differing === 1 ? "axis" : "axes"}; 2 are required`,
            "re-diverge once with the seeded assignment, or record human ratification with a brief-specific reason"
          )
        );
      }
      if (String(first.data.signature || "").trim() === String(second.data.signature || "").trim()) {
        results.push(
          levelResult(
            "pds-check:l2-gate-g1",
            "VIOLATION",
            `G1 DISTINCTNESS: directions '${a}' and '${b}' declare the same Signature`,
            "one of them has not made a decision of its own; re-diverge"
          )
        );
      }
    }
  }
  // G2, on the bounds a verdict can be held to without reading the token files.
  for (const verdict of byKind("VERDICT")) {
    const outcome = verdict.data.outcome;
    const names = outcome && typeof outcome === "object" ? Object.keys(outcome) : [];
    const wellFormed = names.length === 1 && (names[0] === "winner" || names[0] === "abstain");
    if (!wellFormed) {
      results.push(
        levelResult(
          "pds-check:l2-gate-g2",
          "VIOLATION",
          "G2 COHERENCE: the outcome is neither exactly one winner nor an abstain",
          "select one direction whole, or abstain with a reason; a ranking is not an outcome",
          verdict.path
        )
      );
    }
    const grafts = Array.isArray(verdict.data.grafts) ? verdict.data.grafts : [];
    if (grafts.length > 3) {
      results.push(
        levelResult(
          "pds-check:l2-gate-g2",
          "VIOLATION",
          `G2 COHERENCE: the verdict takes ${grafts.length} grafts, above the bound of three`,
          "drop the grafts that are not load-bearing",
          verdict.path
        )
      );
    }
    for (const graft of grafts) {
      if (graft === null || typeof graft !== "object" || !graft.from || !graft.part || !graft.as) {
        results.push(
          levelResult(
            "pds-check:l2-gate-g2",
            "VIOLATION",
            "G2 COHERENCE: a graft does not name its source, its part and the winner token it is re-expressed in",
            "name all three, or drop the graft",
            verdict.path
          )
        );
      }
    }
  }
  // Gates are recorded somewhere in the run's artifacts, as entries carrying an outcome.
  const recorded = new Map();
  for (const artifact of inputs.artifacts) {
    const gates = artifact.data.gates;
    if (!Array.isArray(gates)) continue;
    for (const gate of gates) {
      if (gate === null || typeof gate !== "object" || !gate.id) continue;
      if (gate.outcome === undefined) continue;
      recorded.set(String(gate.id), artifact.path);
    }
  }
  for (const gate of ["G1", "G2"]) {
    if (!recorded.has(gate)) {
      results.push(
        levelResult(
          "pds-check:l2-gate-recorded",
          "VIOLATION",
          `${gate} has no recorded outcome in any artifact of the run`,
          "record the gate at the transition named for it, as a gates entry carrying its id and outcome"
        )
      );
    }
  }
  return results;
}

function checkL3(inputs, hasRegistry) {
  const results = [];
  if (inputs.tokenDocs.length === 0) {
    results.push(
      levelResult(
        "pds-check:l3-token-document",
        "UNJUDGEABLE",
        "no token document among the inputs",
        "pass the ratified token file to verify token integrity"
      )
    );
    return results;
  }
  const index = mergeTokens(inputs.tokenDocs);
  for (const token of [...index.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const target = aliasTarget(token.value);
    if (target) {
      const resolved = resolveValue(index, token.path);
      if (resolved.error) {
        results.push(
          levelResult(
            "pds-check:l3-alias-resolves",
            "VIOLATION",
            `${token.path} aliases ${target}: ${resolved.error}`,
            "point the alias at a declared token, and break any cycle by making one end a value",
            token.file
          )
        );
        continue;
      }
    }
    if (token.type === "color") {
      const resolved = resolveValue(index, token.path);
      if (resolved.error) continue;
      const srgb = toSrgb(resolved.value);
      if (srgb.error) {
        results.push(
          levelResult(
            "pds-check:l3-colour-computable",
            resolved.value && typeof resolved.value === "object" && resolved.value.colorSpace ? "NEEDS_REVIEW" : "VIOLATION",
            `${token.path}: ${srgb.error}`,
            "declare the colour space on the token and give a value the target can display",
            token.file
          )
        );
      }
    }
  }
  if (!hasRegistry) {
    results.push(
      levelResult(
        "pds-check:l3-no-literals",
        "NEEDS_REVIEW",
        "token-layer integrity was verified, and the no-literals requirement was not: it is a registry rule and the registry is absent",
        "install parley-design so the rule check can run, or verify the requirement by hand"
      )
    );
  }
  return results;
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
  if (contract && typeof contract.data.tokens === "string") {
    const tokenPath = path.resolve(path.dirname(contract.path), contract.data.tokens);
    const known = inputs.tokenDocs.some((document_) => path.resolve(document_.path) === tokenPath);
    if (!known && fs.existsSync(tokenPath)) inputs.tokenDocs.push(readTokens(tokenPath));
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
      "not-inspected": inputs.notInspected.map((entry) => `${relative(entry.path, cwd)} (${entry.reason})`)
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
          line: result.line || 0,
          violation: result.violation,
          remedy: result.remedy
        });
      }
    }
  }

  /* conformance */
  if (options.level) {
    const claimed = options.level.toUpperCase();
    const order = ["L1", "L2", "L3", "L4"];
    if (!order.includes(claimed)) throw new CheckError(`unknown level ${options.level}`);
    const results = [];
    results.push(...checkL1(inputs));
    if (order.indexOf(claimed) >= 1) results.push(...checkL2(inputs));
    if (order.indexOf(claimed) >= 2) results.push(...checkL3(inputs, Boolean(registry)));
    if (claimed === "L4") {
      results.push(
        levelResult(
          "pds-check:l4-rendered",
          "UNJUDGEABLE",
          "L4 asserts the applied interface passes the rendered-tier rules, and this checker obtains no rendered evidence",
          "verify L4 with a runtime that renders the interface; a claim whose evidence tier was unavailable is not verified here"
        )
      );
    }
    for (const result of results) {
      if (result.verdict === "UNJUDGEABLE") {
        report.unjudgeable.push({
          rule: result.rule,
          verdict: "UNJUDGEABLE",
          violation: result.violation,
          remedy: result.remedy
        });
        continue;
      }
      report["findings-detail"].push({
        rule: result.rule,
        verdict: result.verdict,
        class: "conformance",
        severity: 4,
        tier: tierWord("T0"),
        "system-blind": false,
        path: result.path ? relative(result.path, cwd) : null,
        absolutePath: result.path || null,
        line: 0,
        violation: result.violation,
        remedy: result.remedy
      });
    }
    const failed = report["findings-detail"].some(
      (finding) => finding.class === "conformance" && finding.verdict === "VIOLATION"
    );
    const unverifiable = report.unjudgeable.some((entry) => entry.rule.startsWith("pds-check:"));
    report.level = {
      claimed,
      verified: failed || unverifiable ? null : claimed,
      "highest-verifiable": "L3"
    };
  }

  /* waivers */
  let waivers = null;
  const waiverPath =
    options.waiversPath ||
    (contract && typeof contract.data.waivers === "string"
      ? path.resolve(path.dirname(contract.path), contract.data.waivers)
      : null);
  if (waiverPath && fs.existsSync(waiverPath)) {
    waivers = loadWaivers(waiverPath);
  } else if (options.waiversPath) {
    throw new CheckError(`no such waiver file: ${options.waiversPath}`);
  }
  if (waivers) {
    const systemPaths = [];
    if (contract) {
      systemPaths.push(contract.path);
      if (typeof contract.data.tokens === "string") {
        systemPaths.push(path.resolve(path.dirname(contract.path), contract.data.tokens));
      }
    }
    const waiverContext = { now, systemPaths, cwd, waiverDir: path.dirname(waivers.path) };
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
    const kept = [];
    for (const finding of report["findings-detail"]) {
      const waiver =
        finding.verdict === "VIOLATION" ? valid.find((entry) => waiverMatches(entry, finding, waiverContext)) : null;
      if (!waiver) {
        kept.push(finding);
        continue;
      }
      report["waivers-applied"].push(
        `${finding.rule} at ${finding.path} — expires ${waiver.expiry}, counter-signed by ${waiver["counter-signed-by"]}`
      );
    }
    report["findings-detail"] = kept;
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
  if (violations > 0) report.verdict = "VIOLATION";
  else if (needsReview > 0) report.verdict = "NEEDS_REVIEW";
  else if (!registry || judgedNothing(report, registry, byRule)) report.verdict = "UNJUDGEABLE";
  else report.verdict = "PASS";

  // Refusal outranks findings: a run that could not read the registry produced a partial
  // ledger, and a caller must not read it as the whole one.
  if (!registry) report.exit = 3;
  else if (report.verdict === "VIOLATION" || report.verdict === "NEEDS_REVIEW") report.exit = 1;
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
