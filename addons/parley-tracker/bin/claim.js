#!/usr/bin/env node

"use strict";

/*
 * parley-tracker `claim` — the gap-scan-as-gate command.
 *
 * Claiming a ticket is the single highest-leverage rule for AI output quality:
 * an agent MUST NOT start work on an under-specified ticket. This command makes
 * that enforcement real (not just documented in SKILL.md):
 *
 *   1. run `validate` on the ticket file (the full readiness gap-scan);
 *   2. on PASS  -> rewrite the frontmatter with `status: in-progress` and the
 *                  given `assignee`, then exit 0;
 *   3. on FAIL  -> print the validation report and exit non-zero WITHOUT writing.
 *
 * Dependency-free (Node built-ins only); reuses validate.js in-process so the
 * gate and the lint can never drift apart.
 *
 * Usage:
 *   node claim.js --assignee <who> <ticketfile.md>
 *   node claim.js <ticketfile.md>            (assignee defaults to "agent")
 *
 * Vendor / tracker / runtime AGNOSTIC: no tracker calls, no credentials, no
 * personal identities. `<who>` is whatever the caller passes.
 */

const fs = require("node:fs");
const path = require("node:path");

const validate = require("./validate.js");

/* ------------------------------------------------ frontmatter field rewrite */

// Rewrite a single top-level scalar `key: value` line inside the leading
// frontmatter fence, preserving any trailing ` # comment`. If the key is
// absent, insert it just before the closing fence. Operates on raw text so the
// rest of the file (body, comments, ordering) is untouched.
function setFrontmatterField(text, key, value) {
  const normalized = text.replace(/^﻿/, "");
  // Capture the inner block (g1) and the entire matched fence (g0) so the body
  // after the fence is preserved exactly.
  const fence = /^(---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))/;
  const m = fence.exec(normalized);
  if (!m) {
    throw new Error("no frontmatter fence to update");
  }
  const open = m[1];
  const block = m[2];
  const close = m[3];
  const body = normalized.slice(m[0].length);
  const eol = open.includes("\r\n") ? "\r\n" : "\n";
  const lines = block.split(/\r?\n/);
  const keyRe = new RegExp("^(" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\s*:\\s?(.*)$");
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    const km = keyRe.exec(lines[i]);
    if (!km) continue;
    // Preserve a trailing inline comment if present (outside of brackets).
    const after = km[2];
    const hashIdx = findInlineCommentStart(after);
    const comment = hashIdx === -1 ? "" : after.slice(hashIdx).trim();
    lines[i] = `${key}: ${value}${comment ? " " + comment : ""}`;
    found = true;
    break;
  }
  if (!found) {
    lines.push(`${key}: ${value}`);
  }
  return open + lines.join(eol) + close + body;
}

function findInlineCommentStart(value) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (ch === "[" || ch === "{")) depth += 1;
    else if (!inSingle && !inDouble && (ch === "]" || ch === "}")) depth -= 1;
    else if (ch === "#" && !inSingle && !inDouble && depth === 0 && i > 0 && /\s/.test(value[i - 1])) {
      return i;
    }
  }
  return -1;
}

/* --------------------------------------------------------------------- core */

// Claim a ticket file. Returns { ok, code, report }.
//  - validates the ticket; on failure ok:false and the file is untouched;
//  - on success, writes status: in-progress + assignee and ok:true.
function claim(file, assignee, io) {
  const write = (s) => (io && io.stdout ? io.stdout.write(s) : process.stdout.write(s));

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    write(`FAIL  ${file}\n  - file: cannot read (${e.code || e.message})\n`);
    return { ok: false, code: 2 };
  }

  const result = validate.validateTicket(text, {});
  if (!result.ok) {
    write(`BLOCKED  ${file} — readiness gap-scan failed; not claiming.\n`);
    for (const err of result.errors) {
      write(`  - ${err.field}: ${err.message}\n`);
    }
    return { ok: false, code: 1 };
  }

  let updated;
  try {
    updated = setFrontmatterField(text, "status", "in-progress");
    updated = setFrontmatterField(updated, "assignee", assignee);
  } catch (e) {
    write(`FAIL  ${file}\n  - claim: cannot update frontmatter (${e.message})\n`);
    return { ok: false, code: 2 };
  }

  fs.writeFileSync(file, updated, "utf8");
  write(`CLAIMED  ${file} — status: in-progress, assignee: ${assignee}\n`);
  return { ok: true, code: 0 };
}

/* --------------------------------------------------------------------- CLI */

function run(argv, io) {
  const err = (io && io.stderr) || process.stderr;
  const cwd = (io && io.cwd) || process.cwd();

  let assignee = "agent";
  const positionals = [];
  const args = argv.slice();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--assignee") {
      assignee = args[i + 1];
      i += 1;
      if (assignee === undefined) {
        err.write("claim: --assignee needs a value\n");
        return 2;
      }
    } else if (a === "-h" || a === "--help") {
      (io && io.stdout ? io.stdout : process.stdout).write(usage() + "\n");
      return 0;
    } else if (a.startsWith("--")) {
      err.write(`claim: unknown option "${a}"\n`);
      return 2;
    } else {
      positionals.push(a);
    }
  }

  if (positionals.length !== 1) {
    err.write("claim: expected exactly one ticket file\n\n" + usage() + "\n");
    return 2;
  }

  const file = path.isAbsolute(positionals[0]) ? positionals[0] : path.join(cwd, positionals[0]);
  return claim(file, assignee, io).code;
}

function usage() {
  return [
    "Usage:",
    "  node claim.js --assignee <who> <ticketfile.md>   claim a ticket after the gap-scan passes",
    "  node claim.js <ticketfile.md>                    (assignee defaults to \"agent\")",
    "",
    "Runs the readiness gap-scan (validate); on pass writes status: in-progress",
    "+ assignee; on fail prints BLOCKED and exits non-zero without writing.",
    "Exit 0 on claim; 1 on a failed gap-scan; 2 on usage/IO error."
  ].join("\n");
}

module.exports = { claim, setFrontmatterField, run };

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd()
  });
}
