---
module: oconvPdfRenderTable
category: oconv/write/pdf/render
dependencies: [oconvPdfLinebreak]
returns: object
worker-safe: true
status: complete
---

# oconvPdfRenderTable

> The `table` renderer — fixed-layout GFM table, content-derived column widths.

**Module** `oconvPdfRenderTable` | **Source** `packages/front/office/oconv/src/write/pdf/render/table.js` | **Deps** `oconvPdfLinebreak` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfRenderTable = runtime.resolve('oconvPdfRenderTable');
```

Composed internally by [`ir-to-pdf`](../../ir-to-pdf.md)'s `render`
dispatcher, never called directly by a consumer.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `render` | `(node: object, ctx: object) => {items: object[], losses: object[], height: number, keepTogether: boolean}` | block-local laid-out items (the renderer contract) | — |

`node` is an `oconv-ir/v1` `table` node (`row`/`cell` children, `row.header`
the only structural flag the frozen IR carries). `ctx` is the stack's
child context plus `flowChildren` — used to re-flow each cell's block
content at its resolved column width.

## Examples

The sessions below hand the renderer the child context the stack gives it:
the members `ir-to-pdf` assembles (`measurer`, `layout`, `column`,
`sizeFor`, `leading`, `linebreak`, `losses`, `render`) plus the per-block
`index`, `indent` and `kind` the stack stamps on top, and the `flowChildren`
re-entry helper the facade binds to each renderer. `childContext` below
rebuilds that helper the way the facade does: it re-enters the stack's
`flowBlocks` at the width the table gives a cell, honouring the
`styleOverride` it uses for header cells. Every IR is built with
`oconvIr.node`, so it passes `oconvIr.validate`.

### Render a 2×2 table with a header row

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

const cell = (text) => node('cell', {}, [node('paragraph', {}, [node('run', { text })])]);
const tableNode = node('table', {}, [
    node('row', { header: true }, [cell('H1'), cell('H2')]),
    node('row', { header: false }, [cell('a'), cell('b')])
]);
validate(tableNode).ok;   // true
const { items, losses, height, keepTogether } = oconvPdfRenderTable.render(tableNode, childContext(tableNode, '0'));
items.length;      // 7 — 3 rule items + 4 cell-content items
losses;            // []
height;            // 42.790000000000006 (42.79 to two decimals)
keepTogether;      // true — a keep-with-next hint; the stack does not read it yet, so only keep-with-next is lost (a table is still never split across pages)
```

Executed against the live package (2026-10-06): `validate(tableNode).ok ===
true`, `items.length === 7`, `losses === []`, `keepTogether === true`, and
`height` is 42.790000000000006 (42.79 to two decimals).

### Probe — a table with zero rows returns an explicit `height: 0` + `keepTogether: true`

```js
const emptyTable = node('table', {}, []);
const emptyOut = oconvPdfRenderTable.render(emptyTable, childContext(emptyTable, '0'));
emptyOut;
// { items: [], losses: [{ code: 'layout/table-empty', detail: { index: '0', rows: 0 } }],
//   height: 0, keepTogether: true }
```

Executed against the live package (2026-10-06): exactly the shape above —
DIFFERENT from [`render/list`](./list.md)'s empty branch, which carries no
`height` key at all (see that page's Notes).

## Notes

- **Refusals this module keeps**: a table never splits across a page —
  it is ONE flow block, moved whole or clipped by `stack.js` — and this
  module never breaks a row off; no reflow of an over-wide table (scaled or
  clipped, never silently rearranged); no column alignment, no cell
  spanning, no vertical alignment options, no vertical rules (the frozen IR
  carries `row.header` and nothing else).
- **Column-width algorithm (the documented choice)**: every cell is
  measured TWICE unbroken (`minWidth` — widest single unbreakable word;
  `natWidth` — widest single block) with header cells measured in their
  forced bold class. `Σ nat ≤ available` → widths = `nat` exactly (a
  narrower-than-column table is NOT stretched — the honest GFM look).
  `Σ nat > available ≥ Σ min` → scaled proportionally with a `max(min)`
  floor, excess clamp taken back from columns with slack —
  `layout/table-scaled`. `Σ min > available` → sub-minimal, tokens overrun
  and are truncated at the cell edge — `layout/table-clipped`.
- **`layout/table-empty` fires on TWO distinct degenerate shapes**: zero
  `row` children, or every row present but zero `cell` children across all
  of them (`colCount === 0`) — both produce the identical explicit
  `{items: [], losses: [...], height: 0, keepTogether: true}` return.
- **Rules are their own items, never combined with text on one item** —
  `stack.js` reads `it.rule.y`/`it.rule.h` and OVERWRITES `abs.y` on a
  rule-bearing item, so an item carrying both a rule and text would have
  its text silently misplaced.
- Row height = tallest cell body + `2 · 3pt` padding. Rule items number
  `rows + 1` (one box top, one under every row — the header row's own rule
  drawn at 0.75 pt, every other inter-row rule at 0.5 pt, the bottom box
  rule at 0.5 pt too); there is no separate "header rule" item layered on
  top of a row rule.
- Every item this module returns carries `index: ctx.index, kind: 'table'`
  — the same convention [`render/list`](./list.md) mirrors for its own
  nested content.
- Capture-free (`fw/no-factory-capture`), worker-safe.

## See also

- [`ir-to-pdf`](../../ir-to-pdf.md) — the dispatcher; a renderer never
  edits it.
- [`pdf/render/list`](./list.md) — the sibling renderer whose degenerate
  return shape DIFFERS (no `height` key at all vs. this module's explicit
  `0`).
- [`pdf/stack`](../stack.md) — `keepTogether` is currently inert on the
  delegated-block path (see [`pdf-writer.md`](../../../../pdf-writer.md) §
  "`keepTogether` is currently inert for delegated blocks" — measured, not
  yet changed).
- [`pdf-writer.md`](../../../../pdf-writer.md) — the full `layout/table-*`
  loss-code table.
