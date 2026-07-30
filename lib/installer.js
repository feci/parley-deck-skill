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
  const results = targets.map((target) => targetStatus(target, context, { probeRuntime: true, env: context.env }));
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
  const runtimeInstalls = targets.map((target) => enrichRuntimeStatus(targetStatus(target, context, { probeRuntime: true, env: context.env })));
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

  const actions = targets.map((target) => installTarget(target, context));
  return {
    ok: actions.every((action) => action.ok),
    command: "install",
    dryRun: context.options.dryRun,
    actions
  };
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
  const actions = targets.map((target) => uninstallTarget(target, context));
  return {
    ok: actions.every((action) => action.ok),
    command: "uninstall",
    dryRun: context.options.dryRun,
    actions
  };
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
function markerAddonNames(coreDest) {
  const marker = readMarker(coreDest);
  if (!marker || marker.name !== PACKAGE_JSON.name) {
    return null;
  }
  if (Array.isArray(marker.addons)) {
    return marker.addons;
  }
  return [];
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
    if (recorded !== null) {
      return recorded;
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
  const units = [
    { skill: SKILL_NAME, kind: target.kind, dest: target.dest, addon: null, isCore: true }
  ];
  const expected = expectedAddonNames(target, context);
  const discovered = new Map(discoverAddons(context.packageRoot).map((addon) => [addon.name, addon]));
  for (const name of expected) {
    units.push({
      skill: name,
      kind: "addon",
      dest: path.join(skillsDir, name),
      addon: discovered.get(name) || null,
      isCore: false,
      selected: true
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
  if (context && context.options && context.options.command !== "install" && context.options.command !== "uninstall") {
    const seen = new Set(units.map((unit) => unit.skill));
    for (const [name, addon] of discovered) {
      if (seen.has(name)) continue;
      if (!dirExists(path.join(skillsDir, name))) continue;
      units.push({
        skill: name,
        kind: "addon",
        dest: path.join(skillsDir, name),
        addon,
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

  if (fs.existsSync(dest) && !installerOwnsDestination(dest, unit.skill) && !context.options.force) {
    return {
      ok: false,
      skill: unit.skill,
      dest,
      action: "blocked",
      message: "Destination exists but was not installed by parley-deck-skill. Re-run with --force to replace it."
    };
  }

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

  return null;
}

function installTarget(target, context) {
  const units = targetSkillUnits(target, context);

  // B5: atomic per selected set, not merely per directory. A dry run reports what each unit
  // would do, so it keeps its per-unit shape; a real install stops the whole target.
  if (!context.options.dryRun) {
    const blockers = units
      .map((unit) => preflightSkillUnit(target, unit, context))
      .filter(Boolean);
    if (blockers.length > 0) {
      const blocked = new Map(blockers.map((entry) => [entry.skill, entry]));
      const skills = units.map((unit) => blocked.get(unit.skill) || {
        ok: false,
        skill: unit.skill,
        dest: unit.dest,
        action: "skipped",
        message: "Not attempted: another skill in this install failed preflight."
      });
      const core = skills[0];
      return {
        ok: false,
        target: target.name,
        dest: core.dest,
        action: core.action,
        message: core.message,
        skills
      };
    }
  }

  const skills = units.map((unit) => installSkillUnit(target, unit, context));
  const ok = skills.every((skill) => skill.ok);
  const core = skills[0];
  const result = {
    ok,
    target: target.name,
    dest: core.dest,
    action: core.action,
    message: core.message,
    skills
  };
  if (core.dryRun) {
    result.dryRun = true;
  }
  return result;
}

function installSkillUnit(target, unit, context) {
  const dest = unit.dest;
  try {
    const existing = fs.existsSync(dest);
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

    copyPayloadAtomically(dest, target, unit, context);
    return {
      ok: true,
      skill: unit.skill,
      dest,
      action: existing ? "replaced" : "installed"
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

function uninstallTarget(target, context) {
  const units = targetSkillUnits(target, context);

  // Removal is atomic across the selected set for the same reason installation is: a refusal
  // on the last unit must not leave earlier ones already deleted. Measured before this: with a
  // managed core and an unmanaged add-on, `uninstall` removed the core and then refused the
  // add-on. (review round 4, codex-1 MAJOR.)
  if (!context.options.dryRun && !context.options.force) {
    const blockers = units.filter(
      (unit) => fs.existsSync(unit.dest) && !installerOwnsDestination(unit.dest, unit.skill)
    );
    if (blockers.length > 0) {
      const blocked = new Set(blockers.map((unit) => unit.skill));
      const skills = units.map((unit) =>
        blocked.has(unit.skill)
          ? {
              ok: false,
              skill: unit.skill,
              dest: unit.dest,
              action: "blocked",
              message: "Destination is not marked as a parley-deck-skill install. Re-run with --force to remove it."
            }
          : {
              ok: false,
              skill: unit.skill,
              dest: unit.dest,
              action: "skipped",
              message: "Not attempted: another skill in this uninstall was refused."
            }
      );
      const core = skills[0];
      return {
        ok: false,
        target: target.name,
        dest: core.dest,
        action: core.action,
        message: core.message,
        skills
      };
    }
  }

  const skills = units.map((unit) => uninstallSkillUnit(unit, context));
  const ok = skills.every((skill) => skill.ok);
  const core = skills[0];
  return {
    ok,
    target: target.name,
    dest: core.dest,
    action: core.action,
    message: core.message,
    skills
  };
}

function uninstallSkillUnit(unit, context) {
  const dest = unit.dest;
  try {
    if (!fs.existsSync(dest)) {
      return { ok: true, skill: unit.skill, dest, action: "missing" };
    }

    const marked = installerOwnsDestination(dest, unit.skill);
    if (!marked && !context.options.force) {
      return {
        ok: false,
        skill: unit.skill,
        dest,
        action: "blocked",
        message: "Destination is not marked as a parley-deck-skill install. Re-run with --force to remove it."
      };
    }

    if (context.options.dryRun) {
      return { ok: true, skill: unit.skill, dest, action: "remove", dryRun: true };
    }

    fs.rmSync(dest, { recursive: true, force: true });
    return { ok: true, skill: unit.skill, dest, action: "removed" };
  } catch (error) {
    return { ok: false, skill: unit.skill, dest, action: "failed", message: error.message };
  }
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
    validateInstalledPayload(temp, unit.kind);

    if (fs.existsSync(dest)) {
      fs.renameSync(dest, backup);
    }
    fs.renameSync(temp, dest);
    if (fs.existsSync(backup)) {
      fs.rmSync(backup, { recursive: true, force: true });
    }
  } catch (error) {
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    if (!fs.existsSync(dest) && fs.existsSync(backup)) {
      fs.renameSync(backup, dest);
    } else if (fs.existsSync(backup)) {
      fs.rmSync(backup, { recursive: true, force: true });
    }
    throw error;
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
  if (!fs.existsSync(unit.dest)) {
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
  const validation = validateInstalledPayload(unit.dest, unit.kind, { collect: true });
  const problems = [...(validation.problems || [])];

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
  }

  if (unit.selected === false) {
    problems.push(
      "installed but not part of the recorded selection: remove the directory, or re-run install without excluding it"
    );
  }

  const ok = validation.missing.length === 0 && problems.length === 0;
  return {
    skill: unit.skill,
    dest: unit.dest,
    selected: unit.selected !== false,
    // A distinct status, not `valid` with a flag: automation that requires tool-managed
    // installs must be able to insist on one without parsing prose. `managed` is carried
    // alongside so the same fact is available as a boolean.
    status: ok ? (unmanaged ? "valid-unmanaged" : "valid") : "malformed",
    managed: ok ? !unmanaged : false,
    marker: state.marker,
    missing: validation.missing,
    problems,
    // Payload validity and operational availability are separate answers. A byte-perfect
    // payload whose declared interpreter is absent is `valid` and unavailable, not malformed.
    runtime: ok && options && options.probeRuntime ? runtimeAvailability(unit.dest, options.env) : null
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
  const source = unit.addon ? unit.addon.root : null;
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
function runtimeAvailability(root, env) {
  const read = addonManifest.readManifest(root);
  if (!read.ok || !read.manifest.runtime || !read.manifest.runtime.python) {
    return null;
  }
  const spec = read.manifest.runtime.python;
  const floor = /^>=\s*(\d+)\.(\d+)$/.exec(spec);
  if (!floor) {
    return { ok: false, requirement: spec, detail: `unsupported python requirement ${JSON.stringify(spec)}` };
  }
  const probe = probePython3(env);
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
function probePython3(env) {
  const effective = env && typeof env === "object" ? env : process.env;
  // Keyed on the WHOLE effective environment, serialized unambiguously. An enumerated list
  // missed variables that select the interpreter behind a stable PATH — a version-manager
  // shim answers to PYENV_VERSION — and a separator-joined key could collide, because the
  // separator can appear inside a value. JSON of sorted pairs has neither problem.
  // (review round 4, codex-1 MINOR; kimi-1 raised the collision.)
  const key = JSON.stringify(
    Object.keys(effective)
      .sort()
      .map((name) => [name, String(effective[name])])
  );
  if (pythonProbes.has(key)) return pythonProbes.get(key);
  // A bounded wait: this runs inside a health check, and a PATH entry on a stalled network
  // mount must not hang `doctor` indefinitely.
  const run = spawnSync("python3", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
    encoding: "utf8",
    env: effective,
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

function validateInstalledPayload(root, kind, options) {
  let required;
  if (kind === "addon") {
    required = ["SKILL.md"];
  } else if (kind === "gemini") {
    required = ["SKILL.md", "gemini-extension.json", "references/COOPERATION.md", "references/compatibility.json"];
  } else if (kind === "antigravity") {
    required = ["SKILL.md", "skills/SKILL.md", "plugin.json", "references/COOPERATION.md", "references/compatibility.json", "agents/manifest.yaml"];
  } else {
    required = ["SKILL.md", "references/COOPERATION.md", "references/compatibility.json", "agents/manifest.yaml"];
  }
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  const problems = kind === "addon" ? manifestProblems(root) : [];
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
function manifestProblems(root) {
  const marker = readMarker(root);
  if (!marker || marker.name !== PACKAGE_JSON.name) {
    return [];
  }

  const schema = marker.markerSchema;
  if (schema === undefined) {
    // Written by an older installer that knew nothing about manifests. It stays healthy;
    // re-installing upgrades it. This is the only path on which the check is skipped.
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
    return present
      ? [`${addonManifest.MANIFEST_FILE} is present but the install marker records that none was installed`]
      : [];
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
      const broken = skills.some((skill) => skill.status !== "valid" && skill.status !== "valid-unmanaged");
      const unavailable = skills.some((skill) => skill.runtime && !skill.runtime.ok);
      const reasons = [];
      if (broken) reasons.push("missing or malformed");
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
  usage
};
