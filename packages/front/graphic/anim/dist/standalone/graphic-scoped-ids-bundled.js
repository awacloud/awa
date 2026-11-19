/* GENERATED — do not edit. Source: tools/generate-prebuilds.mjs */

/**
 * @fileoverview `@awacloud/graphic/bundles/prebuilt/graphic-scoped-ids-bundled` — pre-built single-factory bundle.
 *
 * Variant **bundled** : declares no dependencies — every fw and graphic-local
 * factory transitively reachable from `graphic.scopedIds`  is inlined.
 *
 * @module graphic/bundles/prebuilt/graphic-scoped-ids-bundled
 */

export const graphicScopedIdsBundled = {
    name: "graphicScopedIdsBundled",
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
    __register({ name: "graphic.scopedIds", dependencies: [], factory: function() {
    let _defaultPrefixSeq = 0;
    const HREF_ATTRS = new Set(["href", "xlink:href"]);
    function createScope(rawPrefix) {
      const prefix = rawPrefix === void 0 ? `g-${_defaultPrefixSeq++}` : rawPrefix;
      let _seq = 0;
      const nextSeq = () => _seq++, minted = new Map;
      function id(rawId) {
        if (rawId === void 0 || rawId === null || rawId === "")
          return `${prefix}-${nextSeq()}`;
        const key = String(rawId), existing = minted.get(key);
        if (existing !== void 0)
          return existing;
        const scoped = `${prefix}-${key}-${nextSeq()}`;
        minted.set(key, scoped);
        return scoped;
      }
      function ref(value, attrName) {
        if (typeof value !== "string")
          return value;
        const urlMatch = value.match(/^url\(\s*#([^\s)]+)\s*\)$/);
        if (urlMatch)
          return `url(#${id(urlMatch[1])})`;
        if (attrName !== void 0 && HREF_ATTRS.has(attrName)) {
          const hashMatch = value.match(/^#([^\s]+)$/);
          if (hashMatch)
            return `#${id(hashMatch[1])}`;
        }
        return value;
      }
      return {
        id,
        ref,
        prefix,
        seq() {
          return _seq;
        }
      };
    }
    return { createScope };
  } });

    const __core = __resolve("graphic.scopedIds");
    return __core;
    }
};
