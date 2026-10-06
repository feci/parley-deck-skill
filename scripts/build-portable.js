"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkgJson = require(path.join(root, "package.json"));
// Invoke the JavaScript entry point through Node so Windows does not need a .cmd shell.
const pkgBin = require.resolve("@yao-pkg/pkg/lib-es5/bin.js");
const dist = path.join(root, "dist");

const targetGroups = {
  windows: [
    ["node24-win-x64", "windows-x64.exe"],
    ["node24-win-arm64", "windows-arm64.exe"]
  ],
  current: [
    [currentTarget(), currentSuffix()]
  ],
  all: [
    ["node24-win-x64", "windows-x64.exe"],
    ["node24-win-arm64", "windows-arm64.exe"],
    ["node24-linux-x64", "linux-x64"],
    ["node24-macos-x64", "macos-x64"],
    ["node24-macos-arm64", "macos-arm64"]
  ]
};

const groupName = process.argv[2] || "windows";
const targets = targetGroups[groupName];

if (!targets) {
  process.stderr.write(`Unknown portable target group: ${groupName}\n`);
  process.stderr.write(`Expected one of: ${Object.keys(targetGroups).join(", ")}\n`);
  process.exit(1);
}

fs.mkdirSync(dist, { recursive: true });

for (const [target, suffix] of targets) {
  const output = path.join(dist, `parley-deck-skill-v${pkgJson.version}-${suffix}`);
  runPkg(target, output);
}

function runPkg(target, output) {
  const args = [
    root,
    "--targets",
    target,
    "--output",
    output,
    "--compress",
    "GZip",
    "--no-bytecode"
  ];

  const result = spawnSync(process.execPath, [pkgBin, ...args], {
    cwd: root,
    stdio: "inherit"
  });

  if (result.error) {
    process.stderr.write(`Portable build failed: ${result.error.message}\n`);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function currentTarget() {
  const platform = process.platform === "darwin" ? "macos" : process.platform;
  return `node24-${platform}-${process.arch}`;
}

function currentSuffix() {
  if (process.platform === "win32") {
    return `${process.platform}-${process.arch}.exe`;
  }
  const platform = process.platform === "darwin" ? "macos" : process.platform;
  return `${platform}-${process.arch}`;
}
