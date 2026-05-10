"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = require("../package.json");
const SKILL_NAME = "parley-deck";
const MARKER_FILE = ".parley-deck-skill-install.json";
const TARGETS = ["codex", "claude", "gemini"];
const REQUIRED_PAYLOAD_FILES = [
  "SKILL.md",
  "agents/manifest.yaml",
  "references/COOPERATION.md",
  "gemini-extension.json"
];
const PAYLOAD_ENTRIES = [
  "SKILL.md",
  "agents",
  "references",
  "gemini-extension.json"
];
const OPTIONAL_PAYLOAD_ENTRIES = [
  "README.md",
  "LICENSE"
];

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
    json: false,
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
    } else if (arg === "--json") {
      options.json = true;
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

function validateOptions(options) {
  const commands = new Set(["install", "doctor", "uninstall", "paths", "help", "version"]);
  const targets = new Set(["auto", "all", "codex", "claude", "gemini", "generic"]);
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
}

function run(argv, io) {
  const options = parseArgs(argv);
  const context = makeContext(options, io || {});
  let result;

  if (options.command === "version") {
    result = { ok: true, command: "version", version: PACKAGE_JSON.version };
  } else if (options.command === "help") {
    result = { ok: true, command: "help", text: usage() };
  } else if (options.command === "paths") {
    result = pathsCommand(context);
  } else if (options.command === "doctor") {
    result = doctorCommand(context);
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
  return [
    "Usage:",
    "  parley-deck-skill install [--target auto|all|codex|claude|gemini|generic] [--scope user|project] [--project <path>] [--dest <path>] [--force] [--dry-run] [--json]",
    "  parley-deck-skill doctor [--target auto|all|codex|claude|gemini|generic] [--scope user|project] [--project <path>] [--dest <path>] [--json]",
    "  parley-deck-skill uninstall [--target auto|all|codex|claude|gemini|generic] [--scope user|project] [--project <path>] [--dest <path>] [--force] [--dry-run] [--json]",
    "  parley-deck-skill paths [--target auto|all|codex|claude|gemini|generic] [--scope user|project] [--project <path>] [--dest <path>] [--json]",
    "  parley-deck-skill --version",
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
    targets: targets.map((target) => targetStatus(target))
  };
}

function doctorCommand(context) {
  const targets = resolveTargets(context);
  if (targets.length === 0) {
    return {
      ok: false,
      command: "doctor",
      errors: ["No installed agent runtimes were detected. Use --target all or a specific --target to inspect expected paths."],
      targets: []
    };
  }
  const results = targets.map((target) => targetStatus(target));
  return {
    ok: results.every((result) => result.status === "valid"),
    command: "doctor",
    targets: results
  };
}

function installCommand(context) {
  validatePayload(context.packageRoot);
  const targets = resolveTargets(context);
  if (targets.length === 0) {
    return {
      ok: false,
      command: "install",
      errors: ["No installed agent runtimes were detected. Use --target all or --target generic --dest <path>."],
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
      errors: ["No installed agent runtimes were detected. Use --target all or a specific --target to uninstall expected paths."],
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

  const candidates = TARGETS.map((name) => {
    const dest = targetPath(name, context);
    return makeTarget(name, name, dest, isRuntimeDetected(name, context));
  });

  if (target === "all") {
    return candidates.map((candidate) => ({ ...candidate, detected: true }));
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

function targetPath(name, context) {
  const options = context.options;
  const projectRoot = resolvePath(options.project || context.cwd, context.cwd);

  if (options.scope === "project") {
    if (name === "codex") return path.join(projectRoot, ".codex", "skills", SKILL_NAME);
    if (name === "claude") return path.join(projectRoot, ".claude", "skills", SKILL_NAME);
    if (name === "gemini") return path.join(projectRoot, ".gemini", "extensions", SKILL_NAME);
  }

  if (name === "codex") {
    const codexHome = context.env.CODEX_HOME || path.join(context.homeDir, ".codex");
    return path.join(codexHome, "skills", SKILL_NAME);
  }
  if (name === "claude") return path.join(context.homeDir, ".claude", "skills", SKILL_NAME);
  if (name === "gemini") return path.join(context.homeDir, ".gemini", "extensions", SKILL_NAME);

  throw new InstallerError(`Unsupported target path: ${name}`);
}

function resolvePath(value, cwd) {
  if (!value) return value;
  if (value.startsWith("~")) {
    return path.join(os.homedir(), value.slice(1));
  }
  return path.resolve(cwd, value);
}

function isRuntimeDetected(name, context) {
  if (context.options.scope === "project") {
    const projectRoot = resolvePath(context.options.project || context.cwd, context.cwd);
    if (name === "codex") return dirExists(path.join(projectRoot, ".codex"));
    if (name === "claude") return dirExists(path.join(projectRoot, ".claude"));
    if (name === "gemini") return dirExists(path.join(projectRoot, ".gemini"));
  }
  if (name === "codex") {
    return Boolean(context.env.CODEX_HOME) || dirExists(path.join(context.homeDir, ".codex")) || commandExists("codex", context.env);
  }
  if (name === "claude") {
    return dirExists(path.join(context.homeDir, ".claude")) || commandExists("claude", context.env);
  }
  if (name === "gemini") {
    return dirExists(path.join(context.homeDir, ".gemini")) || commandExists("gemini", context.env);
  }
  return false;
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

function installTarget(target, context) {
  const dest = target.dest;
  try {
    const existing = fs.existsSync(dest);
    const marker = markerPath(dest);
    const marked = existing && fs.existsSync(marker);

    if (existing && !marked && !context.options.force) {
      return {
        ok: false,
        target: target.name,
        dest,
        action: "blocked",
        message: "Destination exists but was not installed by parley-deck-skill. Re-run with --force to replace it."
      };
    }

    if (context.options.dryRun) {
      return {
        ok: true,
        target: target.name,
        dest,
        action: existing ? "replace" : "install",
        dryRun: true
      };
    }

    copyPayloadAtomically(dest, target, context);
    return {
      ok: true,
      target: target.name,
      dest,
      action: existing ? "replaced" : "installed"
    };
  } catch (error) {
    return {
      ok: false,
      target: target.name,
      dest,
      action: "failed",
      message: error.message
    };
  }
}

function uninstallTarget(target, context) {
  const dest = target.dest;
  try {
    if (!fs.existsSync(dest)) {
      return { ok: true, target: target.name, dest, action: "missing" };
    }

    const marker = readMarker(dest);
    const marked = marker && marker.name === PACKAGE_JSON.name && marker.skill === SKILL_NAME;
    if (!marked && !context.options.force) {
      return {
        ok: false,
        target: target.name,
        dest,
        action: "blocked",
        message: "Destination is not marked as a parley-deck-skill install. Re-run with --force to remove it."
      };
    }

    if (context.options.dryRun) {
      return { ok: true, target: target.name, dest, action: "remove", dryRun: true };
    }

    fs.rmSync(dest, { recursive: true, force: true });
    return { ok: true, target: target.name, dest, action: "removed" };
  } catch (error) {
    return { ok: false, target: target.name, dest, action: "failed", message: error.message };
  }
}

function copyPayloadAtomically(dest, target, context) {
  const parent = path.dirname(dest);
  fs.mkdirSync(parent, { recursive: true });
  const temp = path.join(parent, `.${path.basename(dest)}.${process.pid}.${Date.now()}.tmp`);
  const backup = path.join(parent, `.${path.basename(dest)}.${process.pid}.${Date.now()}.bak`);

  try {
    fs.mkdirSync(temp, { recursive: true });
    for (const entry of PAYLOAD_ENTRIES) {
      copyRecursive(path.join(context.packageRoot, entry), path.join(temp, entry));
    }
    for (const entry of OPTIONAL_PAYLOAD_ENTRIES) {
      const src = path.join(context.packageRoot, entry);
      if (fs.existsSync(src)) {
        copyRecursive(src, path.join(temp, entry));
      }
    }
    writeMarker(temp, target, context);
    validateInstalledPayload(temp, target.kind);

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

function writeMarker(root, target, context) {
  const marker = {
    name: "parley-deck-skill",
    skill: SKILL_NAME,
    version: PACKAGE_JSON.version,
    source: `npm:${PACKAGE_JSON.name}@${PACKAGE_JSON.version}`,
    target: target.name,
    scope: context.options.scope,
    installedAt: new Date().toISOString()
  };
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
  fs.copyFileSync(src, dest);
}

function targetStatus(target) {
  const exists = fs.existsSync(target.dest);
  if (!exists) {
    return { target: target.name, dest: target.dest, detected: target.detected, status: "missing" };
  }

  const marker = readMarker(target.dest);
  const validation = validateInstalledPayload(target.dest, target.kind, { collect: true });
  return {
    target: target.name,
    dest: target.dest,
    detected: target.detected,
    status: validation.ok ? "valid" : "malformed",
    marker: marker || null,
    missing: validation.missing
  };
}

function validateInstalledPayload(root, kind, options) {
  const required = kind === "gemini"
    ? ["SKILL.md", "gemini-extension.json", "references/COOPERATION.md"]
    : ["SKILL.md", "references/COOPERATION.md", "agents/manifest.yaml"];
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

function dirExists(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (_error) {
    return false;
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
      context.stdout.write(`${target.target}: ${target.status} ${target.dest}\n`);
      if (target.missing && target.missing.length > 0) {
        context.stdout.write(`  missing: ${target.missing.join(", ")}\n`);
      }
    }
    if (!result.ok && result.command === "doctor") {
      context.stderr.write("One or more installs are missing or malformed.\n");
    }
  } else if (result.command === "install" || result.command === "uninstall") {
    if (result.errors) {
      for (const error of result.errors) context.stderr.write(`${error}\n`);
    }
    for (const action of result.actions || []) {
      const line = action.ok ? `${action.target}: ${action.action} ${action.dest}` : `${action.target}: ${action.action} ${action.dest} - ${action.message}`;
      (action.ok ? context.stdout : context.stderr).write(`${line}\n`);
    }
  }
}

module.exports = {
  InstallerError,
  MARKER_FILE,
  PACKAGE_ROOT,
  parseArgs,
  resolveTargets,
  run,
  installCommand,
  doctorCommand,
  uninstallCommand,
  targetStatus,
  usage
};
