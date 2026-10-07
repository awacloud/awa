---
module: oconvPdfRenderImage
category: oconv/write/pdf/render
dependencies: [oconvPdfLinebreak]
returns: object
worker-safe: true
status: complete
---

# oconvPdfRenderImage

> The `image` renderer — places JPEG, refuses honestly otherwise.

**Module** `oconvPdfRenderImage` | **Source** `packages/front/office/oconv/src/write/pdf/render/image.js` | **Deps** `oconvPdfLinebreak` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfRenderImage = runtime.resolve('oconvPdfRenderImage');
```

Composed internally by [`ir-to-pdf`](../../ir-to-pdf.md)'s `render`
dispatcher, never called directly by a consumer. Placement additionally
needs `ctx.builder` (a builder-shaped image sink) and `ctx.imageCounter` —
both supplied only by the real facade.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `render` | `(node: object, ctx: object) => {items: object[], losses: object[], height: number}` | block-local laid-out items (the renderer contract) | `Error` `oconv: pdf image renderer needs ctx.builder` — only on the placement path, when the facade supplied no image sink/counter |

`node` is an `oconv-ir/v1` `image` node (`{name, alt}`, optionally carrying
`escapes.docx.bytes`). `ctx` additionally reads `ctx.assets` (the caller's
image-bytes map).

## Examples

The session below hands the renderer the child context the stack gives it:
the members `ir-to-pdf` assembles (`measurer`, `layout`, `column`,
`sizeFor`, `leading`, `linebreak`, `losses`, `render`, `assets`, `builder`,
`imageCounter`) plus the per-block `index`, `indent` and `kind` the stack
stamps on top, and the `flowChildren` re-entry helper the facade binds to
each renderer (the placeholder line is flowed through it). `childContext`
rebuilds that helper the way the facade does: it re-enters the stack's
`flowBlocks`, honouring the `styleOverride` the placeholder path uses. The
IR is built with `oconvIr.node`, so it passes `oconvIr.validate`.

### No bytes resolved — the refusal path

```js
const { node, validate } = runtime.resolve('oconvIr');
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const linebreak = runtime.resolve('oconvPdfLinebreak');
const stack = runtime.resolve('oconvPdfStack');
const measurer = metrics.createMeasurer();
const layout = box.resolveLayout();

function childContext(block, index, assets) {
    const base = {
        measurer, layout, column: layout.column, sizeFor: layout.sizeFor,
        leading: layout.leading, linebreak, losses: [],
        render: (b) => ({ items: [], losses: [{ code: 'layout/unhandled-block', detail: { kind: b.kind } }] }),
        assets,
        builder: { addImage() { return this; } },   // the facade's image sink
        imageCounter: { n: 0 },
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

const imgNode = node('image', { name: 'missing.png', alt: 'Missing' });
validate(imgNode).ok;   // true
const { items, losses, height } = oconvPdfRenderImage.render(imgNode, childContext(imgNode, '0', {}));
items.length;    // 1 — the italic "[image: Missing]" placeholder line
losses;
// [{ code: 'layout/image-dropped',
//    detail: { index: '0', name: 'missing.png', alt: 'Missing', reason: 'no-bytes', bytes: 0 } }]
height;          // 20.520000000000003 (20.52 to two decimals)
```

Executed against the live package (2026-10-06): `validate(imgNode).ok ===
true`, `items.length === 1`, `losses` is exactly the one
`layout/image-dropped` record shown, `height` is 20.520000000000003 (20.52
to two decimals).

## Notes

- **Placement scope is JPEG only, a measured boundary, not an omission.**
  `pdfBuilder.addImage` decodes nothing — bytes go into the XObject stream
  verbatim behind the `/Filter` the caller names. JPEG entropy-coded data
  **is** a PDF image stream (`/DCTDecode`), so it embeds directly. A PNG's
  `IDAT` is a zlib stream of *filtered scanlines*, which is NOT a
  `/FlateDecode` image stream — embedding the file bytes would render
  garbage; doing it properly needs a zlib-to-Flate re-wrap plus an
  `/SMask` for alpha and an `/Indexed` palette for colour type 3, none of
  which the writer implements. PNG is REFUSED with an honest loss rather than
  guessed at.
- **Three-way outcome**: JPEG bytes resolve → PLACED (`ctx.builder.
  addImage(...)`, a `q … cm /Im<n> Do Q` item, NO loss). Nothing resolved →
  italic `[image: …]` placeholder + `layout/image-dropped`,
  `reason: 'no-bytes'`. Bytes resolve but the encoding is not placeable →
  same placeholder + `layout/image-dropped`, `reason: 'unsupported-
  encoding'` (plus `format` when the header reader could name the
  container, e.g. `'png'`).
- **The `ctx.builder` seam exists because `pdfBuilder.addImage` needs a
  CURRENT PAGE**, and builder pages are created only AFTER stacking — a
  renderer runs during layout, before anyone knows which page its block
  lands on. The facade puts a builder-SHAPED sink on `ctx.builder` that
  queues the spec by resource name; the emission loop later replays each
  spec onto the real builder on the page whose items reference it. The
  error `oconv: pdf image renderer needs ctx.builder` is unreachable on
  every refusal path — a caller that never supplies `assets` never meets
  it.
- **Placement geometry**: one image pixel = one PostScript point at
  natural size. The box is scaled DOWN to the block's column width when
  wider, preserving aspect ratio, never scaled up. Vertical fit is NOT
  re-decided here — an image taller than the page is handed to the
  stacker exactly like any other oversized block (clean page, then
  `layout/block-clipped` from `stack.js`).
- **`assetBytes` and `readImageHeader` are MIRRORS, not imports**, of the
  identical helpers in `../../ir-to-docx.js`/`../../ir-to-odt.js` (asset
  resolution) and `../../image-header.js` (header parsing) — an fw factory
  may not capture a module-scope binding
  (`fw/no-factory-capture`), so each copy is pinned byte-identical to its
  sibling by a dedicated drift test rather than shared by import.
- The resolution rule for image bytes is the SAME as the other two
  writers: caller `assets[name]` first, then the docx reader's carried
  `escapes.docx.bytes`, else nothing.
- Capture-free (`fw/no-factory-capture`), worker-safe.

## See also

- [`ir-to-pdf`](../../ir-to-pdf.md) — the dispatcher, and the sole owner
  of `ctx.builder`/`ctx.imageCounter`/the real emission-replay loop.
- [`ir-to-docx`](../../ir-to-docx.md), [`ir-to-odt`](../../ir-to-odt.md) —
  the sibling writers whose `assetBytes` this module mirrors.
- [`pdf-writer.md`](../../../../pdf-writer.md) § "Images" — the full
  placement-format boundary table and the `addImage` seam contract.
- [`pdf-writer.md`](../../../../pdf-writer.md) — `layout/image-dropped` in
  the audience-facing loss-code table.
