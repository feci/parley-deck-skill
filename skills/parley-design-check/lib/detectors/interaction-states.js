"use strict";

/*
 * An interactive element that declares some of its states and not the rest.
 *
 * The state set comes from the contract when there is one. Without a contract the default
 * set is the doctrine's: the resting appearance plus the states a user can reach with a
 * pointer or a keyboard. A contract state with no form in source is reported NEEDS_REVIEW
 * rather than dropped — a state this tier cannot see is not a state that passed.
 */

const { STATE_FORMS, selectorBase, selectorState } = require("../css.js");

const DEFAULT_STATES = ["rest", "hover", "focus", "pressed", "disabled"];
const SOURCE_FORMS = new Set(["rest", ...STATE_FORMS.map((form) => form.state)]);
const INTERACTIVE_ELEMENT = /(^|[\s>+~])(button|a|input|select|textarea|summary|\[role=["']?button["']?\])([\s.:#[]|$)/;

module.exports = {
  rule: "core:interaction-states-incomplete",
  tier: "T1",
  inputs: ["styles"],
  summary: "groups selectors by the element they target and reports the states of the contract's set that are undeclared",
  run(ctx) {
    const declared = ctx.contract && Array.isArray(ctx.contract.data.states)
      ? ctx.contract.data.states.map((state) => String(state).toLowerCase())
      : null;
    const wanted = declared || DEFAULT_STATES;
    const results = [];
    const unreadable = wanted.filter((state) => !SOURCE_FORMS.has(state));
    if (declared && unreadable.length > 0) {
      results.push({
        verdict: "NEEDS_REVIEW",
        path: ctx.contract.path,
        line: 0,
        violation: `the contract requires ${unreadable.join(", ")}, which have no form this tier can read`,
        remedy: "judge those states against the running interface, or give them a declared form in source such as a data attribute"
      });
    }
    const checkable = wanted.filter((state) => SOURCE_FORMS.has(state));

    for (const style of ctx.styles) {
      const bases = new Map();
      for (const block of style.blocks) {
        for (const selector of block.selectors) {
          const base = selectorBase(selector);
          if (base === "" || base.startsWith("@") || /^\d/.test(base)) continue;
          if (!bases.has(base)) bases.set(base, { states: new Set(), line: block.line });
          const entry = bases.get(base);
          entry.states.add(selectorState(selector));
          entry.line = Math.min(entry.line, block.line);
        }
      }
      for (const [base, entry] of [...bases.entries()].sort((a, b) => a[1].line - b[1].line)) {
        const hasState = [...entry.states].some((state) => state !== "rest");
        const looksInteractive = INTERACTIVE_ELEMENT.test(base);
        if (!hasState && !looksInteractive) continue;
        const missing = checkable.filter((state) => !entry.states.has(state));
        if (missing.length === 0) continue;
        results.push({
          verdict: "VIOLATION",
          path: style.path,
          line: entry.line,
          violation: `${base} declares ${[...entry.states].sort().join(", ")} and leaves ${missing.join(", ")} undeclared`,
          remedy: "declare every state the contract lists, and mark a state that is deliberately identical to another as such"
        });
      }
    }
    return results;
  }
};
