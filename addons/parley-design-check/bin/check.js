#!/usr/bin/env node

"use strict";

/*
 * parley-design-check — the checker CLI.
 *
 * Runs against files on disk. No agent runtime, no framework, no network, no dependencies
 * beyond Node's own modules. It reads its rules from the installed parley-design skill and
 * refuses rule checks when that skill is absent rather than falling back to a copy of its
 * own: a checker that carries its own registry is a checker that will one day enforce a
 * registry nobody ratified.
 *
 *   check <paths...>                    run the rules over files on disk
 *   check --level L1|L2|L3 <paths...>   verify a conformance claim as well
 *   check --json <paths...>             emit the report as JSON
 *
 * Exit codes: 0 clean, 1 findings, 2 the run itself failed, 3 rule checks refused.
 */

const path = require("node:path");

const { CheckError } = require("../lib/registry.js");
const { runCheck } = require("../lib/engine.js");

// The tool's own version. It is not the spec version and not the registry version: a
// report states all three so a signature cannot survive a change to any of them.
const VERSION = "1.0.0";
const ADDON_ROOT = path.resolve(__dirname, "..");
const DETECTORS_DIR = path.join(ADDON_ROOT, "lib", "detectors");

const USAGE = `parley-design-check ${VERSION} — enforcement for PDS/1.0

Usage:
  check <paths...>                     run the registry's rules over files on disk
  check --level L1|L2|L3|L4 <paths...> verify a conformance claim as well
  check --json <paths...>              emit the report as JSON

Options:
  --registry <path>   the RULES.md to read; default is the installed parley-design
  --contract <path>   the CONTRACT artifact system rules are judged against
  --waivers <path>    the single waiver file; default is the one the contract names
  --surface <name>    core or web; default is inferred from the inputs
  --level <level>     L1, L2, L3 or L4
  --json              machine-readable report on stdout
  --help              this text
  --version           the tool version

Exit codes:
  0  clean
  1  findings: at least one VIOLATION or NEEDS_REVIEW
  2  the run itself failed
  3  rule checks refused: no registry was found`;

const FLAGS_WITH_VALUE = new Set(["--registry", "--contract", "--waivers", "--surface", "--level"]);

function parseArgv(argv) {
  const options = { paths: [], json: false };
  let index = 0;
  if (argv[0] === "check") index = 1;
  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--version") return { version: true };
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (FLAGS_WITH_VALUE.has(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new CheckError(`${argument} needs a value`);
      index += 1;
      if (argument === "--registry") options.registryPath = value;
      if (argument === "--contract") options.contractPath = value;
      if (argument === "--waivers") options.waiversPath = value;
      if (argument === "--surface") options.surface = value;
      if (argument === "--level") options.level = value;
      continue;
    }
    if (argument.startsWith("--")) throw new CheckError(`unknown option ${argument}`);
    options.paths.push(argument);
  }
  if (options.surface && options.surface !== "core" && options.surface !== "web") {
    throw new CheckError(`unknown surface ${options.surface}`);
  }
  if (options.paths.length === 0) throw new CheckError("no paths to check");
  return options;
}

function renderText(report) {
  const lines = [];
  lines.push(`PDS audit — implements ${report.implements}`);
  if (report.registry.status === "loaded") {
    lines.push(`registry     ${report.registry.version} digest ${report.registry.digest} (${report.registry.path})`);
  } else {
    lines.push("registry     absent — rule checks refused");
  }
  lines.push(`surface      ${report.surface}`);
  lines.push(`tiers        executed ${report.tiers.executed.join(", ")} — unavailable ${report.tiers.unavailable.join(", ")}`);
  lines.push(
    `capability   ${report.capability.detectors.length} detectors over ${report.capability["rules-with-detector"].length} rule ids, generated from lib/detectors`
  );
  if (report.contract) lines.push(`contract     ${report.contract}`);
  if (report.level) {
    const verified = report.level.verified ? `verified ${report.level.verified}` : "not verified";
    lines.push(`level        claimed ${report.level.claimed}, ${verified}`);
  }
  for (const note of report.notes) lines.push(`note         ${note}`);
  for (const error of report["waiver-errors"]) lines.push(`waiver       rejected: ${error}`);

  if (report.findings.length > 0) {
    lines.push("");
    for (const verdict of ["VIOLATION", "NEEDS_REVIEW"]) {
      const group = report["findings-detail"].filter((finding) => finding.verdict === verdict);
      if (group.length === 0) continue;
      lines.push(verdict);
      for (const finding of group) lines.push(`  ${finding.rule} — ${finding.violation} — ${finding.remedy}`);
      lines.push("");
    }
  }
  if (report.unjudgeable.length > 0) {
    lines.push("UNJUDGEABLE");
    for (const entry of report.unjudgeable) lines.push(`  ${entry.rule} — ${entry.violation} — ${entry.remedy}`);
    lines.push("");
  }
  if (report["waivers-applied"].length > 0) {
    lines.push("WAIVED");
    for (const entry of report["waivers-applied"]) lines.push(`  ${entry}`);
    lines.push("");
  }
  const counts = report.counts;
  lines.push(
    `verdict ${report.verdict} — violations ${counts.violation}, needs-review ${counts["needs-review"]}, unjudgeable ${counts.unjudgeable}, waived ${counts.waived}, out of scope ${counts["out-of-scope"]}`
  );
  return lines.join("\n");
}

function main(argv) {
  let options;
  try {
    options = parseArgv(argv);
  } catch (error) {
    process.stderr.write(`parley-design-check: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = runCheck({
      ...options,
      addonRoot: ADDON_ROOT,
      detectorsDir: DETECTORS_DIR,
      registryEnv: process.env.PDS_REGISTRY,
      cwd: process.cwd()
    });
  } catch (error) {
    if (error instanceof CheckError) {
      process.stderr.write(`parley-design-check: the run failed — ${error.message}\n`);
      return 2;
    }
    throw error;
  }
  if (report.registry.status === "absent") {
    process.stderr.write(`parley-design-check: ${report.registry.refused}\n`);
    process.stderr.write("parley-design-check: install the parley-design add-on, or pass --registry <path to RULES.md>.\n");
    process.stderr.write("parley-design-check: registry-independent structural and token checks still ran.\n");
  }
  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : renderText(report)}\n`);
  return report.exit;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
