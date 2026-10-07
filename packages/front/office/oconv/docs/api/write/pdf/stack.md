---
module: oconvPdfStack
category: oconv/write/pdf
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvPdfStack

> Flow-block generation + page stacking under the hard page-break rule.

**Module** `oconvPdfStack` | **Source** `packages/front/office/oconv/src/write/pdf/stack.js` | **Deps** — none | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfStack = runtime.resolve('oconvPdfStack');
```

Composed internally by [`ir-to-pdf`](../ir-to-pdf.md) (`layoutDocument`);
resolving it directly needs a hand-built `ctx` (see Examples).

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `INDENT_STEP` | `number` | `18` — points of indent added per nesting level | — |
| `DELEGATED_KINDS` | `string[]` | `['list', 'codeBlock', 'table', 'image']` | — |
| `flowBlocks` | `(irDoc: object, ctx: Ctx) => FlowBlock[]` | flattened linear flow | `Error` `oconv: pdf stack needs ctx.<member>` |
| `stackPages` | `(blocks: FlowBlock[], layout: object) => {pages: Page[], losses: object[]}` | paginated result | — |
| `layoutDocument` | `(irDoc: object, ctx: Ctx) => {pages: Page[], losses: object[], blocks: FlowBlock[]}` | flow + stack, one call | `Error` `oconv: pdf stack needs ctx.<member>` |
| `laidOutText` | `(pages: Page[]) => string` | oracle helper: full placement-order text | — |
| `unaccounted` | `(blocks: FlowBlock[], pages: Page[], losses: object[]) => string[]` | `'<index>:<kind>'` per unaccounted DRAWABLE block, `[]` when the accounting invariant holds | — |

`Ctx` (built by the caller): `measurer`, `layout`, the RESOLVED
`linebreak` API (mandatory — `flowBlocks` throws
`oconv: pdf stack needs ctx.linebreak` without it, since this module is
contractually `dependencies: []`), `losses` (the single loss sink), `render`
(the dispatcher for `list`/`codeBlock`/`table`/`image`), and the re-entry
fields `indent`/`indexPrefix`/`ruleX`. The renderers additionally call
`ctx.flowChildren` to flow a nested block list (a list item's children, a
table cell's blocks): the facade builds it, bound to each renderer's own
context, and it is not needed to call `flowBlocks` itself.

## Examples

The sessions below build the stack's child context by hand, with the same
members `ir-to-pdf` assembles for it (`measurer`, `layout`, `column`,
`sizeFor`, `leading`, `linebreak`, `losses`, `index`, `render`). The
`render` stub stands in for the facade's dispatcher: like the real one, it
answers a kind it has no renderer for with a `layout/unhandled-block` loss.
Every IR below is built with `oconvIr.node` / `oconvIr.doc`, so it passes
`oconvIr.validate`.

### Flow + stack a two-block document

```js
const { node, doc, validate } = runtime.resolve('oconvIr');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const measurer = metrics.createMeasurer();
const layout = box.resolveLayout();

const ctx = {
    measurer, layout, column: layout.column, sizeFor: layout.sizeFor,
    leading: layout.leading, linebreak, losses: [], index: null,
    render: (block) => ({ items: [], losses: [{ code: 'layout/unhandled-block', detail: { kind: block.kind } }] })
};
const ir = doc([
    node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
    node('paragraph', {}, [node('run', { text: 'Body text.' })])
]);
validate(ir).ok;                                     // true
const { pages, losses, blocks } = oconvPdfStack.layoutDocument(ir, ctx);
pages.length;                                        // 1
pages[0].items.length;                               // 2 (heading line + paragraph line)
oconvPdfStack.unaccounted(blocks, pages, losses);    // [] — the invariant holds
```

Executed against the live package (2026-10-06): `validate(ir).ok === true`,
`pages.length === 1`, `pages[0].items.length === 2`,
`unaccounted(...)` is `[]`.

### Probe — an oversized single block is clipped, never split

```js
const tallText = Array.from({ length: 2000 }, (_, i) => 'word' + i).join(' ');
const irTall = doc([node('paragraph', {}, [node('run', { text: tallText })])]);
const out = oconvPdfStack.layoutDocument(irTall, { ...ctx, losses: [] });
out.pages.length;             // 1 — still one page: the stacker never creates a second
                              //     page to hold the excess, it clips at the bottom of
                              //     the one the block already started
out.losses[0].code;           // 'layout/block-clipped'
out.losses[0].clippedLines;   // 160 (measured, this fixture)
```

Executed against the live package (2026-10-06): a 2000-word single
paragraph (taller than one page's content height at 11pt/1.32 leading)
produces exactly one page and one `layout/block-clipped` loss with
`clippedLines: 160`.

### Probe — a delegated kind with no renderer is a recorded loss

```js
const irList = doc([
    node('list', { ordered: false }, [
        node('listItem', {}, [node('paragraph', {}, [node('run', { text: 'item' })])])
    ])
]);
const delegated = oconvPdfStack.layoutDocument(irList, { ...ctx, losses: [] });
delegated.losses[0].code;                                                   // 'layout/unhandled-block'
delegated.losses[0].kind;                                                   // 'list'
oconvPdfStack.unaccounted(delegated.blocks, delegated.pages, delegated.losses);   // [] — named by a loss, so accounted
```

Executed against the live package (2026-10-06): the `list` block places no
item, the stub's `layout/unhandled-block` loss is stamped with the block's
`index` and `kind`, and the accounting invariant still holds because the
block is named by that loss.
## Notes

- **The hard page-break rule**: a block whose total extent does not fit
  the remaining space starts a NEW page. A block TALLER than
  `layout.contentHeight` cannot fit any page — it is clipped at the page
  bottom (never split, never spilled onto a second page) and
  `layout/block-clipped` is recorded with `{clippedLines}` plus a prose
  `detail` string.
- **A heading's `keepTogether` is NOT widow/orphan control** (the typesetter
  refuses that): it is a cheap "no heading alone at the page bottom" rule — if the
  heading plus ONE leading line of the next block do not fit, both move to
  the next page. Nothing is ever moved because of where a PARAGRAPH's own
  lines land.
- **The accounting invariant is a test oracle, not a comment**:
  `unaccounted(blocks, pages, losses)` returns `[]` exactly when every
  DRAWABLE flow block (`isDrawable`: has lines with ink, OR is a delegated
  kind, OR is an `hr`) either placed at least one item or is named by a
  loss record (`loss.index` or `loss.detail.index`).
- **Determinism**: pure functions, no clock, no randomness, no ambient
  state — verified end-to-end by a `JSON.stringify` × 2 byte-identity
  test. `@awacloud/pdf`'s `document/builder.js` reads no clock either (its
  only date handling applies to CALLER-supplied metadata), so the property
  holds downstream too.
- `list`/`codeBlock`/`table`/`image` are DELEGATED to `ctx.render` —
  this module owns only `heading`/`paragraph`/`blockquote`/`hr`, so
  extending a renderer never touches this file.
- A `heading`/`paragraph`'s inline children are PARTITIONED: the
  `run`s flow as the text block, and every inline `image` is delegated in
  source order right after it, at index `<block>.i<n>` — before this
  split, an inline image simply vanished with no item and no loss.
- Pure module, `dependencies: []`. Capture-free (`fw/no-factory-capture`):
  everything this module composes with (measurer, layout, linebreaker,
  render dispatcher) arrives as a call-time argument on `ctx`.

## See also

- [`ir-to-pdf`](../ir-to-pdf.md) — builds the real `Ctx` (measurer, layout,
  the `render` dispatcher, `flowChildren` re-entry) and calls
  `layoutDocument`.
- [`pdf/linebreak`](./linebreak.md) — the mandatory `ctx.linebreak`.
- [`pdf/render/list`](./render/list.md),
  [`pdf/render/code`](./render/code.md),
  [`pdf/render/table`](./render/table.md),
  [`pdf/render/image`](./render/image.md) — the delegated renderers.
- [`pdf-writer.md`](../../../pdf-writer.md) — `layout/block-clipped` and
  `layout/unhandled-block` in the audience-facing loss-code table.
