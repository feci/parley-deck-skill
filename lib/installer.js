"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const addonManifest = require("./addon-manifest");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = require("../package.json");
const SKILL_NAME = "parley-deck";
const MARKER_FILE = ".parley-deck-skill-install.json";
// Bumped when the marker gains a field later reads depend on. Schema 2 added `manifest`:
// a marker at this schema that omits it is malformed, never treated as legacy — that
// treatment would be the silent downgrade path the manifest exists to close.
const MARKER_SCHEMA = 2;
const TARGETS = [
  {
    name: "codex",
    kind: "codex",
    skillDir: path.join(".codex", "skills"),
    commands: ["codex"],
    detectByCommandOnly: true,
    homeEnv: "CODEX_HOME",
    homeEnvHasSkillsDir: true
  },
  {
    name: "claude",
    kind: "claude",
    skillDir: path.join(".claude", "skills"),
    commands: ["claude"],
    detectByCommandOnly: true
  },
  {
    name: "agy",
    kind: "antigravity",
    skillDir: path.join(".gemini", "config", "plugins"),
    commands: ["agy"],
    detectByCommandOnly: true
  },
  {
    name: "gemini",
    kind: "gemini",
    skillDir: path.join(".gemini", "extensions"),
    commands: ["gemini"],
    detectByCommandOnly: true
  },
  {
    name: "hermes",
    kind: "hermes",
    skillDir: path.join(".hermes", "skills"),
    commands: ["hermes"],
    detectByCommandOnly: true
  },
  {
    name: "qwen",
    kind: "qwen",
    skillDir: path.join(".qwen", "skills"),
    commands: ["qwen"]
  },
  {
    name: "codebuddy",
    kind: "codebuddy",
    skillDir: path.join(".codebuddy", "skills"),
    commands: ["codebuddy"]
  },
  {
    name: "goose",
    kind: "goose",
    skillDir: path.join(".goose", "skills"),
    commands: ["goose"]
  },
  {
    // The `kimi` command is Kimi Code (moonshotai/kimi-code), whose user skills root is
    // ~/.kimi-code/skills (or $KIMI_CODE_HOME/skills). NOTE: `kimi` is ALSO the command
    // of the older, unrelated kimi-cli (skills under the legacy ~/.kimi tree, only read
    // by kimi-code via a one-time `kimi migrate`). So we deliberately do NOT set
    // detectByCommandOnly here: auto/all detection relies on real Kimi Code evidence
    // (a ~/.kimi-code runtime home or $KIMI_CODE_HOME), never the ambiguous command alone.
    name: "kimi",
    kind: "kimi",
    skillDir: path.join(".kimi-code", "skills"),
    commands: ["kimi"],
    homeEnv: "KIMI_CODE_HOME",
    homeEnvHasSkillsDir: true
  },
  {
    name: "droid",
    kind: "droid",
    skillDir: path.join(".factory", "skills"),
    commands: ["droid"]
  },
  {
    name: "vibe",
    kind: "vibe",
    skillDir: path.join(".vibe", "skills"),
    commands: ["vibe-acp"]
  },
  {
    name: "cursor",
    kind: "cursor",
    skillDir: path.join(".cursor", "skills"),
    commands: ["agent"],
    requiresCommand: true
  },
  {
    name: "opencode",
    kind: "opencode",
    skillDir: path.join(".opencode", "skills"),
    commands: ["opencode"]
  },
  {
    name: "aionrs",
    kind: "aionrs",
    skillDir: path.join(".aionrs", "skills"),
    commands: ["aionrs"]
  }
];
// The core skill payload lives in its own directory so that generic skill installers, which
// copy exactly one skill directory, do not treat the whole repository as the skill. plugin.json
// and gemini-extension.json stay at the repository root: they are repo-level manifests, not
// skill-internal files, and are staged into the destination from there.
const CORE_SKILL_DIR = path.join("skills", "parley-deck");
const CORE_SKILL_NAME = "parley-deck";
const REQUIRED_PAYLOAD_FILES = [
  path.join(CORE_SKILL_DIR, "SKILL.md"),
  path.join(CORE_SKILL_DIR, "agents", "manifest.yaml"),
  path.join(CORE_SKILL_DIR, "references", "COOPERATION.md"),
  path.join(CORE_SKILL_DIR, "references", "compatibility.json"),
  "plugin.json",
  "gemini-extension.json"
];
const PROJECT_PROTOCOL_FILE = path.join("parley-deck", "COOPERATION.md");
const PROJECT_METADATA_FILE = path.join("parley-deck", "meta", "version.json");
const COMPATIBILITY_FILE = path.join(CORE_SKILL_DIR, "references", "compatibility.json");
// { from: path in the package, to: path in the destination }. The destination shape is
// unchanged by the source move — installed skills still have SKILL.md at their root.
const PAYLOAD_ENTRIES = [
  { from: path.join(CORE_SKILL_DIR, "SKILL.md"), to: "SKILL.md" },
  { from: path.join(CORE_SKILL_DIR, "agents"), to: "agents" },
  { from: path.join(CORE_SKILL_DIR, "references"), to: "references" },
  { from: "plugin.json", to: "plugin.json" },
  { from: "gemini-extension.json", to: "gemini-extension.json" }
];
const OPTIONAL_PAYLOAD_ENTRIES = [
  { from: "README.md", to: "README.md" },
  { from: "LICENSE", to: "LICENSE" }
];
const ADDONS_DIR = "skills";
const ADDON_REQUIRED_FILE = "SKILL.md";

class InstallerError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "InstallerError";
    this.details = details || {};
  }
}

function parseArgs(argv) {
  const args = Array.from(argv);
  const options = {
    command: null,
    target: "auto",
    scope: "user",
    project: null,
    dest: null,
    force: false,
    dryRun: false,
    yes: false,
    json: false,
    includeUndetected: false,
    noAddons: false,
    only: null,
    help: false,
    version: false
  };

  if (args.length === 0) {
    options.command = "help";
    return options;
  }

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-undetected") {
      options.includeUndetected = true;
    } else if (arg === "--no-addons") {
      options.noAddons = true;
    } else if (arg === "--only") {
      options.only = parseOnlyList(requireValue(arg, args));
    } else if (arg.startsWith("--only=")) {
      options.only = parseOnlyList(arg.slice("--only=".length));
    } else if (arg === "--target") {
      options.target = requireValue(arg, args);
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg === "--scope") {
      options.scope = requireValue(arg, args);
    } else if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
    } else if (arg === "--project") {
      options.project = requireValue(arg, args);
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg === "--dest") {
      options.dest = requireValue(arg, args);
    } else if (arg.startsWith("--dest=")) {
      options.dest = arg.slice("--dest=".length);
    } else if (arg.startsWith("-")) {
      throw new InstallerError(`Unknown option: ${arg}`);
    } else if (!options.command) {
      options.command = arg;
    } else {
      throw new InstallerError(`Unexpected argument: ${arg}`);
    }
  }

  if (options.version) {
    options.command = "version";
  } else if (options.help || !options.command) {
    options.command = "help";
  }

  validateOptions(options);
  return options;
}

function requireValue(flag, args) {
  if (args.length === 0 || args[0].startsWith("-")) {
    throw new InstallerError(`${flag} requires a value`);
  }
  return args.shift();
}

function parseOnlyList(value) {
  const names = value.split(",").map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new InstallerError("--only requires at least one add-on name");
  }
  return names;
}

function validateOptions(options) {
  const commands = new Set(["install", "doctor", "status", "sync-project", "uninstall", "paths", "help", "version"]);
  const targets = new Set(["auto", "all", "generic", ...TARGETS.map((target) => target.name)]);
  const scopes = new Set(["user", "project"]);

  if (!commands.has(options.command)) {
    throw new InstallerError(`Unknown command: ${options.command}`);
  }
  if (!targets.has(options.target)) {
    throw new InstallerError(`Unsupported target: ${options.target}`);
  }
  if (!scopes.has(options.scope)) {
    throw new InstallerError(`Unsupported scope: ${options.scope}`);
  }
  if (options.target === "generic" && !options.dest) {
    throw new InstallerError("--target generic requires --dest <path>");
  }
  if (options.dest && options.target !== "generic") {
    throw new InstallerError("--dest can only be used with --target generic");
  }
  if (options.noAddons && options.only) {
    throw new InstallerError("--no-addons and --only cannot be combined");
  }
}

function run(argv, io) {
  const options = parseArgs(argv);
  const context = makeContext(options, io || {});
  validateAddonSelection(context);
  let result;

  if (options.command === "version") {
    result = { ok: true, command: "version", version: PACKAGE_JSON.version };
  } else if (options.command === "help") {
    result = { ok: true, command: "help", text: usage() };
  } else if (options.command === "paths") {
    result = pathsCommand(context);
  } else if (options.command === "doctor") {
    result = doctorCommand(context);
  } else if (options.command === "status") {
    result = statusCommand(context);
  } else if (options.command === "sync-project") {
    result = syncProjectCommand(context);
  } else if (options.command === "install") {
    result = installCommand(context);
  } else if (options.command === "uninstall") {
    result = uninstallCommand(context);
  }

  writeResult(result, context);
  return { exitCode: result.ok ? 0 : 1 };
}

function makeContext(options, io) {
  const env = io.env || process.env;
  const cwd = io.cwd || process.cwd();
  return {
    options,
    env,
    cwd,
    stdout: io.stdout || process.stdout,
    stderr: io.stderr || process.stderr,
    homeDir: homeDir(env),
    packageRoot: PACKAGE_ROOT
  };
}

function homeDir(env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

function usage() {
  const targetList = `auto|all|${TARGETS.map((target) => target.name).join("|")}|generic`;
  const addonNames = discoverAddons(PACKAGE_ROOT).map((addon) => addon.name);
  const addonHint = addonNames.length > 0 ? addonNames.join(", ") : "(none packaged)";
  return [
    "Usage:",
    `  parley-deck-skill install [--target ${targetList}] [--scope user|project] [--project <path>] [--dest <path>] [--force] [--dry-run] [--json] [--include-undetected] [--no-addons] [--only <name>[,<name>]]`,
    `  parley-deck-skill doctor [--target ${targetList}] [--scope user|project] [--project <path>] [--dest <path>] [--json] [--include-undetected] [--no-addons] [--only <name>[,<name>]]`,
    `  parley-deck-skill status [--target ${targetList}] [--scope user|project] [--project <path>] [--dest <path>] [--json] [--include-undetected] [--no-addons] [--only <name>[,<name>]]`,
    "  parley-deck-skill sync-project [--project <path>] [--dry-run] [--yes] [--json]",
    `  parley-deck-skill uninstall [--target ${targetList}] [--scope user|project] [--project <path>] [--dest <path>] [--force] [--dry-run] [--json] [--include-undetected] [--no-addons] [--only <name>[,<name>]]`,
    `  parley-deck-skill paths [--target ${targetList}] [--scope user|project] [--project <path>] [--dest <path>] [--json] [--include-undetected] [--no-addons] [--only <name>[,<name>]]`,
    "  parley-deck-skill --version",
    "",
    "Add-ons:",
    "  All add-on skills install by default alongside the core parley-deck skill.",
    "  --no-addons          install the core skill only.",
    "  --only <name>[,...]   install the core skill plus only the named add-on(s).",
    `  Available add-ons: ${addonHint}`,
    "",
    "Default install:",
    "  npx -y parley-deck-skill@latest install"
  ].join("\n");
}

function pathsCommand(context) {
  const targets = resolveTargets(context);
  return {
    ok: true,
    command: "paths",
    // `paths` answers "where would this go". It must not launch a PATH-resolved program
    // to do that. (review round 2, codex-1 MINOR.)
    targets: targets.map((target) => targetStatus(target, context, { probeRuntime: false }))
  };
}

function doctorCommand(context) {
  const targets = resolveTargets(context);
  if (targets.length === 0) {
    return {
      ok: false,
      command: "doctor",
      errors: ["No installed agent runtimes were detected. Use --target all --include-undetected or a specific --target to inspect expected paths."],
      targets: []
    };
  }
  const results = targets.map((target) => targetStatus(target, context, { probeRuntime: true, env: context.env, cwd: context.cwd }));
  return {
    // Health is payload validity AND operational availability. Kept as one exit code so
    // `doctor` stays unambiguous; the two are reported separately in the output and in JSON.
    // `valid-unmanaged` is a provenance fact, not a health defect: the payload is byte-verified
    // against the manifest it ships. Nobody could construct a case where a verified, runnable
    // payload is unhealthy merely because another installer copied it. (round 3, kimi-1.)
    ok: results.every((result) =>
      result.skills.every(
        (skill) =>
          (skill.status === "valid" || skill.status === "valid-unmanaged") &&
          (!skill.runtime || skill.runtime.ok)
      )
    ),
    command: "doctor",
    targets: results
  };
}

function statusCommand(context) {
  const targets = resolveTargets(context);
  const runtimeInstalls = targets.map((target) => enrichRuntimeStatus(targetStatus(target, context, { probeRuntime: true, env: context.env, cwd: context.cwd })));
  const project = projectStatus(context);
  const parleyCli = parleyCliStatus(context);
  const compatibility = compatibilitySummary(runtimeInstalls, project);

  return {
    ok: true,
    command: "status",
    installer: installerStatus(context),
    runtimeInstalls,
    project,
    parleyCli,
    compatibility,
    actions: recommendedActions(runtimeInstalls, project)
  };
}

function syncProjectCommand(context) {
  const project = projectStatus(context);
  if (!project.exists || !project.protocolSha256) {
    return {
      ok: false,
      command: "sync-project",
      dryRun: true,
      project,
      errors: [`Project protocol was not found at ${project.protocolPath}`]
    };
  }

  const metadata = buildProjectMetadata(context, project);
  const actions = [
    {
      action: "write",
      path: project.metadataPath,
      dryRun: !(context.options.yes && !context.options.dryRun)
    }
  ];

  if (!context.options.yes || context.options.dryRun) {
    return {
      ok: true,
      command: "sync-project",
      dryRun: true,
      project,
      metadata,
      actions
    };
  }

  fs.mkdirSync(path.dirname(project.metadataPath), { recursive: true });
  fs.writeFileSync(project.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    ok: true,
    command: "sync-project",
    dryRun: false,
    project: projectStatus(context),
    metadata,
    actions
  };
}

function installerStatus(context) {
  return {
    name: PACKAGE_JSON.name,
    version: PACKAGE_JSON.version,
    source: installSource(),
    packageRoot: context.packageRoot,
    executable: process.argv[1] || null
  };
}

function enrichRuntimeStatus(status) {
  const markerVersion = status.marker && status.marker.version ? status.marker.version : null;
  return {
    ...status,
    version: markerVersion,
    versionMatchesInstaller: markerVersion ? markerVersion === PACKAGE_JSON.version : null
  };
}

function projectStatus(context) {
  const root = resolvePath(context.options.project || context.cwd, context.cwd);
  const protocolPath = path.join(root, PROJECT_PROTOCOL_FILE);
  const metadataPath = path.join(root, PROJECT_METADATA_FILE);
  const packagedProtocolPath = path.join(context.packageRoot, CORE_SKILL_DIR, "references", "COOPERATION.md");
  const compatibilityPath = path.join(context.packageRoot, COMPATIBILITY_FILE);
  const metadata = readJsonFile(metadataPath);
  const compatibilityManifest = readJsonFile(compatibilityPath);
  const protocolSha256 = sha256File(protocolPath);
  const packagedProtocolSha256 = sha256File(packagedProtocolPath);

  return {
    root,
    deckRoot: path.join(root, "parley-deck"),
    exists: Boolean(protocolSha256),
    protocolPath,
    protocolSha256,
    metadataPath,
    metadata: metadata.value,
    metadataStatus: metadata.status,
    metadataMatchesProtocol: metadata.value && protocolSha256
      ? metadata.value.protocolSha256 === protocolSha256
      : null,
    packaged: {
      protocolPath: packagedProtocolPath,
      protocolSha256: packagedProtocolSha256,
      compatibilityManifestPath: compatibilityPath,
      compatibilityManifestSha256: sha256File(compatibilityPath),
      compatibilityManifest: compatibilityManifest.value
    },
    protocolMatchesPackaged: protocolSha256 && packagedProtocolSha256
      ? protocolSha256 === packagedProtocolSha256
      : null
  };
}

function parleyCliStatus(context) {
  if (!commandExists("parley", context.env)) {
    return { available: false };
  }

  const result = spawnSync("parley", ["version"], {
    env: context.env,
    encoding: "utf8",
    timeout: 2000
  });

  if (result.error) {
    return { available: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      available: false,
      error: firstLine(result.stderr) || `parley version exited with status ${result.status}`
    };
  }

  return {
    available: true,
    version: firstLine(result.stdout) || null
  };
}

function compatibilitySummary(runtimeInstalls, project) {
  const reasons = [];

  if (runtimeInstalls.length === 0) {
    reasons.push("no-runtime-installs-detected");
  }
  for (const install of runtimeInstalls) {
    if (install.status !== "valid") {
      reasons.push(`${install.target}-install-${install.status}`);
    } else if (install.versionMatchesInstaller === false) {
      reasons.push(`${install.target}-version-drift`);
    }
  }
  if (!project.exists) {
    reasons.push("project-protocol-missing");
  } else if (project.metadataStatus === "missing") {
    reasons.push("project-metadata-missing");
  } else if (project.metadataStatus === "malformed") {
    reasons.push("project-metadata-malformed");
  } else if (project.metadataMatchesProtocol === false) {
    reasons.push("project-metadata-stale");
  }
  if (project.protocolMatchesPackaged === false) {
    reasons.push("project-protocol-differs-from-packaged-reference");
  }

  return {
    status: reasons.length === 0 ? "ok" : "warning",
    reasons
  };
}

function recommendedActions(runtimeInstalls, project) {
  const actions = [];

  if (runtimeInstalls.some((install) => install.versionMatchesInstaller === false || install.status !== "valid")) {
    actions.push("Run parley-deck-skill install --target all --include-undetected --force after validating the intended runtime targets.");
  }
  if (project.exists && (project.metadataStatus === "missing" || project.metadataMatchesProtocol === false)) {
    actions.push(`Run parley-deck-skill sync-project --project ${project.root} --yes to refresh project metadata.`);
  }
  if (project.protocolMatchesPackaged === false) {
    actions.push("Review the local COOPERATION.md changes before adopting packaged protocol updates.");
  }

  return actions;
}

function buildProjectMetadata(context, project) {
  const manifest = project.packaged.compatibilityManifest || {};
  const metadataSchema = manifest.projectMetadataSchema || 1;

  return {
    schemaVersion: metadataSchema,
    deckVersion: PACKAGE_JSON.version,
    protocolSchema: manifest.protocolSchema || 1,
    projectMetadataSchema: metadataSchema,
    source: installSource(),
    protocolSha256: project.protocolSha256,
    skillSha256: sha256File(path.join(context.packageRoot, CORE_SKILL_DIR, "SKILL.md")),
    packagedProtocolSha256: project.packaged.protocolSha256,
    compatibilityManifestSha256: project.packaged.compatibilityManifestSha256,
    updatedAt: new Date().toISOString(),
    updatedBy: "parley-deck-skill sync-project"
  };
}

function installCommand(context) {
  validatePayload(context.packageRoot);
  const targets = resolveTargets(context);
  if (targets.length === 0) {
    return {
      ok: false,
      command: "install",
      errors: ["No installed agent runtimes were detected. Use --target all --include-undetected or --target generic --dest <path>."],
      targets: []
    };
  }

  {
    // A dry run that answers differently from the command it models is worse than no dry run:
    // it reported ok:true where the real install blocked on an unusable marker selection. The
    // read-only planning is identical; only staging, commit and cleanup are omitted.
    // (review round 13: codex-1 MINOR, hermes-1, kimi-1 — who also found it on uninstall.)
    const plan = targets.map((target) => ({ target, units: targetSkillUnits(target, context) }));
    const outcomes = installFleetAtomically(plan, context);
    const actions = plan.map(({ target, units }) => {
      const skills = units.map((unit) => outcomes.get(unit));
      const core = skills[0];
      return {
        ok: skills.every((skill) => skill.ok),
        target: target.name,
        dest: core.dest,
        action: core.action,
        message: core.message,
        // The per-action flag is part of the JSON contract; unifying the dry-run path with the
        // real one dropped it until the CLI regression caught it.
        ...(core.dryRun ? { dryRun: true } : {}),
        skills
      };
    });
    return {
      ok: actions.every((action) => action.ok),
      command: "install",
      dryRun: Boolean(context.options.dryRun),
      actions
    };
  }
}

function uninstallCommand(context) {
  const targets = resolveTargets(context);
  if (targets.length === 0) {
    return {
      ok: false,
      command: "uninstall",
      dryRun: context.options.dryRun,
      errors: ["No installed agent runtimes were detected. Use --target all --include-undetected or a specific --target to uninstall expected paths."],
      actions: []
    };
  }
  // The quarantine phase runs across the WHOLE fleet, not per target. Keeping it per target
  // left the same partial fleet the fleet preflight exists to prevent: with a later target's
  // skills directory unwritable, thirteen targets were emptied before the fourteenth refused.
  // Caught by this idea's own regression, after cycle 15 removed the removability preflight
  // that had been masking it. (review round 11.)
  const plan = targets.map((target) => ({ target, units: targetSkillUnits(target, context) }));
  const outcomes = removeFleetAtomically(plan, context);
  const actions = plan.map(({ target, units }) => {
    const skills = units.map((unit) => outcomes.get(unit));
    const core = skills[0];
    return {
      ok: skills.every((skill) => skill.ok),
      target: target.name,
      dest: core.dest,
      action: core.action,
      message: core.message,
      // Install's per-action shape carries this; uninstall's did not. The asymmetry arrived
      // with cycle 19's single result path. (review round 16, hermes-1 NIT-1.)
      ...(core.dryRun ? { dryRun: true } : {}),
      skills
    };
  });
  return {
    ok: actions.every((action) => action.ok),
    command: "uninstall",
    dryRun: context.options.dryRun,
    actions
  };
}

// Cycle 14 tried to decide disposability with an `accessSync` walk. It is wrong in both
// directions: a `uchg` file keeps ordinary mode bits and defeats removal (83 units removed,
// then a failed 84th), while an *empty* 0555 directory was refused although `rmSync` removes it
// happily, since rmdir needs permission on the parent. kimi-1 established that no stdlib fix
// exists — node exposes no `st_flags`, and `uappnd` or delete-denying ACLs pass `access(2)`
// entirely. (review round 11: codex-1 MAJOR, hermes-1 MAJOR, kimi-1's measured arms.)
//
// So stop predicting. `rename` needs permission on the PARENT only, is atomic, and — measured —
// succeeds on exactly the trees whose recursive removal fails: a frozen `chmod -R a-w` tree and
// a directory containing a `uchg` file both rename cleanly. Uninstall therefore renames every
// planned destination aside first; only when the whole fleet is quarantined does anything get
// deleted. A rename failure rolls back and loses nothing; a delete failure afterwards is debris,
// reported as a warning, not a partial fleet.
function quarantineName(dest) {
  return path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.${process.pid}.${Date.now()}.removing`
  );
}

function resolveTargets(context) {
  const options = context.options;
  const target = options.target;

  if (target === "generic") {
    return [makeTarget("generic", "generic", resolvePath(options.dest, context.cwd), true)];
  }

  const candidates = TARGETS.map((definition) => {
    const dest = targetPath(definition, context);
    return makeTarget(definition.name, definition.kind, dest, isRuntimeDetected(definition, context));
  });

  if (target === "all") {
    if (options.includeUndetected) {
      return candidates.map((candidate) => ({ ...candidate, detected: true }));
    }
    return candidates.filter((candidate) => candidate.detected);
  }

  if (target === "auto") {
    return candidates.filter((candidate) => candidate.detected);
  }

  const selected = candidates.find((candidate) => candidate.name === target);
  return selected ? [{ ...selected, detected: true }] : [];
}

function makeTarget(name, kind, dest, detected) {
  return { name, kind, dest, detected };
}

function targetPath(definition, context) {
  const options = context.options;
  const projectRoot = resolvePath(options.project || context.cwd, context.cwd);

  if (options.scope === "project") {
    return path.join(projectRoot, definition.skillDir, SKILL_NAME);
  }

  if (definition.homeEnv && context.env[definition.homeEnv]) {
    const root = context.env[definition.homeEnv];
    return definition.homeEnvHasSkillsDir
      ? path.join(root, "skills", SKILL_NAME)
      : path.join(root, definition.skillDir, SKILL_NAME);
  }

  return path.join(context.homeDir, definition.skillDir, SKILL_NAME);
}

function resolvePath(value, cwd) {
  if (!value) return value;
  if (value.startsWith("~")) {
    return path.join(os.homedir(), value.slice(1));
  }
  return path.resolve(cwd, value);
}

function isRuntimeDetected(definition, context) {
  if (context.options.scope === "project") {
    const projectRoot = resolvePath(context.options.project || context.cwd, context.cwd);
    return hasRuntimeDirectoryEvidence(path.join(projectRoot, definition.skillDir.split(path.sep)[0]), definition);
  }

  if (definition.homeEnv && context.env[definition.homeEnv]) {
    return true;
  }

  const commandDetected = definition.commands.some((command) => commandExists(command, context.env));
  if (definition.requiresCommand) {
    return commandDetected;
  }
  if (definition.detectByCommandOnly && commandDetected) {
    return true;
  }

  return hasRuntimeDirectoryEvidence(path.join(context.homeDir, definition.skillDir.split(path.sep)[0]), definition);
}

function hasRuntimeDirectoryEvidence(root, definition) {
  if (!dirExists(root)) return false;

  const runtimeEntries = listVisibleEntries(root);
  if (runtimeEntries.length === 0) return false;

  const skillContainer = definition.skillDir.split(path.sep).filter(Boolean)[1];
  if (!skillContainer) return true;
  if (runtimeEntries.some((entry) => entry !== skillContainer)) return true;

  const container = path.join(root, skillContainer);
  if (!dirExists(container)) return true;

  const skillEntries = listVisibleEntries(container);
  if (skillEntries.length === 0) return false;

  // A directory we did not install (no parley-deck-skill marker) is real runtime
  // evidence. Our own core and add-on skill dirs all carry the marker, so they do
  // not count as evidence — this keeps "marker-only" installs from self-detecting.
  return skillEntries.some((entry) => !isInstallerOwnedSkill(path.join(container, entry)));
}

function isInstallerOwnedSkill(skillDir) {
  if (!dirExists(skillDir)) return false;
  const marker = readMarker(skillDir);
  return Boolean(marker && marker.name === PACKAGE_JSON.name);
}

function commandExists(command, env) {
  const pathValue = env.PATH || "";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) continue;
    for (const ext of extensions) {
      const candidate = path.join(entry, command + ext);
      if (fileExists(candidate)) return true;
    }
  }
  return false;
}

// Point a staged gemini-extension.json at the destination's flat layout. Kept beside the
// staging code it serves, and deliberately narrow: it edits one field and preserves the rest
// of the manifest byte-for-byte in shape.
function rewriteStagedGeminiManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return;
  }
  if (!manifest || typeof manifest !== "object") return;
  manifest.contextFileName = "SKILL.md";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function validatePayload(root) {
  const missing = REQUIRED_PAYLOAD_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    throw new InstallerError(`Package is missing required skill files: ${missing.join(", ")}`);
  }
}

// Discover opt-in add-on skills shipped under skills/<name>/SKILL.md in the package.
// Each add-on is an inert instruction directory installed as its own skill dir
// alongside the core skill. Returns a name-sorted list of { name, root }.
function discoverAddons(packageRoot) {
  const addonsRoot = path.join(packageRoot, ADDONS_DIR);
  if (!dirExists(addonsRoot)) {
    return [];
  }
  const addons = [];
  for (const entry of listVisibleEntries(addonsRoot)) {
    // The core skill shares this directory so that a generic skill installer sees all five
    // as siblings. It is not an add-on and must never be offered as one.
    if (entry === CORE_SKILL_NAME) continue;
    const root = path.join(addonsRoot, entry);
    if (!dirExists(root)) continue;
    if (!fileExists(path.join(root, ADDON_REQUIRED_FILE))) continue;
    addons.push({ name: entry, root });
  }
  return addons.sort((a, b) => a.name.localeCompare(b.name));
}

// Reject --only names that do not match a discovered add-on, with a helpful list.
function validateAddonSelection(context) {
  if (!context.options.only) {
    return;
  }
  const discovered = discoverAddons(context.packageRoot).map((addon) => addon.name);
  const unknown = context.options.only.filter((name) => !discovered.includes(name));
  if (unknown.length > 0) {
    const known = discovered.length > 0 ? discovered.join(", ") : "(none packaged)";
    throw new InstallerError(`Unknown add-on(s) for --only: ${unknown.join(", ")}. Available add-ons: ${known}`);
  }
}

// The add-ons selected for a run, honoring --no-addons (core only) and
// --only <name>[,<name>] (core + the named add-ons). Default: all discovered add-ons.
function selectedAddons(context) {
  if (context.options.noAddons) {
    return [];
  }
  const discovered = discoverAddons(context.packageRoot);
  if (!context.options.only) {
    return discovered;
  }
  const wanted = new Set(context.options.only);
  return discovered.filter((addon) => wanted.has(addon.name));
}

// Read the add-on names recorded in a previously-written core marker. Returns:
//   - an array of names when the marker pins a selection (e.g. ["parley-tracker"]),
//   - [] when the marker records a core-only install (addons === false) OR is a
//     legacy marker with no addons field — both mean "core only", so an older
//     install is reported healthy rather than missing its absent-by-choice add-ons,
//   - null when no installer-owned core marker exists (nothing installed here yet).
// A recorded add-on name becomes a filesystem path, so it is untrusted input no matter who
// wrote the file. Unvalidated, `addons: ["../../outside-sentinel"]` in a core marker made
// `uninstall --force` delete a directory outside the skills tree and report ok:true — the
// marker steering the command's path scope rather than merely its selection.
// (review round 11, codex-1 CRITICAL, reproduced independently by hermes-1.)
const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function unusableAddonName(entry, seen) {
  if (typeof entry !== "string") return `not a string: ${JSON.stringify(entry)}`;
  if (entry === "." || entry === "..") return `a path component: ${JSON.stringify(entry)}`;
  if (entry.includes("/") || entry.includes("\\")) return `contains a separator: ${JSON.stringify(entry)}`;
  if (!SAFE_SKILL_NAME.test(entry)) return `not a plain skill name: ${JSON.stringify(entry)}`;
  if (seen.has(entry)) return `listed twice: ${JSON.stringify(entry)}`;
  return null;
}

// Returns { names, problem }. `names` is null when there is no installer-owned core marker
// (nothing installed here yet). A `problem` means the recorded selection is unusable: callers
// must fail closed rather than fall back, because falling back would silently discard a
// selection the user made — and constructing any path from it is the defect above.
function markerAddonNames(coreDest) {
  const marker = readMarker(coreDest);
  if (!marker || marker.name !== PACKAGE_JSON.name) {
    return { names: null, problem: null };
  }
  // Only two shapes mean "core only": the field absent (a legacy marker) and the explicit
  // `false` this installer writes for --no-addons. Every other non-array value was silently
  // read as core-only, so a marker holding a string, `true`, `null`, `{}` or `42` stayed
  // healthy and both mutation preflights waved it through — the fail-closed branch below sat
  // behind `Array.isArray` and never ran. (review round 12, codex-1 MAJOR / kimi-1 MINOR.)
  if (marker.addons === undefined || marker.addons === false) {
    return { names: [], problem: null };
  }
  if (!Array.isArray(marker.addons)) {
    return {
      names: [],
      problem: `install marker records an unusable add-on selection — neither a list nor false: ${JSON.stringify(marker.addons)}. Re-run install to rewrite it.`
    };
  }
  const names = [];
  const seen = new Set();
  for (const entry of marker.addons) {
    const bad = unusableAddonName(entry, seen);
    if (bad) {
      return { names: [], problem: `install marker records an unusable add-on selection — ${bad}. Re-run install to rewrite it.` };
    }
    seen.add(entry);
    names.push(entry);
  }
  return { names, problem: null };
}

// The add-on names a runtime target is expected to carry, for any command.
// An explicit --no-addons / --only flag always wins. For install (no flag) the
// package default (all discovered add-ons) is expected. For read/uninstall commands
// with no flag, the expected set is derived from the installed core marker so an
// intentional --no-addons or --only install is not reported as broken; a legacy or
// missing marker with no recorded selection falls back to the package default.
function expectedAddonNames(target, context) {
  if (context.options.noAddons) {
    return [];
  }
  if (context.options.only) {
    const wanted = new Set(context.options.only);
    return discoverAddons(context.packageRoot)
      .map((addon) => addon.name)
      .filter((name) => wanted.has(name));
  }
  if (context.options.command !== "install") {
    const recorded = markerAddonNames(target.dest);
    // An unusable selection yields no units at all: nothing to inspect, nothing to delete.
    if (recorded.problem) {
      return [];
    }
    if (recorded.names !== null) {
      return recorded.names;
    }
  }
  return discoverAddons(context.packageRoot).map((addon) => addon.name);
}

// Build the list of skill units for a runtime target: the core skill at
// <skills-dir>/parley-deck plus each expected add-on at <skills-dir>/<addon-name>.
// The expected add-on set comes from the flags or the installed marker (see
// expectedAddonNames), so omitted add-ons are simply absent rather than "missing".
function targetSkillUnits(target, context) {
  const skillsDir = path.dirname(target.dest);
  const markerState = markerAddonNames(target.dest);
  const units = [
    {
      skill: SKILL_NAME,
      kind: target.kind,
      dest: target.dest,
      addon: null,
      // The packaged directory this unit's payload comes from. Present on every unit, so the
      // unmanaged proof can be anchored without asking whether the unit is an add-on. The core
      // reached that proof through `unit.addon`, which is null for it, so a byte-perfect
      // foreign copy of the core was reported `malformed` no matter what it shipped.
      sourceRoot: path.join(context.packageRoot, CORE_SKILL_DIR),
      // Needed to derive the core's required-file list from the copy plan at validation time.
      packageRoot: context.packageRoot,
      isCore: true,
      // Surfaced on the core unit so health reports it and both mutation preflights refuse.
      ...(markerState.problem ? { markerProblem: markerState.problem } : {})
    }
  ];
  const expected = expectedAddonNames(target, context);
  const skillsRoot = path.resolve(skillsDir);
  const discovered = new Map(discoverAddons(context.packageRoot).map((addon) => [addon.name, addon]));

  // Confinement narrowed WHERE a recorded name can point; it did not establish that this
  // package has any authority over what is there. A syntactically perfect but unknown name —
  // `unrelated-sentinel` — still became a forced-uninstall target, because `--force` waives
  // ownership. Measured: the sibling directory was deleted and the command returned ok:true.
  //
  // `--force` may waive ownership for a destination the CALLER selected. It must not waive
  // authority for a destination selected only by mutable stored data. A recorded name is
  // therefore authorized only if the package ships that add-on, or the destination already
  // carries one of our markers claiming that identity — the second clause so an add-on dropped
  // from a newer package can still be uninstalled. (review round 12, codex-1 CRITICAL.)
  const fromMarker =
    context && context.options && !context.options.noAddons && !context.options.only &&
    context.options.command !== "install" && markerState.names !== null;
  const authorize = (name, dest) => {
    if (!fromMarker) return null;
    // The core is not an add-on. Naming it produced two units for one destination — harmless
    // but nonsensical, and it slipped through because the core's own marker satisfies the
    // ownership clause meant for add-ons dropped from newer packages. (round 13, kimi-1 NIT.)
    if (name === SKILL_NAME) {
      return `install marker records the core skill as an add-on: ${JSON.stringify(name)}`;
    }
    if (discovered.has(name)) return null;
    if (installerOwnsDestination(dest, name)) return null;
    return `install marker records an add-on this package does not ship and does not own: ${JSON.stringify(name)}`;
  };

  // `selected` states whether the CORE MARKER records this add-on, so it must be read from the
  // marker — not from the flag that chose what to inspect. Deriving it from the flag made
  // `doctor --only parley-bidding` answer `selected: true, valid, ok: true` for the very unit
  // the unflagged gate reports `valid-unselected` and fails on: two reads, opposite answers
  // about a recorded fact, for the same directory. A scoped probe of the bidding opt-out is
  // exactly how someone would check it. (review round 6, kimi-1 MINOR.)
  //
  // Install and uninstall are writing the selection, so for them the requested set IS it.
  const writing = context && context.options && (context.options.command === "install" || context.options.command === "uninstall");
  const recorded = writing ? null : markerState.names;
  const recordedSet = recorded === null ? null : new Set(recorded);
  for (const name of expected) {
    // Second line of defence behind name validation: whatever the name came from — marker,
    // flag, or discovery — its destination must be an exact direct child of the skills
    // directory. A name that cannot satisfy that is not turned into a unit at all.
    const dest = path.resolve(skillsDir, name);
    if (path.dirname(dest) !== skillsRoot) {
      units[0].markerProblem =
        units[0].markerProblem ||
        `add-on selection resolves outside the skills directory: ${JSON.stringify(name)}`;
      continue;
    }
    const unauthorized = authorize(name, dest);
    if (unauthorized) {
      units[0].markerProblem = units[0].markerProblem || unauthorized;
      continue;
    }
    units.push({
      skill: name,
      kind: "addon",
      dest,
      addon: discovered.get(name) || null,
      sourceRoot: (discovered.get(name) || {}).root || null,
      isCore: false,
      // No recorded selection (no core marker of ours) means nothing to contradict.
      selected: recordedSet === null ? true : recordedSet.has(name)
    });
  }

  // Read-only commands must also see an add-on directory that is on disk but NOT in the
  // recorded selection. `--no-addons` and an excluding `--only` write only what they select;
  // they do not remove what a previous (or foreign) install left behind. Deriving the
  // traversal from the selection alone therefore made a still-installed skill vanish from
  // health output — so `doctor` reporting green was not evidence that the availability
  // opt-out had taken effect, which is precisely what the README tells users to rely on for
  // the bidding skill. (review round 4, codex-1 MAJOR.)
  //
  // Install and uninstall keep the selection-only view: this is a visibility rule, not a
  // licence to touch directories the user did not select.
  // An explicit `--only` / `--no-addons` on a READ command is a filter the caller asked for,
  // not a statement about what is installed. Treating it as the recorded selection made
  // `doctor --only parley-bidding` label four correctly-recorded add-ons "not part of the
  // recorded selection", fail health, and recommend deleting them. A narrowing flag must
  // narrow. (review round 5, codex-1 MAJOR.)
  const readCommand =
    context && context.options && context.options.command !== "install" && context.options.command !== "uninstall";
  const explicitFilter = context && context.options && (context.options.only || context.options.noAddons);
  if (readCommand && !explicitFilter) {
    const seen = new Set(units.map((unit) => unit.skill));
    for (const [name, addon] of discovered) {
      if (seen.has(name)) continue;
      if (!dirExists(path.join(skillsDir, name))) continue;
      units.push({
        skill: name,
        kind: "addon",
        dest: path.join(skillsDir, name),
        addon,
        sourceRoot: addon.root || null,
        isCore: false,
        selected: false
      });
    }
  }
  return units;
}

// Everything that can be known to fail before the first byte is written: an unmarked
// destination we would have to replace, and a source add-on whose own manifest does not
// describe the files beside it. Checked for every unit up front so a predictable failure
// on the last add-on cannot leave the earlier ones already replaced.
function preflightSkillUnit(target, unit, context) {
  const dest = unit.dest;

  // A damaged recorded selection is NOT blocked here. Health reports it and uninstall refuses
  // it, but install's units come from discovery and flags, never from the marker — so blocking
  // buys no path safety and leaves the user with no command that can repair the state.
  // Installing rewrites the selection, which is the repair. (review round 13, kimi-1 MINOR.)

  // Whether the destination can exist at all is not an ownership question, so `--force` must
  // not suppress it. It did: with `~/.aionrs/skills` a regular file, `--force` skipped the only
  // check that looked at the path and 78 units across 13 targets were written before `aionrs`
  // failed. `--force` overrides *whose* tree may be replaced, never physics.
  // (review round 9, codex-1 MAJOR.)
  const impossible = destinationAncestorObstacle(dest);
  if (impossible) {
    return { ok: false, skill: unit.skill, dest, action: "blocked", message: impossible };
  }

  if (pathEntryExists(dest) && !installerOwnsDestination(dest, unit.skill) && !context.options.force) {
    return {
      ok: false,
      skill: unit.skill,
      dest,
      action: "blocked",
      message: "Destination exists but was not installed by parley-deck-skill. Re-run with --force to replace it."
    };
  }

  // Removability is deliberately NOT predicted here either. Replacement commits by rename, and
  // since cycle 14 a failed backup cleanup is a warning rather than a failure, so the walk this
  // used to do guarded nothing that survives — while wrongly refusing removable trees.
  // (review round 11: see `quarantineName`.)

  // Validate the source payload before any destination write, not after staging it.
  if (unit.addon && addonManifest.hasManifest(unit.addon.root)) {
    const verified = addonManifest.verifyPayload(unit.addon.root);
    if (!verified.ok) {
      return {
        ok: false,
        skill: unit.skill,
        dest,
        action: "failed",
        message: `Source payload does not match ${addonManifest.MANIFEST_FILE}: ${verified.problems.join("; ")}`
      };
    }
  }

  // …and for EVERY unit, manifest or not, walk the source read-only for the defects
  // `copyRecursive` refuses. Checking only manifested add-ons left a manifest-free one to fail
  // during the sequential write loop — after the core and every preceding add-on had already
  // been replaced. That is exactly the partial fleet B5 forbids, reachable with a symlink.
  // (review round 1, codex-1 MAJOR.)
  for (const source of copySourcesFor(unit, context)) {
    const problem = firstCopyObstacle(source.root, source.root);
    if (problem) {
      return { ok: false, skill: unit.skill, dest, action: "failed", message: problem };
    }
  }

  return null;
}

// Every path this unit will copy from. An add-on is one directory; the core is assembled from
// several package entries, which the first version of this check skipped entirely while the
// comment claimed "every source unit". (review round 8, codex-1.)
function copySourcesFor(unit, context) {
  if (unit.addon) {
    return [{ root: unit.addon.root }];
  }
  const roots = [];
  for (const entry of PAYLOAD_ENTRIES) {
    roots.push({ root: path.join(context.packageRoot, entry.from) });
  }
  for (const entry of OPTIONAL_PAYLOAD_ENTRIES) {
    const src = path.join(context.packageRoot, entry.from);
    if (fs.existsSync(src)) roots.push({ root: src });
  }
  return roots;
}

// Read-only mirror of what `copyRecursive` will refuse or fail on: a symlink anywhere in the
// tree, or an entry it cannot stat or read. Returns the first obstacle's message, or null.
function firstCopyObstacle(root, dir) {
  // A source entry may be a single file (the core copies `SKILL.md`, `plugin.json`, …), not
  // only a directory.
  let rootStat;
  try {
    rootStat = fs.lstatSync(dir);
  } catch (error) {
    return `Source payload is unreadable at ${path.basename(dir)}: ${error.message}`;
  }
  if (rootStat.isSymbolicLink()) {
    return `Refusing to copy symlink in skill payload: ${path.basename(dir)}`;
  }
  if (!rootStat.isDirectory()) {
    if (!rootStat.isFile()) {
      return `Source payload contains a non-regular file at ${path.basename(dir)}`;
    }
    try {
      fs.accessSync(dir, fs.constants.R_OK);
    } catch (error) {
      return `Source payload is unreadable at ${path.basename(dir)}: ${error.message}`;
    }
    return null;
  }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (error) {
    return `Source payload is unreadable at ${path.relative(root, dir) || "."}: ${error.message}`;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry);
    const rel = path.relative(root, abs);
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch (error) {
      return `Source payload is unreadable at ${rel}: ${error.message}`;
    }
    if (stat.isSymbolicLink()) {
      return `Refusing to copy symlink in skill payload: ${rel}`;
    }
    if (stat.isDirectory()) {
      const nested = firstCopyObstacle(root, abs);
      if (nested) return nested;
      continue;
    }
    if (!stat.isFile()) {
      return `Source payload contains a non-regular file at ${rel}`;
    }
    try {
      fs.accessSync(abs, fs.constants.R_OK);
    } catch (error) {
      return `Source payload is unreadable at ${rel}: ${error.message}`;
    }
  }
  return null;
}

function installSkillUnit(target, unit, context) {
  const dest = unit.dest;
  try {
    const existing = pathEntryExists(dest);
    // Ownership, not the mere presence of a file at the marker path: a foreign or unreadable
    // marker means this is not ours to replace. Health already said so; the mutation path
    // disagreed with it. (review round 4, codex-1 MAJOR.)
    const marked = existing && installerOwnsDestination(dest, unit.skill);

    if (existing && !marked && !context.options.force) {
      return {
        ok: false,
        skill: unit.skill,
        dest,
        action: "blocked",
        message: "Destination exists but was not installed by parley-deck-skill. Re-run with --force to replace it."
      };
    }

    if (context.options.dryRun) {
      return {
        ok: true,
        skill: unit.skill,
        dest,
        action: existing ? "replace" : "install",
        dryRun: true
      };
    }

    const staged = copyPayloadAtomically(dest, target, unit, context);
    const committed = commitStagedUnit(staged);
    const warning = discardBackup(committed);
    return {
      ok: true,
      skill: unit.skill,
      dest,
      action: existing ? "replaced" : "installed",
      ...(warning ? { warning } : {})
    };
  } catch (error) {
    return {
      ok: false,
      skill: unit.skill,
      dest,
      action: "failed",
      message: error.message
    };
  }
}

// Two logical destinations can be one physical directory: a runtime's configured skills
// container may be a symlink, and two of them may point at the same place. Measured before this:
// with agy's and gemini's containers aliased, `install --target all` returned ok:true for both
// while gemini's commit silently overwrote agy's specialized core. The two targets want
// *different* payloads, so a shared destination is a configuration this tool cannot satisfy —
// it must say so rather than pick a winner. `dest` may not exist yet, so the parent is resolved
// and the basename appended. (review round 13: codex-1 MAJOR, hermes-1 MINOR.)
// Physical ancestry, component by component. Three models were tried and each lost something:
// realpath strings cannot see an APFS firmlink respelling; a single `dev:ino` + tail key cannot
// see nesting whose two sides anchor on different existing ancestors; and the union of those two
// still misses a respelling that HAS an existing inner parent, which codex-1 measured.
//
// What survives all of them is the chain itself: every component's identity, root first.
// Existing components contribute `dev:ino`, so any two spellings of one directory agree there;
// a not-yet-created tail contributes the nearest existing identity plus the remaining names.
// Containment is then simply "B's identity appears somewhere in A's chain".
// (review round 18: codex-1 MAJOR, hermes-1 MAJOR, kimi-1 — unanimous.)
const CASE_INSENSITIVE_FS = process.platform === "darwin" || process.platform === "win32";

// APFS and HFS+ normalize names themselves, so two spellings of one name are one file there.
// A case-sensitive, byte-exact filesystem does not: normalizing would conflate genuinely
// different entries. Fold only where the filesystem folds. (review round 19, kimi-1 NIT.)
function canonicalSegment(name) {
  if (!CASE_INSENSITIVE_FS) return name;
  return name.normalize("NFC").toLowerCase();
}

// Split an absolute path at its real root. Both walkers restarted from `path.sep`, which is
// correct only for POSIX: on Windows `C:\\Users\\a` became the probes `\\C:` and `\\C:\\Users`,
// and a UNC path lost its whole `\\\\server\\share\\` root — so `statSync` never saw a real
// component and the gate silently degraded to spelling-derived values on a shipped channel.
// (review round 19: codex-1 MAJOR, kimi-1 MAJOR.)
// `impl` is injectable so the Windows arithmetic can be exercised from a POSIX host — the
// channel ships a Windows binary that CI never executes, so a test that only asserts
// `path.win32`'s own behaviour would pin nothing about this function.
function splitAtRoot(target, impl = path) {
  const resolved = impl.resolve(target);
  const root = impl.parse(resolved).root || impl.sep;
  const rest = resolved.slice(root.length);
  return { root, parts: rest.split(impl.sep).filter(Boolean) };
}

function identityChain(target) {
  const { root, parts } = splitAtRoot(target);
  const chain = [];
  let logical = root;
  let anchor = null;
  let pending = [];
  for (const part of parts) {
    logical = path.join(logical, part);
    let stat = null;
    try {
      stat = fs.statSync(logical);
    } catch (_error) {
      stat = null;
    }
    if (stat) {
      anchor = `${stat.dev}:${stat.ino}`;
      pending = [];
      chain.push(anchor);
    } else {
      pending.push(canonicalSegment(part));
      chain.push(anchor ? `${anchor}/${pending.join("/")}` : canonicalSegment(logical));
    }
  }
  return chain.length > 0 ? chain : [canonicalSegment(path.resolve(target))];
}

// Where an ENTRY sits, as a chain: its parent's ancestry plus its own name. Keyed this way a
// symlink is located by the directory holding it, however deep, rather than by whatever it
// resolves to — keying only the immediate parent lost that for links buried below an existing
// subdirectory. (review round 18, codex-1.)
function entryChain(entry) {
  const resolved = path.resolve(entry);
  const chain = identityChain(path.dirname(resolved));
  const parentIdentity = chain[chain.length - 1];
  return [...chain, `${parentIdentity}/${canonicalSegment(path.basename(resolved))}`];
}

// Walk a RAW link target one component at a time, recording each entry the kernel must actually
// consult, and applying `..` only after that entry is recorded. `path.join` collapses `name/..`
// pairs lexically, so a target such as `../KM/skills/parley-deck/transient/../../../../away`
// reduced to `away` and the dependency on `transient` — which lives inside another planned
// destination and is what makes the link work at all — was never seen.
// (review round 19, codex-1 MAJOR.)
// Walk a RAW link target the way the kernel does: physically, not lexically.
//
// Two things were wrong. The walk never asked whether a component it had just entered is itself
// a link, so subsequent `..` components stepped back through the *spelling* rather than through
// the expanded target — a link `../mid/transient/../../../../../away`, where `mid` points inside
// another planned destination, therefore never recorded that destination at all. And for an
// absolute target the root was used as the starting point AND replayed as an ordinary
// component, so on Windows `C:\target\x` probed `C:\C:\target\x` and a UNC target duplicated
// its server and share, stopping the chain on a path that cannot exist.
// (review round 20: codex-1 MAJOR x2, hermes-1 MAJOR x2, kimi-1 MAJOR — unanimous.)
// Where a raw link target starts and how it splits — extracted and injectable so the Windows
// arithmetic is provable from a POSIX host. `splitAtRoot` was made injectable in cycle 23 and
// this second copy of the same logic was not, so the drive and UNC arms of the very defect
// cycle 24 fixed had nothing executable asserting them. (review round 22, codex-1.)
//
// `\\` is a separator only on Windows; on POSIX it is an ordinary byte in a filename.
function rawTargetArithmetic(from, rawTarget, impl = path, resolveParent = (dir) => dir) {
  // Determined solely by the injected implementation. Consulting the host platform as well made
  // the helper asymmetric — win32 semantics could be injected on POSIX, but POSIX semantics were
  // overridden on Windows, which is exactly the arm this regression added.
  // (review round 23, codex-1 MAJOR.)
  const separators = impl.sep === "\\" ? /[\\/]+/ : /\/+/;
  if (impl.isAbsolute(rawTarget)) {
    const root = impl.parse(rawTarget).root || impl.sep;
    return { start: root, parts: rawTarget.slice(root.length).split(separators).filter(Boolean) };
  }
  return {
    start: resolveParent(impl.dirname(from)),
    parts: rawTarget.split(separators).filter(Boolean)
  };
}

function walkRawTarget(from, rawTarget, record, depth = 0) {
  if (depth > 32) return null;

  // A relative target starts where the link PHYSICALLY sits. Anchoring on the spelling meant
  // that once an earlier ancestor link had been expanded by the kernel, every `..` in this
  // target climbed a different tree than the kernel climbs. (review round 21: codex-1, kimi-1.)
  //
  // And `\\` is a separator only on Windows; on POSIX it is an ordinary byte in a filename, so
  // splitting on it there would tear `a\\b` into two components. (review round 21, codex-1.)
  const { start, parts } = rawTargetArithmetic(from, rawTarget, path, (dir) => {
    try {
      return fs.realpathSync(dir);
    } catch (_error) {
      return dir;
    }
  });
  let current = start;

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      current = path.dirname(current);
      continue;
    }
    current = path.join(current, part);
    record(current);

    // Expand immediately, so anything after this component walks the real tree.
    let stat = null;
    try {
      stat = fs.lstatSync(current);
    } catch (_error) {
      stat = null;
    }
    if (!stat || !stat.isSymbolicLink()) continue;
    let target = null;
    try {
      target = fs.readlinkSync(current);
    } catch (_error) {
      target = null;
    }
    if (target === null) continue;
    const landed = walkRawTarget(current, target, record, depth + 1);
    if (landed !== null) current = landed;
  }
  return current;
}

function resolutionTouchpoints(dest) {
  // Every physical location a resolution passes THROUGH, each as an entry chain: the symlink
  // itself and every entry consulted while following it. (review rounds 16-19.)
  const { root, parts } = splitAtRoot(dest);
  const chains = [];
  const seen = new Set();
  const record = (candidate) => {
    const chain = entryChain(candidate);
    const key = chain[chain.length - 1];
    if (seen.has(key)) return;
    seen.add(key);
    chains.push(chain);
  };

  let logical = root;
  for (const part of parts) {
    logical = path.join(logical, part);
    let stat = null;
    try {
      stat = fs.lstatSync(logical);
    } catch (_error) {
      stat = null;
    }
    if (!stat || !stat.isSymbolicLink()) continue;

    record(logical);
    let target = null;
    try {
      target = fs.readlinkSync(logical);
    } catch (_error) {
      target = null;
    }
    if (target === null) continue;
    // Continue from where the link LANDS. `walkRawTarget` returns that; discarding it left the
    // rest of this walk — and any later link's relative target — anchored on the spelling.
    // (review round 21, kimi-1: the remedy, stated exactly.)
    const landed = walkRawTarget(logical, target, record);
    if (landed !== null) logical = landed;
  }
  return chains;
}

// Returns a Map of unit -> blocker for every unit whose destination collides with another's:
// the same physical object, one inside the other, or one reachable only through the other.
function aliasedDestinations(plan) {
  const entries = [];
  for (const { target, units } of plan) {
    for (const unit of units) {
      const chain = identityChain(unit.dest);
      entries.push({
        target,
        unit,
        chain,
        identity: chain[chain.length - 1],
        touchpoints: resolutionTouchpoints(unit.dest)
      });
    }
  }

  const blocked = new Map();
  const refuse = (a, b, message) => {
    for (const entry of [a, b]) {
      if (blocked.has(entry.unit)) continue;
      blocked.set(entry.unit, {
        ok: false,
        skill: entry.unit.skill,
        dest: entry.unit.dest,
        action: "blocked",
        message
      });
    }
  };

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      const where = `${a.target.name}/${a.unit.skill} and ${b.target.name}/${b.unit.skill}`;

      // Resolution passing through the other unit's tree: checked first, because it is the case
      // the destinations' own identities cannot express.
      const crosses =
        a.touchpoints.some((chain) => chain.includes(b.identity)) ||
        b.touchpoints.some((chain) => chain.includes(a.identity));
      if (crosses) {
        refuse(a, b, `Destinations depend on each other: ${where} — resolving one passes through the other. Point them at independent paths and re-run.`);
        continue;
      }
      if (a.identity === b.identity) {
        refuse(a, b, `Destination is shared by ${where} — they resolve to the same directory. Point them at separate paths and re-run.`);
        continue;
      }
      if (a.chain.includes(b.identity) || b.chain.includes(a.identity)) {
        refuse(a, b, `Destination overlaps another in this plan: ${where} — one contains the other. Point them at independent paths and re-run.`);
      }
    }
  }
  return blocked;
}

// Install is transactional across the whole fleet for the same reason uninstall is, and for a
// reason cycle 15 got wrong: deleting the removability predicate removed install's last
// fleet-wide guard, and a destination directory carrying `uchg` makes the commit rename itself
// fail — measured, 83 units written before the 84th failed. "Install already commits by rename"
// was true of the commit and false of the fleet. (review round 12, kimi-1 MAJOR.)
//
// Phase 1 stages every unit; no destination is touched, so a staging failure costs nothing.
// Phase 2 commits them; a failure at any unit reverts every earlier commit, both moves being
// renames within the same parent. Phase 3 discards backups, where a failure is a warning.
function installFleetAtomically(plan, context) {
  const results = new Map();
  const pending = [];

  const aliased = aliasedDestinations(plan);
  for (const { target, units } of plan) {
    for (const unit of units) {
      const blocker = aliased.get(unit) || preflightSkillUnit(target, unit, context);
      if (blocker) {
        results.set(unit, blocker);
        continue;
      }
      pending.push({ target, unit });
    }
  }

  const skipRest = (message) => {
    for (const { unit } of pending) {
      if (results.has(unit)) continue;
      results.set(unit, {
        ok: false, skill: unit.skill, dest: unit.dest, action: "skipped", message
      });
    }
    return results;
  };

  if ([...results.values()].some((result) => !result.ok)) {
    return skipRest("Not attempted: another skill or target in this install failed preflight.");
  }

  if (context.options.dryRun) {
    for (const { unit } of pending) {
      results.set(unit, {
        ok: true,
        skill: unit.skill,
        dest: unit.dest,
        action: pathEntryExists(unit.dest) ? "replace" : "install",
        dryRun: true
      });
    }
    return results;
  }

  // Phase 1 — stage.
  const staged = [];
  for (const { target, unit } of pending) {
    try {
      staged.push({ unit, staged: copyPayloadAtomically(unit.dest, target, unit, context) });
    } catch (error) {
      for (const done of staged) {
        if (pathEntryExists(done.staged.temp)) {
          fs.rmSync(done.staged.temp, { recursive: true, force: true });
        }
      }
      results.set(unit, {
        ok: false, skill: unit.skill, dest: unit.dest, action: "failed", message: error.message
      });
      return skipRest("Not attempted: another skill or target in this install could not be staged.");
    }
  }

  // Phase 2 — commit.
  const committed = [];
  for (const entry of staged) {
    try {
      committed.push({ unit: entry.unit, committed: commitStagedUnit(entry.staged) });
    } catch (error) {
      for (const done of [...committed].reverse()) {
        try {
          revertStagedUnit(done.committed);
        } catch (revertError) {
          results.set(done.unit, {
            ok: false,
            skill: done.unit.skill,
            dest: done.unit.dest,
            action: "failed",
            message: `Rolled back, but the previous copy could not be restored (${revertError.code}); it is at ${done.committed.backup}`
          });
        }
      }
      for (const leftover of staged) {
        if (pathEntryExists(leftover.staged.temp)) {
          fs.rmSync(leftover.staged.temp, { recursive: true, force: true });
        }
      }
      results.set(entry.unit, {
        ok: false,
        skill: entry.unit.skill,
        dest: entry.unit.dest,
        action: "failed",
        message: `Destination could not be replaced (${error.code}); nothing was installed.`
      });
      return skipRest("Not attempted: another skill or target in this install could not be committed.");
    }
  }

  // Phase 3 — housekeeping.
  for (const entry of committed) {
    const warning = discardBackup(entry.committed);
    results.set(entry.unit, {
      ok: true,
      skill: entry.unit.skill,
      dest: entry.unit.dest,
      action: entry.committed.replaced ? "replaced" : "installed",
      ...(warning ? { warning } : {})
    });
  }

  return results;
}

// Phase A renames every destination in the WHOLE PLAN aside; only when all of them are
// quarantined does anything get deleted. A rename failure rolls back every rename already made,
// across every target, so the fleet is untouched — which is what makes it safe to stop
// predicting whether the trees can be deleted. Returns a Map keyed by unit object.
function removeFleetAtomically(plan, context) {
  const results = new Map();
  const pending = [];

  const aliased = aliasedDestinations(plan);
  for (const { units } of plan) {
    for (const unit of units) {
      const shared = aliased.get(unit);
      if (shared) {
        results.set(unit, shared);
        continue;
      }
      if (unit.markerProblem) {
        results.set(unit, {
          ok: false, skill: unit.skill, dest: unit.dest, action: "blocked", message: unit.markerProblem
        });
        continue;
      }
      if (!pathEntryExists(unit.dest)) {
        results.set(unit, { ok: true, skill: unit.skill, dest: unit.dest, action: "missing" });
        continue;
      }
      if (!context.options.force && !installerOwnsDestination(unit.dest, unit.skill)) {
        results.set(unit, {
          ok: false,
          skill: unit.skill,
          dest: unit.dest,
          action: "blocked",
          message: "Destination is not marked as a parley-deck-skill install. Re-run with --force to remove it."
        });
        continue;
      }
      pending.push(unit);
    }
  }

  // A blocker anywhere in the plan means nothing is quarantined at all: the fleet gate. It is
  // evaluated BEFORE any unit is recorded as removable, because dry-run used to record each
  // good unit as `remove` on the way past and never revisit it — so a dry run promised five
  // removals the real command refused. (review round 14, codex-1 MINOR.)
  const blockedAnywhere = [...results.values()].some((result) => !result.ok);
  if (blockedAnywhere) {
    for (const unit of pending) {
      results.set(unit, {
        ok: false,
        skill: unit.skill,
        dest: unit.dest,
        action: "skipped",
        message: "Not attempted: another skill or target in this uninstall failed preflight."
      });
    }
    return results;
  }

  if (context.options.dryRun) {
    for (const unit of pending) {
      results.set(unit, { ok: true, skill: unit.skill, dest: unit.dest, action: "remove", dryRun: true });
    }
    return results;
  }

  // Phase A — quarantine, fleet-wide.
  const quarantined = [];
  for (const unit of pending) {
    const aside = quarantineName(unit.dest);
    try {
      fs.renameSync(unit.dest, aside);
      quarantined.push({ unit, aside });
    } catch (error) {
      const failedUnit = unit;
      for (const done of [...quarantined].reverse()) {
        try {
          fs.renameSync(done.aside, done.unit.dest);
        } catch (rollbackError) {
          results.set(done.unit, {
            ok: false,
            skill: done.unit.skill,
            dest: done.unit.dest,
            action: "failed",
            message: `Rolled back, but the directory could not be restored (${rollbackError.code}); it is at ${done.aside}`
          });
        }
      }
      for (const other of pending) {
        if (results.has(other)) continue;
        results.set(
          other,
          other === failedUnit
            ? {
                ok: false,
                skill: other.skill,
                dest: other.dest,
                action: "blocked",
                message: `Destination could not be set aside for removal (${error.code}); nothing was deleted.`
              }
            : {
                ok: false,
                skill: other.skill,
                dest: other.dest,
                action: "skipped",
                message: "Not attempted: another skill or target in this uninstall could not be set aside."
              }
        );
      }
      return results;
    }
  }

  // Phase B — the destinations are already gone; what is left is housekeeping.
  for (const { unit, aside } of quarantined) {
    let warning = null;
    try {
      fs.rmSync(aside, { recursive: true, force: true });
    } catch (error) {
      warning = `removed, but the quarantined copy could not be deleted (${error.code}): ${aside}`;
    }
    results.set(unit, {
      ok: true,
      skill: unit.skill,
      dest: unit.dest,
      action: "removed",
      ...(warning ? { warning } : {})
    });
  }

  return results;
}

function copyPayloadAtomically(dest, target, unit, context) {
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const temp = path.join(parent, `.${path.basename(dest)}.${process.pid}.${Date.now()}.tmp`);
  const backup = path.join(parent, `.${path.basename(dest)}.${process.pid}.${Date.now()}.bak`);

  try {
    fs.mkdirSync(temp, { recursive: true });
    if (unit.addon) {
      // Add-ons are inert instruction directories: copy the add-on's tree verbatim.
      for (const entry of listVisibleEntries(unit.addon.root)) {
        copyRecursive(path.join(unit.addon.root, entry), path.join(temp, entry));
      }
    } else {
      for (const entry of PAYLOAD_ENTRIES) {
        copyRecursive(path.join(context.packageRoot, entry.from), path.join(temp, entry.to));
      }
      for (const entry of OPTIONAL_PAYLOAD_ENTRIES) {
        const src = path.join(context.packageRoot, entry.from);
        if (fs.existsSync(src)) {
          copyRecursive(src, path.join(temp, entry.to));
        }
      }
      if (target.kind === "antigravity") {
        copyRecursive(
          path.join(context.packageRoot, CORE_SKILL_DIR, "SKILL.md"),
          path.join(temp, "skills", "SKILL.md")
        );
      }
      // The repository manifest points at the skill's real repository path so that a Gemini
      // extension installed straight from the repo URL resolves. A native install has the
      // flat destination shape instead, with SKILL.md at its root, so the staged copy is
      // rewritten to match the destination it is actually going into. One canonical skill
      // tree, two consumers, no second copy of SKILL.md.
      if (target.kind === "gemini") {
        rewriteStagedGeminiManifest(path.join(temp, "gemini-extension.json"));
      }
    }
    // Revalidate the staged bytes before the marker is written, so the marker can only ever
    // be stamped onto a payload that already matched its own manifest at this destination.
    if (unit.addon && addonManifest.hasManifest(unit.addon.root)) {
      const staged = addonManifest.verifyPayload(temp);
      if (!staged.ok) {
        throw new InstallerError(
          `Staged payload does not match ${addonManifest.MANIFEST_FILE}: ${staged.problems.join("; ")}`
        );
      }
    }
    writeMarker(temp, target, unit, context);
    validateInstalledPayload(
      temp,
      unit.kind,
      undefined,
      Boolean(unit.sourceRoot && addonManifest.hasManifest(unit.sourceRoot)),
      unit.packageRoot
    );

    // Staged only. The destination is untouched until `commitStagedUnit`, so a staging failure
    // anywhere in the fleet costs nothing. (review round 12, kimi-1 MAJOR.)
    return { dest, temp, backup };
  } catch (error) {
    if (pathEntryExists(temp)) fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

// Move a staged unit into place. Returns an undo record; the caller rolls the fleet back with
// `revertStagedUnit` if any later unit fails to commit.
function commitStagedUnit(staged) {
  const replaced = pathEntryExists(staged.dest);
  if (replaced) {
    fs.renameSync(staged.dest, staged.backup);
  }
  try {
    fs.renameSync(staged.temp, staged.dest);
  } catch (error) {
    if (replaced && !pathEntryExists(staged.dest) && pathEntryExists(staged.backup)) {
      fs.renameSync(staged.backup, staged.dest);
    }
    throw error;
  }
  return { ...staged, replaced };
}

// Both moves are renames within the same parent, so undoing them needs exactly the permission
// the forward move already proved.
function revertStagedUnit(committed) {
  fs.renameSync(committed.dest, committed.temp);
  if (committed.replaced) {
    fs.renameSync(committed.backup, committed.dest);
  }
}

// Past this point the replacement is committed and correct on disk. Removing the old copy is
// housekeeping: if it fails, the unit is still installed, and throwing would report `failed` for
// a unit that succeeded — turning a complete fleet into a partial one on the strength of
// leftover debris. (review round 10, codex-1 MAJOR.)
function discardBackup(committed) {
  if (!committed.replaced || !pathEntryExists(committed.backup)) return null;
  try {
    fs.rmSync(committed.backup, { recursive: true, force: true });
    return null;
  } catch (error) {
    return `installed, but the previous copy could not be removed (${error.code}): ${committed.backup}`;
  }
}

function writeMarker(root, target, unit, context) {
  const marker = {
    name: "parley-deck-skill",
    markerSchema: MARKER_SCHEMA,
    skill: unit.skill,
    addon: unit.isCore ? false : true,
    version: PACKAGE_JSON.version,
    source: installSource(),
    target: target.name,
    scope: context.options.scope,
    installedAt: new Date().toISOString()
  };
  // Persist the install selection in the core marker so later read/uninstall runs
  // can tell intentionally-omitted add-ons (absent by choice) from broken installs.
  // `false` records a core-only install; an array lists the installed add-on names.
  if (unit.isCore) {
    const names = selectedAddons(context).map((addon) => addon.name);
    marker.addons = names.length > 0 ? names : false;
  } else {
    // Anchor the manifest requirement in the marker rather than in a name-keyed rule, so no
    // add-on is named in installer code and deleting parley-addon.json after installation is
    // still detectable. Two values, not a boolean: the aggregate catches a self-consistent
    // manifest+payload swap, the raw hash binds the manifest's own metadata (its runtime
    // floor included). `false` records that the source genuinely shipped none.
    //
    // Known limit: this cannot detect a manifest omitted before the first install ever
    // observed the source. That case is covered by the release-time inventory check, not
    // here — and none of it is tamper resistance, only defect detection.
    marker.manifest = addonManifest.hasManifest(unit.addon ? unit.addon.root : root)
      ? {
          aggregate: addonManifest.readManifest(unit.addon ? unit.addon.root : root).manifest.aggregate,
          sha256: addonManifest.manifestFileHash(unit.addon ? unit.addon.root : root)
        }
      : false;
  }
  fs.writeFileSync(markerPath(root), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

function copyRecursive(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new InstallerError(`Refusing to copy symlink in skill payload: ${src}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fs.readFileSync(src));
}

function installSource() {
  return process.pkg
    ? `portable:${PACKAGE_JSON.name}@${PACKAGE_JSON.version}`
    : `npm:${PACKAGE_JSON.name}@${PACKAGE_JSON.version}`;
}

function targetStatus(target, context, options) {
  const units = context ? targetSkillUnits(target, context) : [{ skill: SKILL_NAME, kind: target.kind, dest: target.dest, isCore: true }];
  const skills = units.map((unit) => skillUnitStatus(unit, options));
  const core = skills[0];
  return {
    target: target.name,
    dest: core.dest,
    detected: target.detected,
    status: core.status,
    marker: core.marker,
    missing: core.missing,
    skills
  };
}

function skillUnitStatus(unit, options) {
  if (!pathEntryExists(unit.dest)) {
    return {
      skill: unit.skill,
      dest: unit.dest,
      status: "missing",
      managed: false,
      marker: null,
      missing: [],
      problems: [],
      runtime: null
    };
  }
  const state = readMarkerState(unit.dest);
  const validation = validateInstalledPayload(
    unit.dest,
    unit.kind,
    { collect: true },
    Boolean(unit.sourceRoot && addonManifest.hasManifest(unit.sourceRoot)),
    // Only a tree we installed is held to the copy plan. See validateInstalledPayload.
    state.present ? unit.packageRoot : null
  );
  const problems = [...(validation.problems || [])];

  // A recorded selection that cannot be trusted is a defect of this unit's own marker, and
  // health must say so — otherwise the one command a user runs to check the install stays
  // green while both mutation paths refuse to touch it. (review round 11, codex-1 CRITICAL.)
  if (unit.markerProblem) {
    problems.push(unit.markerProblem);
  }

  // Every unit reaching here is EXPECTED: it comes from the install selection recorded in the
  // core marker, or from an explicit --only. For such a unit a missing or unreadable marker is
  // itself the defect — without it there is no anchor, so an add-on gutted to `SKILL.md` with
  // the marker deleted alongside would otherwise pass the required-file check and report
  // `valid`. That is the gutted-tree false green B3 exists to close, reached by deleting one
  // extra file. Centralized here so every add-on gets it, not only the ones that ship a
  // manifest. (review round 1: codex-1 MAJOR, hermes-1 CRITICAL; ratified in round-03.)
  // A tree with NO marker at all may still be provably intact: another skill installer can
  // copy the payload faithfully, manifest included, and writes no marker of ours. Calling that
  // `malformed` contradicts this package's own strongest evidence — the manifest verifies —
  // and it mislabels the install path this README recommends first. So the absent-marker case
  // splits: proven-intact-but-unmanaged, or malformed.
  //
  // Only ENTIRELY ABSENT qualifies. A present-but-unreadable marker, or one naming another
  // installer, is corruption or tampering of management metadata rather than "never installed
  // by this tool", and stays malformed.
  // (review round 3, ratified unanimously as option (b): codex-1 MAJOR, hermes-1, kimi-1.)
  let unmanaged = false;
  if (!state.present) {
    if (unmanagedButVerified(unit)) {
      unmanaged = true;
    } else {
      problems.push("no parley-deck-skill install marker: this directory was not installed by this tool, or the marker was removed");
    }
  } else if (!state.readable) {
    problems.push("the parley-deck-skill install marker is unreadable or is not valid JSON");
  } else if (state.marker.name !== PACKAGE_JSON.name) {
    problems.push(`the install marker belongs to ${JSON.stringify(state.marker.name)}, not parley-deck-skill`);
  } else if (state.marker.skill !== unit.skill) {
    // The other half of the shared predicate. Checking only the package name let a marker
    // naming a DIFFERENT skill report valid and managed, while install and uninstall — which
    // do compare the skill — refused the same directory. One destination cannot be both
    // healthy-and-owned and unowned. (review round 5, codex-1 MAJOR.)
    //
    // An ABSENT `skill` is not exempt. Round 5's fix exempted `undefined` for imagined legacy
    // compatibility; codex-1 checked the released markers and v1.0.0, v1.4.0 and v2.0.0 all
    // wrote the identity, so the exemption protected nothing and left the same contradiction
    // one field deletion away. (review round 6, codex-1 MAJOR.)
    problems.push(
      state.marker.skill === undefined
        ? `the install marker carries no skill identity, so this directory cannot be confirmed as ${JSON.stringify(unit.skill)}`
        : `the install marker identifies this directory as ${JSON.stringify(state.marker.skill)}, not ${JSON.stringify(unit.skill)}`
    );
  }

  const payloadOk = validation.missing.length === 0 && problems.length === 0;

  // Being outside the recorded selection is a fact about the SELECTION, not about the files.
  // Calling a byte-valid, installer-owned tree `malformed` because a later `--only` run did
  // not name it repeats the overload round 3 corrected: two different problems, one word.
  // It still fails health — the installed state does not match what was recorded, and for
  // this add-on in particular a green `doctor` must not be read as "the opt-out worked".
  if (unit.selected === false) {
    problems.push(
      "installed but not part of the recorded selection: remove the directory, or re-run install including it"
    );
  }

  const ok = payloadOk && unit.selected !== false;
  const status = !payloadOk
    ? "malformed"
    : unit.selected === false
      ? "valid-unselected"
      : unmanaged
        ? "valid-unmanaged"
        : "valid";

  return {
    skill: unit.skill,
    dest: unit.dest,
    selected: unit.selected !== false,
    // A distinct status, not `valid` with a flag: automation that requires tool-managed
    // installs must be able to insist on one without parsing prose. `managed` is carried
    // alongside so the same fact is available as a boolean.
    status,
    managed: payloadOk ? !unmanaged : false,
    marker: state.marker,
    missing: validation.missing,
    problems,
    // Payload validity and operational availability are separate answers. A byte-perfect
    // payload whose declared interpreter is absent is `valid` and unavailable, not malformed.
    runtime: ok && options && options.probeRuntime ? runtimeAvailability(unit.dest, options.env, options.cwd) : null
  };
}

// True when an unmarked installed tree can still be proven intact: the packaged source for
// this unit declares a manifest, the installed tree carries one, and every declared file
// matches. Generic — it asks the source what it ships, so no add-on is named here.
//
// Deliberately narrow. A unit whose source ships no manifest has nothing to verify against,
// so an unmarked copy of it stays malformed; there is no evidence either way, and this tool
// will not vouch for a tree it did not install and cannot check. Closing that residual means
// shipping manifests for the remaining units, which the ratified contract (B3.11) holds
// unaffected by this change — recorded as a follow-up rather than taken here.
function unmanagedButVerified(unit) {
  // `unit.sourceRoot`, not `unit.addon.root`: the core is not an add-on, so reaching through
  // `addon` returned null for it and no core copy could ever be proven, however intact. The
  // predicate now asks every unit the same question and names no skill.
  const source = unit.sourceRoot || null;
  if (!source || !addonManifest.hasManifest(source)) {
    return false;
  }
  // The installed manifest may not be its own authority. Verifying the payload against
  // whichever manifest sits beside it recognizes ANY self-consistent tree, not the packaged
  // one — and because `runtime` lives outside the payload aggregate, deleting that one field
  // from the installed manifest silently disabled the B6 interpreter check without rehashing
  // a single file. The proof is anchored to the packaged source instead: same manifest bytes,
  // source itself intact, installed payload matching. (review round 4, codex-1 MAJOR.)
  if (!addonManifest.verifyPayload(source).ok) {
    return false;
  }
  const sourceHash = addonManifest.manifestFileHash(source);
  const installedHash = addonManifest.manifestFileHash(unit.dest);
  if (!sourceHash || sourceHash !== installedHash) {
    return false;
  }
  return addonManifest.verifyPayload(unit.dest).ok;
}

// Whether the interpreter an installed add-on declares in its manifest is actually present and
// meets the declared floor. Returns null when the unit declares no runtime requirement, so
// add-ons without one are unaffected.
//
// B6: `doctor` must fail health when the declared minimum is missing. Enforcing it only in the
// test runner left a byte-valid install whose published commands cannot run reporting healthy.
function runtimeAvailability(root, env, cwd) {
  const read = addonManifest.readManifest(root);
  if (!read.ok || !read.manifest.runtime || !read.manifest.runtime.python) {
    return null;
  }
  const spec = read.manifest.runtime.python;
  const floor = /^>=\s*(\d+)\.(\d+)$/.exec(spec);
  if (!floor) {
    return { ok: false, requirement: spec, detail: `unsupported python requirement ${JSON.stringify(spec)}` };
  }
  const probe = probePython3(env, cwd);
  if (!probe.found) {
    return { ok: false, requirement: spec, detail: `python3 is not available, but this skill requires ${spec}` };
  }
  const wanted = [Number(floor[1]), Number(floor[2])];
  if (probe.major < wanted[0] || (probe.major === wanted[0] && probe.minor < wanted[1])) {
    return {
      ok: false,
      requirement: spec,
      detail: `python3 is ${probe.major}.${probe.minor}, but this skill requires ${spec}`
    };
  }
  return { ok: true, requirement: spec, detail: `python3 ${probe.major}.${probe.minor}` };
}

// Memoized by the PATH that resolves the executable, not once per process: the installer is
// also a library, and `run(argv, io)` accepts an effective environment. A process-global answer
// let a caller with an empty PATH inherit the parent's Python and report healthy — checking the
// wrong environment does not answer an operational-availability question at all.
// (review round 2, codex-1 MAJOR.)
const pythonProbes = new Map();
function probePython3(env, cwd) {
  const effective = env && typeof env === "object" ? env : process.env;
  // A relative PATH entry resolves against the working directory, so two calls sharing an
  // environment but not a directory can resolve different interpreters.
  // (review round 5, codex-1 MINOR.)
  const workingDir = cwd ? path.resolve(cwd) : process.cwd();
  // Keyed on the WHOLE effective environment, serialized unambiguously. An enumerated list
  // missed variables that select the interpreter behind a stable PATH — a version-manager
  // shim answers to PYENV_VERSION — and a separator-joined key could collide, because the
  // separator can appear inside a value. JSON of sorted pairs has neither problem.
  // (review round 4, codex-1 MINOR; kimi-1 raised the collision.)
  const key = JSON.stringify([
    workingDir,
    Object.keys(effective)
      .sort()
      .map((name) => [name, String(effective[name])])
  ]);
  if (pythonProbes.has(key)) return pythonProbes.get(key);
  // A bounded wait: this runs inside a health check, and a PATH entry on a stalled network
  // mount must not hang `doctor` indefinitely.
  const run = spawnSync("python3", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
    encoding: "utf8",
    env: effective,
    cwd: workingDir,
    timeout: 5000
  });
  let probe;
  if (run.error || run.status !== 0) {
    probe = { found: false, major: 0, minor: 0 };
  } else {
    // Anchored, both parts required. Accepting whatever parsed let a broken shim printing
    // `4.not-a-version` become 4.0 and satisfy `>=3.10` — the fail-open direction on the one
    // check whose entire job is to fail closed. (review round 3, codex-1 MINOR.)
    const match = /^(\d+)\.(\d+)$/.exec(String(run.stdout).trim());
    probe = match
      ? { found: true, major: Number(match[1]), minor: Number(match[2]) }
      : { found: false, major: 0, minor: 0 };
  }
  pythonProbes.set(key, probe);
  return probe;
}

// Every destination-relative file the core copy plan writes, for one target kind. Derived from
// PAYLOAD_ENTRIES rather than hand-listed, because the hand-written lists drifted below what
// the installer actually installs: measured on 2.1.0, a natively installed core survived
// deletion of `plugin.json`, `agents/openai.yaml` and `references/WORKED_EXAMPLES.md` with
// `doctor` reporting `valid` and zero problems. Optional entries stay optional — their absence
// is not a defect. Same constant the staging loop copies from, so the two cannot disagree.
function corePayloadFiles(packageRoot, kind) {
  const files = [];
  const walk = (abs, rel) => {
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (_error) {
      return;
    }
    if (!stat.isDirectory()) {
      files.push(rel);
      return;
    }
    for (const entry of listVisibleEntries(abs)) {
      walk(path.join(abs, entry), `${rel}/${entry}`);
    }
  };
  for (const entry of PAYLOAD_ENTRIES) {
    walk(path.join(packageRoot, entry.from), entry.to);
  }
  if (kind === "antigravity") {
    files.push("skills/SKILL.md");
  }
  return files.sort();
}

function validateInstalledPayload(root, kind, options, sourceHasManifest, packageRoot) {
  let required;
  if (kind === "addon") {
    required = ["SKILL.md"];
  } else if (packageRoot) {
    required = corePayloadFiles(packageRoot, kind);
  } else if (kind === "gemini") {
    // Two cases reach here, and the historical lists are right for both.
    //
    // 1. The no-context fallback, which has no package root to derive from.
    // 2. A core tree this installer did NOT install. The copy plan describes OUR destination
    //    shape — `plugin.json` and `gemini-extension.json` are staged in from the repository
    //    root — but a foreign installer copies `skills/parley-deck/` and those two files are
    //    not in it. Measured: deriving the list for a foreign copy reported them `missing` and
    //    called a byte-perfect tree `malformed`, replacing one false red with another. For a
    //    tree that is not ours the manifest is the authority, via `unmanagedButVerified`, which
    //    byte-verifies every declared file; this list is only the floor beneath it.
    required = ["SKILL.md", "gemini-extension.json", "references/COOPERATION.md", "references/compatibility.json"];
  } else if (kind === "antigravity") {
    required = ["SKILL.md", "skills/SKILL.md", "plugin.json", "references/COOPERATION.md", "references/compatibility.json", "agents/manifest.yaml"];
  } else {
    required = ["SKILL.md", "references/COOPERATION.md", "references/compatibility.json", "agents/manifest.yaml"];
  }
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  const problems = kind === "addon" ? manifestProblems(root, sourceHasManifest) : [];
  const ok = missing.length === 0 && problems.length === 0;
  if (options && options.collect) {
    return { ok, missing, problems };
  }
  if (missing.length > 0) {
    throw new InstallerError(`Installed payload is missing required files: ${missing.join(", ")}`);
  }
  if (problems.length > 0) {
    throw new InstallerError(`Installed payload failed integrity validation: ${problems.join("; ")}`);
  }
  return { ok: true, missing: [], problems: [] };
}

// Integrity checks for an installed add-on directory, anchored in the marker written at
// install time. Returns a list of problems; empty means healthy.
//
// A directory with no installer-owned marker is not ours to judge — the caller already
// treats that as "not installed by us" — so it is checked on required files alone.
function manifestProblems(root, sourceHasManifest) {
  const marker = readMarker(root);
  if (!marker || marker.name !== PACKAGE_JSON.name) {
    return [];
  }

  const schema = marker.markerSchema;
  if (schema === undefined) {
    // Written by an older installer that knew nothing about manifests. It stays healthy;
    // re-installing upgrades it. This is the only path on which the check is skipped.
    //
    // The released 2.0.0 marker carries NEITHER field. A marker that still holds its `manifest`
    // but has lost only the schema is not that shape, and exempting it meant deleting one
    // metadata field silently downgraded a current install from byte validation to none.
    // (review round 10, codex-1 MAJOR.)
    if (marker.manifest !== undefined) {
      return ["install marker records a manifest but declares no markerSchema; re-install to repair it"];
    }
    // Cycle 14 moved the silent downgrade from one deleted field to two: deleting BOTH still
    // took the exemption, for an add-on that cannot have a legacy install. `parley-bidding` did
    // not ship in 2.0.0 and ships a manifest, so no released installer ever wrote it a
    // schema-less marker — that shape can only be damage. Scope the exemption to units whose
    // packaged source ships no manifest, which is what a genuine 2.0.0 install looks like.
    // (review round 11, codex-1 MAJOR, reproduced independently by hermes-1.)
    if (sourceHasManifest) {
      return ["install marker predates payload manifests, but this skill ships one; re-install to validate it"];
    }
    return [];
  }
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) {
    return [`install marker declares an invalid markerSchema (${JSON.stringify(schema)})`];
  }
  if (schema > MARKER_SCHEMA) {
    return [`install marker was written by a newer parley-deck-skill (markerSchema ${schema}); upgrade to validate it`];
  }

  const declared = marker.manifest;
  if (declared === undefined) {
    return [`install marker at markerSchema ${schema} is missing its "manifest" field`];
  }

  const present = addonManifest.hasManifest(root);

  if (declared === false) {
    // The source shipped no manifest. One appearing afterwards is an inconsistency to
    // report, never a silent promotion to "now validated".
    if (present) {
      return [`${addonManifest.MANIFEST_FILE} is present but the install marker records that none was installed`];
    }
    // `manifest: false` was written when this skill genuinely shipped none. Once it does, that
    // recorded fact is stale, and trusting it keeps the old install on the required-file check
    // alone — which for an add-on is `SKILL.md` and nothing else. Measured before this: an
    // install performed by 2.1.0, gutted to one file, still reported `valid` and exit 0 under
    // a build that ships the manifests. The fix would have reached only users who re-ran
    // install, which nobody does while `doctor` is green.
    //
    // Same shape as the schema-undefined branch above, which was ratified for exactly this
    // reason. Deliberately loud: an upgraded user with an intact pre-fix install sees a red
    // `doctor` until they re-install. That cost was put to the user and accepted on
    // 2026-08-01, because the alternative is that the check silently never applies to them.
    if (sourceHasManifest) {
      return [
        `install marker records that no ${addonManifest.MANIFEST_FILE} was installed, but this skill now ships one; re-run install to validate the payload`
      ];
    }
    return [];
  }

  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    return [`install marker has a malformed "manifest" field`];
  }
  if (typeof declared.aggregate !== "string" || typeof declared.sha256 !== "string") {
    return [`install marker has an incomplete "manifest" field (needs aggregate and sha256)`];
  }
  if (!present) {
    return [`${addonManifest.MANIFEST_FILE} is missing but the install marker records that one was installed`];
  }

  const verified = addonManifest.verifyPayload(root);
  if (!verified.ok) {
    return verified.problems;
  }
  // Bind the payload to the manifest that was actually installed, not merely to whichever
  // manifest sits beside it now. Without this, replacing both together would still verify.
  const problems = [];
  if (verified.manifest.aggregate !== declared.aggregate) {
    problems.push(`${addonManifest.MANIFEST_FILE} declares a different payload than the one installed`);
  }
  if (addonManifest.manifestFileHash(root) !== declared.sha256) {
    problems.push(`${addonManifest.MANIFEST_FILE} has been replaced since installation`);
  }
  return problems;
}

function readMarker(root) {
  return readMarkerState(root).marker;
}

// `readMarker` collapses "absent" and "unreadable" into null, which is fine for callers that
// only ask "is this ours?" but hides the difference health reporting needs.
function readMarkerState(root) {
  const file = markerPath(root);
  // Only ENOENT is absent. A directory, a symlink, a device or an unreadable regular file at
  // the marker path is PRESENT and unreadable — `fileExists` reported all of those as absent,
  // which let them take the entirely-absent branch that round 3 reserved for "never installed
  // by this tool". (review round 4, codex-1 MINOR.)
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { present: false, readable: false, marker: null };
    }
    return { present: true, readable: false, marker: null };
  }
  if (!stat.isFile()) {
    return { present: true, readable: false, marker: null };
  }
  try {
    const marker = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      return { present: true, readable: false, marker: null };
    }
    return { present: true, readable: true, marker };
  } catch (_error) {
    return { present: true, readable: false, marker: null };
  }
}

// Does a filesystem entry exist at this path? `fs.existsSync` follows symlinks and answers
// FALSE for a dangling one, so a visible entry slipped past ownership preflight and the final
// rename failed with ENOTDIR — after earlier units were already written. Only ENOENT is
// absence. (review round 8, codex-1 MAJOR.)
//
// Every check of whether a destination *entry* is there goes through this: install preflight,
// `skillUnitStatus`, and the removal transaction. Cycle 10 converted only the install path, which
// left health calling a dangling link "missing" and a forced uninstall walking past one instead
// of removing it. The remaining `fs.existsSync` calls are on files *inside* an already-located
// root, where dangling and absent both mean "required file not usable" and get the same
// disposition. (cycle 11.)
function pathEntryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    return !(error && error.code === "ENOENT");
  }
}

// Can a directory be created at `dest`? Walk up to the nearest entry that actually exists: if
// it is a writable directory the rest of the chain is `mkdir -p`'s problem, and if it is
// anything else — a regular file, a dangling link, an unreadable entry, a directory this
// process cannot enter or write — no write below it can ever succeed.
// `lstat` locates the entry, `stat` resolves it, so a symlink to a real directory stays valid.
//
// The permission arm is not decoration. `statSync` succeeds on a mode-000 directory, so a walk
// that only asked "is it a directory?" stopped there and let the fleet write 78 units before
// `mkdir` failed with EACCES — the same partial fleet, one door further along.
// (review round 9, kimi-1 MAJOR: the arm cycle 12 left open.)
//
// `copyPayloadAtomically` stages into `path.dirname(dest)`, so write-and-search on the nearest
// existing ancestor is exactly the permission the write needs, not an approximation of it.
function destinationAncestorObstacle(dest) {
  let dir = path.dirname(dest);
  let previous = null;
  while (dir !== previous) {
    if (pathEntryExists(dir)) {
      let stats;
      try {
        stats = fs.statSync(dir);
      } catch (error) {
        return `Destination parent ${dir} is a broken link or unreadable (${error.code}); ${dest} cannot be created.`;
      }
      if (!stats.isDirectory()) {
        return `Destination parent ${dir} is not a directory; ${dest} cannot be created.`;
      }
      try {
        fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK);
      } catch (error) {
        return `Destination parent ${dir} is not writable (${error.code}); ${dest} cannot be created.`;
      }
      return null;
    }
    previous = dir;
    dir = path.dirname(dir);
  }
  return null;
}

// One parsed ownership predicate, used by health, install and uninstall alike. Health was
// strict about ownership while the mutations only checked that *something* existed at the
// marker path, so a foreign manager's tree could be replaced or removed without --force.
// (review round 4, codex-1 MAJOR.)
function installerOwnsDestination(dest, skill) {
  const state = readMarkerState(dest);
  return Boolean(
    state.present &&
      state.readable &&
      state.marker.name === PACKAGE_JSON.name &&
      (skill === undefined || state.marker.skill === skill)
  );
}

function markerPath(root) {
  return path.join(root, MARKER_FILE);
}

function fileExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (_error) {
    return false;
  }
}

function sha256File(file) {
  try {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(file));
    return hash.digest("hex");
  } catch (_error) {
    return null;
  }
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) {
    return { status: "missing", value: null };
  }
  try {
    return { status: "valid", value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (_error) {
    return { status: "malformed", value: null };
  }
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find((line) => line.trim()) || "";
}

function dirExists(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (_error) {
    return false;
  }
}

function listVisibleEntries(dir) {
  try {
    return fs.readdirSync(dir).filter((entry) => entry !== ".DS_Store");
  } catch (_error) {
    return [];
  }
}

function writeResult(result, context) {
  if (context.options && context.options.json) {
    context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.command === "version") {
    context.stdout.write(`${result.version}\n`);
  } else if (result.command === "help") {
    context.stdout.write(`${result.text}\n`);
  } else if (result.command === "paths" || result.command === "doctor") {
    if (result.errors) {
      for (const error of result.errors) context.stderr.write(`${error}\n`);
    }
    for (const target of result.targets) {
      const skills = target.skills || [{ skill: SKILL_NAME, status: target.status, dest: target.dest, missing: target.missing }];
      for (const skill of skills) {
        context.stdout.write(`${target.target}/${skill.skill}: ${skill.status} ${skill.dest}\n`);
        if (skill.missing && skill.missing.length > 0) {
          context.stdout.write(`  missing: ${skill.missing.join(", ")}\n`);
        }
        if (skill.problems && skill.problems.length > 0) {
          for (const problem of skill.problems) {
            context.stdout.write(`  integrity: ${problem}\n`);
          }
        }
        if (skill.runtime && !skill.runtime.ok) {
          context.stdout.write(`  unavailable: ${skill.runtime.detail}\n`);
        }
      }
    }
    if (!result.ok && result.command === "doctor") {
      const skills = result.targets.flatMap((target) => target.skills || []);
      const broken = skills.some(
        (skill) => skill.status === "missing" || skill.status === "malformed"
      );
      const unselected = skills.some((skill) => skill.status === "valid-unselected");
      const unavailable = skills.some((skill) => skill.runtime && !skill.runtime.ok);
      const reasons = [];
      if (broken) reasons.push("missing or malformed");
      if (unselected) reasons.push("installed but outside the recorded selection");
      if (unavailable) reasons.push("operationally unavailable");
      context.stderr.write(`One or more installs are ${reasons.join(", or ")}.\n`);
    }
  } else if (result.command === "status") {
    context.stdout.write(`installer: ${result.installer.version} (${result.installer.source})\n`);
    context.stdout.write(`compatibility: ${result.compatibility.status}\n`);
    if (result.project.exists) {
      context.stdout.write(`project: ${result.project.root}\n`);
      context.stdout.write(`project metadata: ${result.project.metadataStatus}\n`);
    } else {
      context.stdout.write(`project: missing protocol at ${result.project.protocolPath}\n`);
    }
    for (const install of result.runtimeInstalls) {
      const version = install.version ? ` version ${install.version}` : "";
      context.stdout.write(`${install.target}: ${install.status}${version} ${install.dest}\n`);
      // `status` probes the runtime, so it must also report the answer — printing only the
      // verdict made it disagree with `doctor` about the same directory (round 2, codex-1).
      // The CORE unit gets the same detail as the add-ons: a foreign-installed core is
      // exactly the one whose verdict a user most needs explained (round 3, kimi-1 NIT).
      const explain = (skill, indent) => {
        if (skill.missing && skill.missing.length > 0) {
          // `doctor` names the missing files; `status` printed only the verdict.
          // (review round 4, hermes-1 MINOR.)
          context.stdout.write(`${indent}missing: ${skill.missing.join(", ")}\n`);
        }
        if (skill.runtime && !skill.runtime.ok) {
          context.stdout.write(`${indent}unavailable: ${skill.runtime.detail}\n`);
        }
        for (const problem of skill.problems || []) {
          context.stdout.write(`${indent}integrity: ${problem}\n`);
        }
      };
      const units = install.skills || [];
      if (units[0]) explain(units[0], "  ");
      for (const skill of units.slice(1)) {
        context.stdout.write(`  addon ${skill.skill}: ${skill.status} ${skill.dest}\n`);
        explain(skill, "    ");
      }
    }
    for (const action of result.actions) {
      context.stdout.write(`action: ${action}\n`);
    }
  } else if (result.command === "sync-project") {
    if (result.errors) {
      for (const error of result.errors) context.stderr.write(`${error}\n`);
    }
    for (const action of result.actions || []) {
      context.stdout.write(`${action.dryRun ? "would write" : "wrote"} ${action.path}\n`);
    }
  } else if (result.command === "install" || result.command === "uninstall") {
    if (result.errors) {
      for (const error of result.errors) context.stderr.write(`${error}\n`);
    }
    let installedAnyAddon = false;
    for (const action of result.actions || []) {
      const skills = action.skills || [{ skill: SKILL_NAME, ok: action.ok, action: action.action, dest: action.dest, message: action.message }];
      skills.forEach((skill, index) => {
        if (index > 0) installedAnyAddon = true;
        const tag = `${action.target}/${skill.skill}`;
        const line = skill.ok
          ? `${tag}: ${skill.action} ${skill.dest}`
          : `${tag}: ${skill.action} ${skill.dest} - ${skill.message}`;
        (skill.ok ? context.stdout : context.stderr).write(`${line}\n`);
        // A committed unit that left debris behind is a success worth mentioning, not a
        // failure. Silence would leave the residue invisible to health as well.
        if (skill.ok && skill.warning) {
          context.stderr.write(`  warning: ${skill.warning}\n`);
        }
      });
    }
    // Transparent hint: the add-ons are installed by default; show how to opt out.
    if (result.command === "install" && result.ok && installedAnyAddon) {
      context.stdout.write("Installed the core parley-deck skill plus its add-ons. Re-run with --no-addons for the core skill only, or --only <name>[,<name>] to pick add-ons.\n");
    }
  }
}

module.exports = {
  InstallerError,
  MARKER_FILE,
  PACKAGE_ROOT,
  parseArgs,
  resolveTargets,
  discoverAddons,
  run,
  installCommand,
  doctorCommand,
  statusCommand,
  pathsCommand,
  syncProjectCommand,
  uninstallCommand,
  targetStatus,
  usage,
  // Exported so the Windows root arithmetic is testable from a POSIX host.
  splitAtRoot,
  rawTargetArithmetic,
  // Exported for the regression that proves a committed replacement survives a failed backup
  // cleanup. Preflight makes that unreachable through the command, which is the point — the
  // post-commit guard exists for what preflight cannot see, so it needs a direct caller.
  installSkillUnit
};
