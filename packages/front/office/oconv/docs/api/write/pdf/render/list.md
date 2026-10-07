---
module: oconvPdfRenderList
category: oconv/write/pdf/render
dependencies: [oconvPdfLinebreak]
returns: object
worker-safe: true
status: complete
---

# oconvPdfRenderList

> The `list` renderer — nested bullet/ordered lists, markers by depth.

**Module** `oconvPdfRenderList` | **Source** `packages/front/office/oconv/src/write/pdf/render/list.js` | **Deps** `oconvPdfLinebreak` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfRenderList = runtime.resolve('oconvPdfRenderList');
```

Composed internally by [`ir-to-pdf`](../../ir-to-pdf.md)'s `render`
dispatcher, never called directly by a consumer — `ctx` is stack-shaped
(see Examples for a self-contained fixture).

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `render` | `(node: object, ctx: object) => {items: object[], losses: object[], height?: number}` | block-local laid-out items (the renderer contract) | — |

`node` is an `oconv-ir/v1` `list` node. `ctx` is the stack's child context
(`measurer`, `layout`, `linebreak`, `losses`, `render`, `flowChildren`,
`index`, `indent`, `kind`) — `flowChildren` is what re-flows each item's
children.

## Examples

The sessions below hand the renderer the child context the stack gives it:
the members `ir-to-pdf` assembles (`measurer`, `layout`, `column`,
`sizeFor`, `leading`, `linebreak`, `losses`, `render`) plus the per-block
`index`, `indent` and `kind` the stack stamps on top, and the `flowChildren`
re-entry helper the facade binds to each renderer. `childContext` below
rebuilds that helper the way the facade does: it re-enters the stack's
`flowBlocks` one indent step further right. Every IR is built with
`oconvIr.node`, so it passes `oconvIr.validate`.

### Render a two-item bullet list

```js
const { node, validate } = runtime.resolve('oconvIr');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const stack = runtime.resolve('oconvPdfStack');
const measurer = metrics.createMeasurer();
const layout = box.resolveLayout();

function childContext(block, index) {
    const base = {
        measurer, layout, column: layout.column, sizeFor: layout.sizeFor,
        leading: layout.leading, linebreak, losses: [],
        render: (b) => ({ items: [], losses: [{ code: 'layout/unhandled-block', detail: { kind: b.kind } }] }),
        index, indent: 0, kind: block.kind
    };
    const flowChildren = (blocks, opts = {}) => {
        const sub = {
            ...base,
            indent: base.indent + (Number.isFinite(opts.indentDelta) ? opts.indentDelta : stack.INDENT_STEP),
            indexPrefix: base.index,
            ruleX: opts.ruleX === undefined ? null : opts.ruleX,
            linebreak: opts.styleOverride
                ? { ...linebreak, breakInlines: (inlines, m, size, column) =>
                    linebreak.breakInlines(inlines, m, size, column, opts.styleOverride) }
                : linebreak
        };
        const flowed = stack.flowBlocks(node('document', {}, blocks), sub);
        let height = 0;
        for (const b of flowed) height += b.spaceBefore + b.height + b.spaceAfter;
        return { blocks: flowed, height };
    };
    return { ...base, flowChildren };
}

const item = (text) => node('listItem', {}, [node('paragraph', {}, [node('run', { text })])]);
const listNode = node('list', { ordered: false }, [item('First item'), item('Second item')]);
validate(listNode).ok;   // true
const { items, losses, height } = oconvPdfRenderList.render(listNode, childContext(listNode, '0'));
items.length;   // 4 — 2 markers + 2 one-line item bodies
losses;         // []
height;         // 31.790000000000006 (31.79 to two decimals)
```

Executed against the live package (2026-10-06): `validate(listNode).ok ===
true`, `items.length === 4`, `losses === []`, `height` is 31.790000000000006
(31.79 to two decimals).

### Probe — a list with no `listItem` children records `layout/list-empty`

```js
const emptyList = node('list', { ordered: false }, []);
const emptyOut = oconvPdfRenderList.render(emptyList, childContext(emptyList, '0'));
emptyOut.items;    // []
emptyOut.losses;   // [{ code: 'layout/list-empty', detail: { index: '0' } }]
'height' in emptyOut;   // false — NO `height` key at all, unlike render/table's
                        //         empty branch (see Notes)
```

Executed against the live package (2026-10-06): exactly the shape above —
`emptyOut.losses` has one `layout/list-empty` entry, and `'height' in
emptyOut` is `false`.

### Probe — a list with ONE blank `listItem` does NOT reach `layout/list-empty`

```js
const blankList = node('list', { ordered: false }, [node('listItem', {}, [])]);
const blankOut = oconvPdfRenderList.render(blankList, childContext(blankList, '0'));
blankOut.items.length;   // 1 — the marker alone; no loss
blankOut.losses;         // []
```

Executed against the live package (2026-10-06): `items.length === 1`,
`losses === []` — a `listItem` with no block children still draws its own
marker and reaches neither `layout/list-empty` nor any other loss.

## Notes

- **Degenerate-return shape differs from `render/table`'s, MEASURED, never
  assumed**: this module's empty branch
  returns `{items: [], losses: [...]}` with **no `height` key at all**,
  while [`render/table`](./table.md)'s empty branch returns an explicit
  `height: 0` + `keepTogether: true`. A test (or a doc) mirrored from the
  sibling fails on the SHAPE, not the behaviour — re-confirmed here by
  direct probe (above).
- **`layout/list-empty` fires ONLY through a `list` node with literally
  zero `listItem` children** — a whitespace-only paragraph, a paragraph
  with no run, or a `listItem` with no child block still draws its own
  marker and records zero losses (probed above). This is a narrower
  trigger than "the list renders nothing".
- **Depth tracking is a factory-local re-entrancy counter**, not a `ctx`
  field: `ctx` carries no `depth` (the renderer contract only threads `index`,
  `indent`, `kind`), and a nested list reaches this module through the
  generic `ctx.render` re-entry. The counter increments on every `render()`
  entry and decrements on exit (`try/finally`) — sound because the whole
  call chain is synchronous, single-threaded depth-first recursion.
- **Marker glyphs by depth**: bullet — `•` (U+2022), `–` (U+2013), `·`
  (U+00B7), depth 3+ repeating `·` (all three WinAnsi-representable).
  Ordered — `1.`/`2.`/… (depth 1), `a.`/`b.`/… (depth 2), `i.`/`ii.`/…
  lower Roman (depth 3+); each list's OWN counter starts fresh at 1 —
  nesting never carries a counter over.
- **Geometry**: each nesting level advances `ctx.indent` by 18 pt
  (`INDENT_STEP`, mirrors `stack.js`'s own constant per
  `fw/no-factory-capture`). The marker column is 14 pt wide, marker
  right-aligned to it; item content flows one indent step further right.
  0.25 · body size gap between consecutive items — the 0.6 · body size gap
  AFTER the whole list is `stack.js`'s own uniform delegated-kind
  `spaceAfter`, not added here.
- **Every item carries `index: ctx.index, kind: 'list'`** — the same
  convention [`render/table`](./table.md) uses for a cell's nested content;
  `ctx.flowChildren`'s `indexPrefix` is fixed to this list's OWN index for
  every item it flows, so a per-item dotted path would collide across
  sibling items anyway.
- Capture-free (`fw/no-factory-capture`), worker-safe.

## See also

- [`ir-to-pdf`](../../ir-to-pdf.md) — the dispatcher; a renderer never
  edits it.
- [`pdf/stack`](../stack.md) — defines `flowChildren`/`render` and the
  accounting invariant this module's `layout/list-empty` loss satisfies.
- [`pdf/render/table`](./table.md) — the sibling renderer whose degenerate
  return shape DIFFERS (see Notes).
- [`pdf-writer.md`](../../../../pdf-writer.md) — `layout/list-empty` in the
  audience-facing loss-code table.
