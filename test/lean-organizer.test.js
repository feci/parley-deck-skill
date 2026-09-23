"use strict";

// lean-organizer C.4 (idea meta-protocol-change-lean-organizer): the slim
// SKILL.md core. Core <= 20,000 B; frontmatter description and Core Rule verbatim;
// the six driver commands named; every reference linked from core; every relocated
// heading lands in exactly one references file and none was dropped; and the
// bundled COOPERATION.md carries the idea's protocol hunks identically to the CLI
// copies (content-parity check as repo tooling).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const corePath = path.join(__dirname, "..", "skills", "parley-deck", "SKILL.md");
const refsDir = path.join(__dirname, "..", "skills", "parley-deck", "references");
const core = fs.readFileSync(corePath, "utf8");

const CORE_BUDGET = 20000;

// The pre-split SKILL.md top-level sections and where each landed. This is the
// relocation proof's ground truth (from the v2.12.1 file, git history preserves it).
const RELOCATION = {
  "Core Rule": "core",
  "Non-Solo Requirement": "core",
  "Required Protocol Context": "core",
  "Skill Metadata": "ROSTER_AND_PROTOCOL.md",
  "Automation Mode": "core",
  "Protocol Drift Check": "ROSTER_AND_PROTOCOL.md",
  "Protocol Coverage Checklist": "ROSTER_AND_PROTOCOL.md",
  "Startup Flow": "core",
  "Transport Selection / deck bootstrap": "ROSTER_AND_PROTOCOL.md",
  "Commit Message Conventions": "ROSTER_AND_PROTOCOL.md",
  "Agent Capability Discovery": "ROSTER_AND_PROTOCOL.md",
  "Autonomous Execution (required)": "HEADLESS_LAUNCH.md",
  "The roster: one answer, three verbs": "ROSTER_AND_PROTOCOL.md",
  "The protocol: a global core, a generated deck view": "ROSTER_AND_PROTOCOL.md",
  "Selection Checkpoint": "ROSTER_AND_PROTOCOL.md",
  "Headless Agent Configuration": "HEADLESS_LAUNCH.md",
  "Timeout Policy": "HEADLESS_LAUNCH.md",
  "Recovery And Partial Completion": "ROSTER_AND_PROTOCOL.md",
  "File Ownership Model": "core",
  "Idea Kickoff": "ARTIFACT_TEMPLATES.md",
  "Round 1: Independent Analysis": "ARTIFACT_TEMPLATES.md",
  "Cross-Review Rounds": "ARTIFACT_TEMPLATES.md",
  "Consensus And Finalization": "ARTIFACT_TEMPLATES.md",
  "Implementation Lifecycle": "ARTIFACT_TEMPLATES.md",
  "Escalation To User": "core",
  "Protocol Changes": "ROSTER_AND_PROTOCOL.md",
  "Generic CLI Invocation Contract": "HEADLESS_LAUNCH.md",
  "Quality Gates": "core",
  "Keep It Small": "ROSTER_AND_PROTOCOL.md",
};

// The lean-organizer protocol hunks, identical in all three COOPERATION.md copies.
const PROTOCOL_HUNKS = [
  "a deck declaring `facilitator:` may run it as the pure organizer by default",
  "In a declared-facilitator run (`facilitator:` in `00-prompt.md`) the default is that participants implement and verify the code",
  "In a declared-facilitator run, code review and code verification stay with the participants by default",
  "`parley protocol packet --audience facilitator`",
  "may re-orient from the computed `parley organizer brief`",
  "one blocking `parley wait`",
];

function headingsOutsideFences(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.startsWith("## ")) out.push(line.slice(3).trim());
  }
  return out;
}

test("skill core stays within the 20,000 B budget", () => {
  const bytes = fs.statSync(corePath).size;
  assert.ok(bytes <= CORE_BUDGET, `core is ${bytes} B, budget ${CORE_BUDGET} B — if the cap genuinely cannot fit, the bytes go back to the quorum, never a silent raise`);
});

test("frontmatter description is verbatim (trigger reliability)", () => {
  const m = core.match(/^description: "(.+)",?$/m);
  assert.ok(m, "description line present");
  assert.equal(
    m[1],
    "Run Parley Deck multi-agent idea, implementation, review, or consensus workflows through local CLI agents, using defaulted or user-overridden transport: local files, GitHub PRs, or GitLab MRs. Use when a user wants a task, design, implementation plan, or code review to be independently analyzed by multiple headless or interactive agents according to parley-deck/COOPERATION.md, with each participant writing its own canonical artifacts under parley-deck/ideas/."
  );
});

test("Core Rule heading and text are verbatim", () => {
  assert.match(core, /^## Core Rule$/m);
  assert.match(core, /Act as the facilitator agent\. Every participant writes its own protocol artifact/);
});

test("core names the six driver commands", () => {
  for (const cmd of ["parley run", "parley continue", "parley wait", "parley status", "parley consensus", "parley preflight"]) {
    assert.ok(core.includes(cmd), `core must name ${cmd}`);
  }
});

test("every reference file is linked from core", () => {
  for (const f of fs.readdirSync(refsDir)) {
    assert.ok(core.includes(`references/${f}`), `core must link references/${f}`);
  }
});

test("relocation proof: every moved heading lands in exactly one reference, none dropped", () => {
  const refTexts = {};
  for (const file of ["HEADLESS_LAUNCH.md", "ARTIFACT_TEMPLATES.md", "ROSTER_AND_PROTOCOL.md"]) {
    refTexts[file] = fs.readFileSync(path.join(refsDir, file), "utf8");
  }
  const coreHeadings = new Set(headingsOutsideFences(core));
  for (const [heading, dest] of Object.entries(RELOCATION)) {
    if (dest === "core") {
      assert.ok(coreHeadings.has(heading), `core must retain heading ${JSON.stringify(heading)}`);
      continue;
    }
    let hits = 0;
    for (const file of Object.keys(refTexts)) {
      if (headingsOutsideFences(refTexts[file]).includes(heading)) hits++;
    }
    assert.equal(hits, 1, `heading ${JSON.stringify(heading)} must land in exactly one reference (dest ${dest}), found ${hits}`);
    assert.ok(!coreHeadings.has(heading), `heading ${JSON.stringify(heading)} moved out of core`);
  }
});

test("the new core carries the driver-first section and the lean loop", () => {
  assert.match(core, /^## Driver-First Operation/m);
  assert.match(core, /pure organizer/);
  assert.match(core, /parley organizer brief --idea <slug>/);
  assert.match(core, /raw artifact/i);
});

test("bundled COOPERATION.md carries the idea's protocol hunks (parity, tooling)", () => {
  const coop = fs.readFileSync(path.join(refsDir, "COOPERATION.md"), "utf8");
  for (const hunk of PROTOCOL_HUNKS) {
    assert.ok(coop.includes(hunk), `bundled COOPERATION.md must carry the hunk: ${hunk.slice(0, 50)}...`);
  }
});
