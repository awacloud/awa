---
module: oconvIrToPdf
category: oconv/write
dependencies: [oconvIr, oconvPdfMetrics, oconvPdfBox, oconvPdfLinebreak, oconvPdfStack, oconvPdfRenderText, oconvPdfRenderList, oconvPdfRenderCode, oconvPdfRenderTable, oconvPdfRenderImage, pdfBuilder, pdfFontEmbed, fonts, oconvDefaultFaces]
returns: object
worker-safe: true
status: complete
---

# oconvIrToPdf

> `oconv-ir/v1` → `.pdf` bytes — the bounded typesetter's writer facade.

**Module** `oconvIrToPdf` | **Source** `packages/front/office/oconv/src/write/ir-to-pdf.js` | **Deps** `oconvIr`, `oconvPdfMetrics`, `oconvPdfBox`, `oconvPdfLinebreak`, `oconvPdfStack`, `oconvPdfRenderText`, `oconvPdfRenderList`, `oconvPdfRenderCode`, `oconvPdfRenderTable`, `oconvPdfRenderImage`, `pdfBuilder`, `pdfFontEmbed`, `fonts`, `oconvDefaultFaces` | **Worker-safe** yes

This is the only module in the family that talks to `@awacloud/pdf`. It owns
the whole `md → pdf` write pipeline: option validation
(`oconvPdfBox.resolveLayout`), font-route resolution
(`oconvPdfMetrics.createMeasurer`), flow + page stacking
(`oconvPdfStack.layoutDocument`), the renderer dispatch for
`list`/`codeBlock`/`table`/`image`, content-stream emission
(`oconvPdfRenderText.pageContent`) and final assembly through `pdfBuilder`.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIrToPdf = runtime.resolve('oconvIrToPdf');
```

Reached in practice through `oconv.fromMd({ markdown, target: 'pdf' })` or
`oconv.convert({ ..., target: 'pdf' })` (`../oconv.md`) — see
[`pdf-writer.md`](../../pdf-writer.md) for the full options/route/loss-code
reference from that public entry point.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `RESOURCE_NAMES` | `{regular: 'FR', bold: 'FB', italic: 'FI', boldItalic: 'FZ', code: 'FM'}` | style class → PDF resource name | — |
| `irToPdf` | `(ir: object, pdfOpts?: object, writeOpts?: {assets?: Object<string, Uint8Array>, defaultFaces?: Object<string, Uint8Array>|null}) => IrToPdfResult` | `{bytes: Uint8Array, losses: IrToPdfLoss[], pages: number}` | see below |

Throws: `oconv: bad pdf option <key>` (an unrecognised `pdfOpts` key, via
`oconvPdfBox.resolveLayout`); `oconv: bad pdf font <style>` /
`oconv: bad default font <style>` (unreadable font bytes or an unknown
`pdfOpts.fonts`/`writeOpts.defaultFaces` key, via
`oconvPdfMetrics.createMeasurer`); `oconv: invalid ir (<code> at <path>)`
when `ir` fails `oconvIr.validate`.

`pages` is the number of pages the document actually laid out onto — the
caller-facing return that lets an integrator know the page count without
re-parsing the produced bytes.

### `pdfOpts` (the `opts.pdf` block)

Validated in exactly ONE place, `oconvPdfBox.resolveLayout`:

| Key | Type | Default | Validation error |
|---|---|---|---|
| `pageSize` | `'A4'` \| `'Letter'` \| `[width, height]` (pt, both > 0) | `'A4'` (595.276 × 841.89 pt) | `oconv: bad pdf option pageSize` |
| `margin` | `number` ≥ 0, `2·margin` < the smaller page dimension | `56.693` pt (20 mm) | `oconv: bad pdf option margin` |
| `baseSize` | `number` > 0 | `11` pt | `oconv: bad pdf option baseSize` |
| `leadingRatio` | `number` > 0 | `1.32` | `oconv: bad pdf option leadingRatio` |
| `headingScale` | `number[6]`, all > 0 (levels 1-6, absolute pt) | `[22, 18, 15, 13, 12, 11]` | `oconv: bad pdf option headingScale` |
| `codeSize` | `number` > 0 | `9.5` pt | `oconv: bad pdf option codeSize` |
| `pageNumbers` | `boolean` | `true` | `oconv: bad pdf option pageNumbers` |
| `fonts` | `{regular?, bold?, italic?, boldItalic?, mono?: Uint8Array}` | `{}` (pure Standard 14) | accepted-and-forwarded here; failures surface from `oconvPdfMetrics` |

Any other key throws `oconv: bad pdf option <key>`; a non-object,
non-`undefined`, non-`null` `pdfOpts` throws `oconv: bad pdf option pdf`.

### The font routes, resolved per style class

```
explicit pdfOpts.fonts[class] > registered/posted oconvDefaultFaces[class] > Standard 14
```

- **Standard 14 (default)** — one
  `addFont({ name, baseFont, subtype: 'Type1', encoding: 'WinAnsiEncoding' })`
  per style class the document uses (`Helvetica`/`Helvetica-Bold`/
  `Helvetica-Oblique`/`Helvetica-BoldOblique`/`Courier`); no font program is
  embedded, vendored or downloaded. WinAnsi (CP1252) literal-string
  encoding, declared on every font dict as `/Encoding /WinAnsiEncoding`.
- **Embedded (explicit `pdfOpts.fonts` or a default face)** — the resolved
  face is parsed by `@awacloud/fonts`, subset to the exact code points the
  laid-out document uses, and embedded via `pdfFontEmbed.embedSimple`
  (every code point WinAnsi-representable) or `embedCid` otherwise
  (`Identity-H` hex strings). `pdfBuilder` caches an embed result by
  identity so N pages sharing a style share ONE font object.
- **The default-face tier** is reached ONLY by the module NAME
  `oconvDefaultFaces` — this facade never imports a face pack. `main.js`
  registers a stand-in at version `0.0.0` whose `defaultFaces()` returns
  `null`; a real pack (e.g. `@awacloud/oconv-fonts`, version `1.0.0`)
  displaces it in either registration order. See
  [`pdf/default-faces`](./pdf/default-faces.md) for the full stand-in
  contract and [`pdf-writer.md`](../../pdf-writer.md) for the host
  registration recipe.

A style class resolved from Standard 14 while at least one other class is
embedded (explicit or default) records `layout/font-fallback`; on the pure
Standard 14 route (no `pdfOpts.fonts`, no registered/posted default map at
all) nothing is recorded — it is the chosen route, not a fallback.

### Images

`writeOpts.assets` carries `{ '<markdown image destination>': Uint8Array }`
down to `oconvPdfRenderImage`. Placement scope: **JPEG only**
(baseline/extended/progressive, 1 or 3 components) — placed with
`/DCTDecode`, drawn `q w 0 0 h x y cm /Im<n> Do Q`, no loss. Every other
case is refused with the italic `[image: <alt>]` placeholder still drawn
and one `layout/image-dropped` loss: PNG (colour type 0 or 2) →
`reason: 'unsupported-encoding'`, `format: 'png'`; PNG palette/alpha, CMYK
JPEG, any other format, malformed bytes → `reason: 'unsupported-encoding'`
(no `format`); nothing resolved at all → `reason: 'no-bytes'`,
`bytes: 0`. See [`pdf-writer.md`](../../pdf-writer.md#images) for the full
placement-geometry and format-boundary explanation (why PNG specifically is
refused rather than guessed at).

## Examples

### Standard 14 (default) — no options

```js
// Build the IR with the oconvIr helpers: `irToPdf` validates its input, and
// a bare `{ kind: 'run', text }` literal fails with `bad-prop`.
const { node, doc } = runtime.resolve('oconvIr');
const ir = doc([
    node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
    node('paragraph', {}, [node('run', { text: 'Hello world' })])
]);
const { bytes, losses, pages } = oconvIrToPdf.irToPdf(ir, { pageNumbers: false });
// bytes — a non-empty .pdf Uint8Array; losses deep-equals []; pages === 1
```

Executed against the live package (2026-10-03): `bytes instanceof
Uint8Array`, `pages === 1`, `losses` is `[]`.

## Notes

- **Determinism**: `irToPdf` injects NO date and NO document `/ID` — only
  `addMetadata({Producer, Creator})`, never `setId`. `@awacloud/pdf`'s plain
  write path reads no clock and no randomness; this holds only on that
  path — `document/encryptedWriter.js` uses `Math.random()` for its file
  key, and `md → pdf` never enters it.
- **Every drawn segment has a font entry** — `collectCodePoints` keys any
  style outside `oconvPdfMetrics.STYLE_CLASSES` as `regular`, so
  `fonts[style] || fonts.regular` is always defined for every segment a
  renderer actually draws; `oconv: pdf font missing <style>` is a
  violated-invariant guard, unreachable through the shipped renderers and
  valid IR.
- **`text/unencodable` is route-conditional but always ONE record per
  document**: on the Standard 14/WinAnsi route it counts code points
  outside WinAnsi (drawn as `?`); on an embedded/default-face route it
  counts code points with no glyph in the resolved face's own `cmap`
  (`hasGlyph`, drawn as `.notdef`) — previously silent on that route, now
  always recorded.
- **CP1252 text decodes through the declared encoding**: on the Standard 14
  route the text bytes are CP1252 and each font dict names
  `/Encoding /WinAnsiEncoding`, so bytes 0x80–0xFF read back as the
  characters drawn (`Café`, `déjà`, the em dash, the `•`/`–` list markers)
  rather than as the font's built-in StandardEncoding glyphs.
- **Two inline styles are recorded, not drawn**: a struck run
  (`inline/strike-dropped`) and a monospace run that is also bold or italic
  (`inline/code-emphasis-dropped`) — one record per text block, from
  [`pdf/linebreak`](./pdf/linebreak.md), carrying the block's
  `{index, kind}`. The drawn bytes are those of the unflagged run.
- Full loss-code table, error catalogue, worker-boundary behaviour
  (`opts.pdf` crosses, the `oconvDefaultFaces` descriptor never does) and
  the measured `keepTogether` gap are on
  [`pdf-writer.md`](../../pdf-writer.md) — not restated here to avoid two
  copies drifting apart.
- See the [loss matrix](../../loss-matrix.md) for the published
  Preserved/Degraded/Dropped classification.

## See also

- [`pdf-writer.md`](../../pdf-writer.md) — the full options/route/loss-code
  reference for this writer, audience-facing.
- [`pdf/metrics`](./pdf/metrics.md), [`pdf/box`](./pdf/box.md),
  [`pdf/linebreak`](./pdf/linebreak.md), [`pdf/stack`](./pdf/stack.md) —
  the pipeline stages this facade composes.
- [`pdf/render/list`](./pdf/render/list.md),
  [`pdf/render/code`](./pdf/render/code.md),
  [`pdf/render/table`](./pdf/render/table.md),
  [`pdf/render/image`](./pdf/render/image.md) — the renderers.
- [`pdf/default-faces`](./pdf/default-faces.md) — the `oconvDefaultFaces`
  stand-in contract.
- [Loss matrix](../../loss-matrix.md) — published fidelity classification.
