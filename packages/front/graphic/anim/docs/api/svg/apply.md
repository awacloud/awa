---
module: graphic.svgApply
category: svg
dependencies: ['dom']
returns: '{ SVG_NS, svgAttr }'
worker-safe: false
status: complete
---

# graphic.svgApply

> Capture-free fw module descriptor for SVG attribute writing, routing through fw `dom.attr`.

**Module** `graphic.svgApply` | **Source** `packages/front/graphic/anim/src/svg/apply.js` | **Type** `fw.dom.graphic` | **Version** `0.1.0` | **Deps** `['dom']` | **Worker-safe** no

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { svgApplyModule } from '@awacloud/graphic-anim';

const runtime = new ModuleRuntime();
runtime.registerDeep(svgApplyModule); // also registers fw dom + secPolicy transitively
const { SVG_NS, svgAttr } = runtime.resolve('graphic.svgApply');
```

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `SVG_NS` | `string` | The SVG namespace URI (`http://www.w3.org/2000/svg`). Single source for element construction via `createElementNS`. |
| `svgAttr` | `(target, name, value) => void` | Write an interpolated value to a named SVG/DOM attribute via `dom.attr`. No-op on `null`, `undefined`, or any target lacking `setAttribute` — never throws. |

## Sanitization scope

`dom.attr` writes via raw `setAttribute` — it does **NOT** invoke secPolicy sanitization. Only `dom.style` and the visibility helpers (`dom.hide`, `dom.show`, `dom.toggleVisibility`) sanitize through secPolicy. Callers must not assume attribute values written via `svgAttr` are filtered for XSS/injection beyond what the browser's `setAttribute` itself enforces.

## Dependency graph

```
graphic.svgApply
  └── dom  (fw.dom.query — @awacloud/fw/dom/query/dom.js)
        └── secPolicy  (fw.dom.security — pulled automatically by registerDeep)
```

`'dom'` is an **fw** module, not a graphic descriptor: it is NOT in `graphicModules`, but IS in `fw_require` (alongside `secPolicy`) in `src/main.js`.

## Examples

```js
const rect = document.createElementNS(SVG_NS, 'rect');

// Write attributes — numeric values are coerced to string.
svgAttr(rect, 'width', 100);   // → '100'
svgAttr(rect, 'height', 50);
svgAttr(rect, 'fill', '#ff0000');

// Guard contract: these are all no-ops, never throw.
svgAttr(null, 'x', '10');
svgAttr(undefined, 'cx', 0);
svgAttr({}, 'r', 5);
```

## Notes

- `svgAttr` is the default `apply` writer for `graphic.tween` (main-thread only; no Worker use).
- `SVG_NS` is exported here as the single source of truth; the JSON→SVG builder (`graphic.svgBuild`) imports it from this module.
- Attribute names are unprefixed for setting (`width`, `height`, `cx`, etc.); `SVG_NS` is used only for element *creation* via `createElementNS`.
- No-op on `null`, `undefined`, or any target lacking `setAttribute` — never throws. This is the engine's "no-op, never throw on a missing/invalid target" contract preserved through the refactor.
- `dom.attr` does NOT guard non-elements; the missing-target guard lives in `svgAttr` itself.

## See also

- [graphic.tween](../anim/tween.md) — uses `svgAttr` as the default apply writer
- [fw dom module](https://github.com/awacloud/awa/blob/main/packages/front/fw/docs/api/dom/query/dom.md) — the underlying attr writer
