/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-units-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.units`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-units-bundled
 */

export const graphicUnitsBundled = {
    name: "graphicUnitsBundled",
    dependencies: [],
    factory() {
    const __reg = Object.create(null);
    const __cache = Object.create(null);
    function __register(m) { __reg[m.name] = m; }
    function __resolve(name) {
        if (name in __cache) return __cache[name];
        const def = __reg[name];
        if (!def) throw new Error('prebuilt: unknown module ' + name);
        const args = def.dependencies.map(__resolve);
        return (__cache[name] = def.factory.apply({}, args));
    }

    // fw modules — inlined (bundled variant).

    // graphic-local factories — inlined and topo-ordered.
    __register({ name: "graphic.units", dependencies: [], factory: function() {
    return {
      split(input) {
        if (typeof input === "number")
          return { value: input, unit: "" };
        if (typeof input !== "string")
          throw Error("units.split: expected string|number");
        const m = input.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i);
        if (!m)
          throw Error(`units.split: cannot parse "${input}"`);
        return { value: parseFloat(m[1]), unit: m[2] || "" };
      },
      format(value, unit) {
        return `${Math.round(value * 1e6) / 1e6}${unit || ""}`;
      }
    };
  } });

    const __core = __resolve("graphic.units");
    return __core;
    }
};
