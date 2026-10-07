---
module: oconvPdfRenderCode
category: oconv/write/pdf/render
dependencies: [oconvPdfLinebreak]
returns: object
worker-safe: true
status: complete
---

# oconvPdfRenderCode

> The `codeBlock` renderer — one flow line per source line, monospace, unwrapped.

**Module** `oconvPdfRenderCode` | **Source** `packages/front/office/oconv/src/write/pdf/render/code.js` | **Deps** `oconvPdfLinebreak` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfRenderCode = runtime.resolve('oconvPdfRenderCode');
```

Composed internally by [`ir-to-pdf`](../../ir-to-pdf.md)'s `render`
dispatcher, never called directly by a consumer.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `render` | `(node: object, ctx: object) => {items: object[], losses: object[], height?: number}` | block-local laid-out items (the renderer contract) | — |

`node` is an `oconv-ir/v1` `codeBlock` node (`{info, text}`). `ctx` is the
stack's child context — this renderer does not use `ctx.flowChildren`: a
code block's text has no inline children to re-flow.

## Examples

The sessions below hand the renderer the child context the stack gives it:
the members `ir-to-pdf` assembles (`measurer`, `layout`, `column`,
`sizeFor`, `leading`, `linebreak`, `losses`) plus the per-block `index`,
`indent` and `kind` the stack stamps on top. A code block has no nested
blocks, so `flowChildren` is not part of it here. Every IR is built with
`oconvIr.node`, so it passes `oconvIr.validate`.

### Render a two-line fenced code block

```js
const { node, validate } = runtime.resolve('oconvIr');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const measurer = metrics.createMeasurer();
const layout = box.resolveLayout();
const ctx = {
    measurer, layout, column: layout.column, sizeFor: layout.sizeFor,
    leading: layout.leading, linebreak, losses: [],
    index: '0', indent: 0, kind: 'codeBlock'
};

const codeNode = node('codeBlock', { info: 'js', text: 'const a = 1;\nconsole.log(a);\n' });
validate(codeNode).ok;   // true
const { items, losses, height } = oconvPdfRenderCode.render(codeNode, ctx);
items.length;   // 2 — one item per source line
losses;         // []
height;         // 34.8
```

Executed against the live package (2026-10-06): `items.length === 2`,
`losses === []`, `height === 34.8`.

### Probe — an empty fence renders nothing and records no loss

```js
const emptyCode = node('codeBlock', { info: '', text: '' });
const out = oconvPdfRenderCode.render(emptyCode, ctx);
out;   // { items: [], losses: [] }
```

Executed against the live package (2026-10-06): exactly `{ items: [],
losses: [] }` — a deliberate exception to the general "a delegated kind is
always drawable" rule (see Notes).

## Notes

- **Deliberate exception to the accounting invariant's general rule.** An
  EMPTY fence (`node.text` reduces to zero source lines after trimming the
  fenced-code convention's trailing `\n`) renders NOTHING and records NO
  loss — genuinely nothing to typeset and nothing lost. `stack.js`'s
  `isDrawable` treats an empty `items` array from a delegated kind as
  DRAWABLE by default (a renderer returning zero items with no loss is
  exactly the silent drop the accounting invariant exists to catch), so a
  document whose ONLY content is one empty fence would report it
  unaccounted. The return shape is intentional.
- **This module's OWN leading ratio (1.2×) is deliberately NOT
  `layout.leading()`'s** (1.32× by default) — computed independently so a
  future change to body-text leading does not silently retarget code
  blocks.
- `node.text` is split on `\n` into ONE flow line per SOURCE line — no
  word-breaking, no wrapping: the whole line is a single unbreakable
  token. A tab expands to 4 spaces before measuring/emitting. A single
  trailing `\n` is trimmed first (a 3-line fence yields exactly 3 items,
  not 4).
- A line wider than the column is emitted OVERFLOWING (never wrapped, never
  clipped) and records ONE `layout/line-overflow` loss — the SAME code
  `oconvPdfLinebreak.breakInlines` uses for a paragraph's unbreakable
  token, same detail shape (`tokens: 1`, a code line is always one
  unbreakable token).
- `node.info` (the fence's language tag) is read nowhere: the typesetter
  renders no syntax colouring.
- `CODE_SPACE_BEFORE`/`CODE_SPACE_AFTER` (6 pt each) are internal padding
  baked into this module's own `height` and its lines' `y` — distinct from
  `stack.js`'s own uniform delegated-kind `spaceAfter`, added ON TOP by the
  stack.
- Every item carries `index: ctx.index, kind: 'codeBlock'` — a flat leaf
  with no nested delegated content, so there is no finer index to
  preserve.
- Capture-free (`fw/no-factory-capture`), worker-safe.

## See also

- [`ir-to-pdf`](../../ir-to-pdf.md) — the dispatcher; a renderer never
  edits it.
- [`pdf/box`](../box.md) — `layout.sizeFor('code')`, the code type size.
- [`pdf-writer.md`](../../../../pdf-writer.md) — `layout/line-overflow` in the
  audience-facing loss-code table.
