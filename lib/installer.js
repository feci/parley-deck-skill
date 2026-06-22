"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = require("../package.json");
const SKILL_NAME = "parley-deck";
const MARKER_FILE = ".parley-deck-skill-install.json";
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
    name: "kimi",
    kind: "kimi",
    skillDir: path.join(".kimi", "skills"),
    commands: ["kimi"]
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
const REQUIRED_PAYLOAD_FILES = [
  "SKILL.md",
  "agents/manifest.yaml",
  "references/COOPERATION.md",
  "references/compatibility.json",
  "plugin.json",
  "gemini-extension.json"
];
const PROJECT_PROTOCOL_FILE = path.join("parley-deck", "COOPERATION.md");
const PROJECT_METADATA_FILE = path.join("parley-deck", "meta", "version.json");
const COMPATIBILITY_FILE = path.join("references", "compatibility.json");
const PAYLOAD_ENTRIES = [
  "SKILL.md",
  "agents",
  "references",
  "plugin.json",
  "gemini-extension.json"
];
const OPTIONAL_PAYLOAD_ENTRIES = [
  "README.md",
  "LICENSE"
];
const ADDONS_DIR = "addons";
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
    targets: targets.map((target) => targetStatus(target, context))
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
  const results = targets.map((target) => targetStatus(target, context));
  return {
    ok: results.every((result) => result.skills.every((skill) => skill.status === "valid")),
    command: "doctor",
    targets: results
  };
}

function statusCommand(context) {
  const targets = resolveTargets(context);
  const runtimeInstalls = targets.map((target) => enrichRuntimeStatus(targetStatus(target, context)));
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
  const packagedProtocolPath = path.join(context.packageRoot, "references", "COOPERATION.md");
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
    skillSha256: sha256File(path.join(context.packageRoot, "SKILL.md")),
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

function validatePayload(root) {
  const missing = REQUIRED_PAYLOAD_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    throw new InstallerError(`Package is missing required skill files: ${missing.join(", ")}`);
  }
}

// Discover opt-in add-on skills shipped under addons/<name>/SKILL.md in the package.
// Each add-on is an inert instruction directory installed as its own skill dir
// alongside the core skill. Returns a name-sorted list of { name, root }.
function discoverAddons(packageRoot) {
  const addonsRoot = path.join(packageRoot, ADDONS_DIR);
  if (!dirExists(addonsRoot)) {
    return [];
  }
  const addons = [];
  for (const entry of listVisibleEntries(addonsRoot)) {
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
      isCore: false
    });
  }
  return units;
}

function installTarget(target, context) {
  const units = targetSkillUnits(target, context);
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
    const marker = markerPath(dest);
    const marked = existing && fs.existsSync(marker);

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

    const marker = readMarker(dest);
    const marked = marker && marker.name === PACKAGE_JSON.name && marker.skill === unit.skill;
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
        copyRecursive(path.join(context.packageRoot, entry), path.join(temp, entry));
      }
      for (const entry of OPTIONAL_PAYLOAD_ENTRIES) {
        const src = path.join(context.packageRoot, entry);
        if (fs.existsSync(src)) {
          copyRecursive(src, path.join(temp, entry));
        }
      }
      if (target.kind === "antigravity") {
        copyRecursive(path.join(context.packageRoot, "SKILL.md"), path.join(temp, "skills", "SKILL.md"));
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

function targetStatus(target, context) {
  const units = context ? targetSkillUnits(target, context) : [{ skill: SKILL_NAME, kind: target.kind, dest: target.dest, isCore: true }];
  const skills = units.map((unit) => skillUnitStatus(unit));
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

function skillUnitStatus(unit) {
  if (!fs.existsSync(unit.dest)) {
    return { skill: unit.skill, dest: unit.dest, status: "missing", marker: null, missing: [] };
  }
  const marker = readMarker(unit.dest);
  const validation = validateInstalledPayload(unit.dest, unit.kind, { collect: true });
  return {
    skill: unit.skill,
    dest: unit.dest,
    status: validation.ok ? "valid" : "malformed",
    marker: marker || null,
    missing: validation.missing
  };
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
  if (options && options.collect) {
    return { ok: missing.length === 0, missing };
  }
  if (missing.length > 0) {
    throw new InstallerError(`Installed payload is missing required files: ${missing.join(", ")}`);
  }
  return { ok: true, missing: [] };
}

function readMarker(root) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(root), "utf8"));
  } catch (_error) {
    return null;
  }
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
      }
    }
    if (!result.ok && result.command === "doctor") {
      context.stderr.write("One or more installs are missing or malformed.\n");
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
      for (const skill of (install.skills || []).slice(1)) {
        context.stdout.write(`  addon ${skill.skill}: ${skill.status} ${skill.dest}\n`);
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
