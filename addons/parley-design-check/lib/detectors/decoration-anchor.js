"use strict";

/*
 * Every declared decorative device must name what in the content it is anchored to.
 *
 * Decidable at T0 ARTIFACT because the anchor is a written claim, not a rendered fact: the
 * artifact either says what the device refers to and what changes about it when the content
 * changes, or it does not.
 */

module.exports = {
  rule: "core:decoration-unmotivated",
  tier: "T0",
  inputs: ["artifacts"],
  summary: "requires every entry in a direction's or contract's effects list to carry an anchor clause",
  run(ctx) {
    const bearing = ctx.artifacts.filter(
      (artifact) => artifact.kind === "DIRECTION" || artifact.kind === "CONTRACT"
    );
    if (bearing.length === 0) {
      return [
        {
          verdict: "UNJUDGEABLE",
          violation: "no DIRECTION or CONTRACT artifact among the inputs",
          remedy: "pass the artifact that declares the effects list"
        }
      ];
    }
    const results = [];
    for (const artifact of bearing) {
      const effects = artifact.data.effects;
      if (effects === undefined) continue;
      if (!Array.isArray(effects)) {
        results.push({
          verdict: "VIOLATION",
          path: artifact.path,
          line: 0,
          violation: "the effects field is not a list",
          remedy: "write effects as a list, each entry either {name, anchor} or a name with an entry in effect-anchors"
        });
        continue;
      }
      const anchors = artifact.data["effect-anchors"];
      const anchorMap = anchors && typeof anchors === "object" && !Array.isArray(anchors) ? anchors : {};
      for (const effect of effects) {
        const name = typeof effect === "object" && effect !== null ? String(effect.name ?? "") : String(effect);
        const inline = typeof effect === "object" && effect !== null ? effect.anchor : undefined;
        const anchor = inline !== undefined ? inline : anchorMap[name];
        if (typeof anchor === "string" && anchor.trim() !== "") continue;
        results.push({
          verdict: "VIOLATION",
          path: artifact.path,
          line: 0,
          violation: `declares the device "${name || "(unnamed)"}" with no anchor`,
          remedy: "state what it refers to and what changes about it when the content changes, or remove the device"
        });
      }
    }
    return results;
  }
};
