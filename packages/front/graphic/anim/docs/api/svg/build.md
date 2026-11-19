---
module: graphic.svgBuild
category: svg
dependencies: ['dom', 'graphic.svgApply']
returns: '{ build, SVG_TAGS }'
worker-safe: false
status: complete
---

# graphic.svgBuild

> Capture-free fw module descriptor for a JSON→SVG builder. Recursively constructs a namespace-correct `SVGElement` subtree from a plain JSON descriptor, writing every attribute through the frozen `graphic.svgApply` write path.

**Module** `graphic.svgBuild` | **Source** `packages/front/graphic/anim/src/svg/build.js` | **Type** `fw.dom.graphic` | **Version** `0.1.0` | **Deps** `['dom', 'graphic.svgApply']` | **Worker-safe** no

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { svgBuildModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(svgBuildModule); // also registers graphic.svgApply + fw dom + secPolicy
const { build, SVG_TAGS } = runtime.resolve('graphic.svgBuild');
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `build` | `(node, opts?) => SVGElement` | Recursively construct a namespace-correct `SVGElement` subtree from `node`. Throws on an unsupported tag. |
| `SVG_TAGS` | `Set<string>` | The in-factory element whitelist (frozen). |

## Node descriptor

`build` consumes a plain JSON node descriptor (frozen):

```ts
{
  tag: string,                          // must be in SVG_TAGS
  attrs?: Record<string, string|number>, // written via svgApply.svgAttr (coerced to String)
  children?: (NodeDesc | string)[],     // a string child ⇒ document.createTextNode
  text?: string | number,               // ⇒ el.textContent (coerced to String)
}
```

- `tag` not in `SVG_TAGS` ⇒ `throw new Error('svgBuild: unsupported tag "<tag>"')`.
- Elements are created via `document.createElementNS(SVG_NS, node.tag)`, where `SVG_NS` is taken from the injected `graphic.svgApply` (single source — never re-declared here).
- Each `attrs` entry is written with `svgApply.svgAttr(el, name, value)` — the single frozen write path (it coerces the value to `String`). `href` / `xlink:href` pass through by name; no raw `setAttribute` is used.
- `children` are appended in order; string children become text nodes.
- `text` sets `textContent` (coerced to string).

## Whitelist (`SVG_TAGS`)

The element whitelist is defined **inside the factory** (capture-free). It covers shapes + containers + `defs`/gradients/filters:

```
svg, g, defs, symbol, use,
path, rect, circle, ellipse, line, polyline, polygon,
text, tspan, image,
clipPath, mask,
linearGradient, radialGradient, stop,
filter, feGaussianBlur, feOffset, feBlend, feColorMatrix,
feMerge, feMergeNode, feFlood, feComposite,
marker, pattern
```

Extending the whitelist is a **one-line in-factory edit** in `build.js`, mirrored here — the builder never accepts arbitrary tags.

## `opts.idScope` seam

`build(node, opts)` accepts an optional `opts.idScope` — a `graphic.scopedIds` scope. When present:

- `id` attribute values route through `scope.id(value)`.
- Reference-shaped values (`url(#…)` and bare `#…`) route through `scope.ref(value)`.

When `opts.idScope` (or the relevant hook on it) is **absent**, ids and references pass through **verbatim** — the builder works standalone with no dependency on scoped-id generation.

```js
// Standalone — verbatim ids/refs.
build({ tag: 'rect', attrs: { id: 'r1', fill: 'url(#g1)' } });

// Scoped — a graphic.scopedIds scope.
build({ tag: 'rect', attrs: { id: 'r1', fill: 'url(#g1)' } }, {
  idScope: { id: v => `scoped-${v}`, ref: v => v.replace('#', '#scoped-') },
});
```

## Path `d` + color values

Path `d` and color values pass through **verbatim as strings** — the builder does NOT parse them. Interpolation-time parsing/normalization is the job of the frozen `graphic.interpolate` (`parsePath` / color parsing) at animation time, not the builder.

## Sanitization scope (caveat)

Attribute values are written via `svgApply.svgAttr` → fw `dom.attr` → raw `setAttribute`. **`dom.attr` does NOT sanitize** — only `dom.style` and the visibility helpers route through secPolicy. The builder therefore performs **no attribute sanitization**; callers must not assume `attrs` values are filtered for XSS/injection beyond what the browser's `setAttribute` itself enforces. This mirrors the `graphic.svgApply` caveat.

## Examples

```js
const svg = build({
  tag: 'svg',
  attrs: { width: 200, height: 100, viewBox: '0 0 200 100' },
  children: [
    { tag: 'defs', children: [{
      tag: 'linearGradient', attrs: { id: 'g1' },
      children: [
        { tag: 'stop', attrs: { offset: '0%', 'stop-color': '#fff' } },
        { tag: 'stop', attrs: { offset: '100%', 'stop-color': '#000' } },
      ],
    }] },
    { tag: 'rect', attrs: { width: 200, height: 100, fill: 'url(#g1)' } },
    { tag: 'text', attrs: { x: 10, y: 20 }, text: 'Hello' },
  ],
});
// svg.namespaceURI === 'http://www.w3.org/2000/svg' (all descendants too)
```

## Dependency graph

```
graphic.svgBuild
  ├── dom              (fw.dom.query — @awacloud/fw/dom/query/dom.js)
  │     └── secPolicy  (fw.dom.security — pulled automatically by registerDeep)
  └── graphic.svgApply (fw.dom.graphic — provides SVG_NS + svgAttr)
```

## Notes

- Worker-safe: **no** — `build` calls `document.createElementNS` (main-thread DOM).
- `SVG_NS` is not re-declared in this module; it is destructured from the injected `graphic.svgApply` return, keeping a single namespace source.
- Diffing / incremental patching of an existing subtree is out of scope (deferred to a P2 extension).

## See also

- [graphic.svgApply](./apply.md) — provides `SVG_NS` + the `svgAttr` write path
- [graphic.interpolate](../interpolate/index.md) — parses `d`/color values at animation time
