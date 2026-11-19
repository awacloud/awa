---
module: hypertree/create
category: hypertree
name: createHypertree
type: helper
dependencies: [helpers/shared-runtime, hypertree/hypertree]
returns: "HypertreeHandle { instance, root, dispose }"
worker-safe: false
status: complete
---

# hypertree/create — `createHypertree`

> Build a radial tree into an element, creating the SVG root when needed.

**Module** `graphic.hypertree/create` | **Type** constructible helper (not a module descriptor, not a `graphicModules` member) | **Source** `packages/front/graphic/anim/src/hypertree/create.js` | **Deps** the shared helper runtime, `graphic.hypertree`, `graphic.svgApply` | **Worker-safe** no

## Descriptor

There is no descriptor. `createHypertree(rootEl, opts)` acquires the shared
runtime (`registerDeep` of the `graphic.hypertree` descriptor and its whole `deps`
closure), resolves `graphic.hypertree` and `graphic.svgApply`, prepares the SVG
root and constructs the tree. It composes; it touches no descriptor.

## API

| Export | Signature | Description |
|--------|-----------|-------------|
| `createHypertree` | `(rootEl: Element, opts: HypertreeHelperOptions) => HypertreeHandle` | Build the tree under `rootEl`. |

`opts` is `HypertreeOptions` plus `tree` (a `TreeNode` or a forest array,
required). `tree` is stripped; the rest is forwarded **verbatim** to the
`Hypertree` constructor (see [hypertree/hypertree](./hypertree.md#options-hypertreeoptions)).
The helper adds no other option.

`HypertreeHandle`:

| Member | Meaning |
|--------|---------|
| `instance` | The live `Hypertree` with its full public API (`focus`, `focusSync`, `focusId`, `node`, `rootId`, `el`, …). |
| `root` | The SVG root the tree was built into: the supplied one, or the element the helper created. |
| `dispose()` | Idempotent teardown: disposes the instance, removes the built `<g>` and, when the helper created the root, that root, then releases its share of the runtime. |

## Examples

```js
const carto = createHypertree(document.querySelector('#carto'), {
    tree: { id: 'root', children: [{ id: 'a' }, { id: 'b' }] },
    radius: 400,
    onFocus: (id) => console.log('focused', id),
});
carto.instance.focus('a');
carto.dispose();
```

## Notes

- **SVG-root recipe**: a `rootEl` already in the SVG namespace (an `<svg>` or
  `<g>`) is used as is, never resized or re-attributed. Any other element is a
  container: the helper creates an `<svg>` with `createElementNS`, sets
  `preserveAspectRatio="xMidYMid meet"`, appends it, and after construction sets
  `viewBox="0 0 2R 2R"` where `R` is read from the live layout (the root node's
  `x`), so it fits the radius in force. The container owns the CSS size.
- **Throws**: `createHypertree: rootEl is required`; `createHypertree: opts.tree
  is required`; plus every `Hypertree` constructor error, propagated unchanged.
  On a constructor failure the helper removes the root it inserted and releases
  its runtime share, leaving nothing behind.
- A caller-supplied root is left in place after `dispose()`, emptied of this tree.
- The runtime is shared across calls and with `createPageflip` (one
  `graphic.scheduler`), and reference-counted: the last `dispose()` releases it.
- Not Worker-safe (element-anchored).

## See also

- [hypertree/hypertree](./hypertree.md) — the module and its options
- [helpers/shared-runtime](../helpers/shared-runtime.md) — the shared runtime
- [main](../main.md) — the public entry that exports the helper
- [hypertree guide](../../hypertree.md) — the long form
