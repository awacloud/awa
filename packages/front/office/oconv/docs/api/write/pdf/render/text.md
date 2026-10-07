---
module: oconvPdfRenderText
category: oconv/write/pdf/render
dependencies: [oconvPdfMetrics]
returns: object
worker-safe: true
status: complete
---

# oconvPdfRenderText

> Content-stream emission — one page of laid-out items in, one content stream out.

**Module** `oconvPdfRenderText` | **Source** `packages/front/office/oconv/src/write/pdf/render/text.js` | **Deps** `oconvPdfMetrics` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfRenderText = runtime.resolve('oconvPdfRenderText');
```

Composed internally by [`ir-to-pdf`](../../ir-to-pdf.md), once per page.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `pageContent` | `(page: Page, fonts: Object<string, FontEntry>, layout: object, losses: object[]) => {bytes: Uint8Array, usedFonts: Set<string>}` | the page's content stream + the resource names it referenced | `Error` `oconv: pdf font missing <style>` / `oconv: pdf font missing regular` |

`FontEntry`: `res` (PDF resource name, e.g. `/FR`), `source`
(`'standard14'` \| `'embedded'`), `embedded` (the `pdfFontEmbed` result, on
the embedded route), `hasGlyph(codePoint)` (optional, embedded route only),
`widthOf(text, sizePt)` (used only to centre the page number — every other
`x` is already placed).

## Examples

### Emit one page's content stream

```js
const metrics = runtime.resolve('oconvPdfMetrics');
const box = runtime.resolve('oconvPdfBox');
const measurer = metrics.createMeasurer();
const layout = box.resolveLayout();
const face = measurer.face('regular');
const fonts = {
    regular: { res: 'FR', source: 'standard14', baseFont: face.baseFont,
               widthOf: (t, s) => measurer.widthOf(t, 'regular', s) }
};
const page = {
    number: 1,
    items: [{
        x: 50, y: 700, style: 'regular', sizePt: 11,
        tokens: [{ kind: 'word', text: 'Hello', style: 'regular',
                   width: measurer.widthOf('Hello', 'regular', 11), link: null }],
        index: '0', kind: 'paragraph'
    }]
};
const losses = [];
const { bytes, usedFonts } = oconvPdfRenderText.pageContent(page, fonts, layout, losses);
usedFonts;   // Set(1) { 'FR' }
new TextDecoder().decode(bytes).split('\n')[0];   // 'BT /FR 11 Tf 1 0 0 1 50 700 Tm (Hello) Tj ET'
```

Executed against the live package (2026-10-06): `usedFonts` is
`Set(1) { 'FR' }`, and the emitted bytes decode to
`'BT /FR 11 Tf 1 0 0 1 50 700 Tm (Hello) Tj ET\n' + …` (the page-number
block, drawn second).

### Probe — an unrepresentable code point degrades to `?` and is recorded

```js
const cjkPage = { number: 1, items: [{ x: 50, y: 700, style: 'regular', sizePt: 11,
    tokens: [{ kind: 'word', text: '中', style: 'regular', width: 10, link: null }],
    index: '0', kind: 'paragraph' }] };
const sink = [];
oconvPdfRenderText.pageContent(cjkPage, fonts, layout, sink);
sink;   // [{ char: '中', codePoint: 20013, index: '0', kind: 'paragraph' }]
```

Executed against the live package (2026-10-06): `sink` is exactly
`[{ char: '中', codePoint: 20013, index: '0', kind: 'paragraph' }]` — the
'?' byte was still emitted into the content stream, and the occurrence was
recorded into the scratch sink at the same time.

## Notes

- **`losses` is a SCRATCH sink, not the document's loss ledger.** This
  function appends one raw record per unrepresentable-code-point
  OCCURRENCE; the caller ([`ir-to-pdf`](../../ir-to-pdf.md)) collapses the
  whole document's records into ONE `text/unencodable` loss carrying
  `{count, sample}`. Passing the ledger itself would put one loss per
  character in front of the caller.
- **The two encodings**: Standard 14 route — a PDF literal string of
  WinAnsi bytes with the three literal-string escapes (`(`, `)`, `\`); a
  code point WinAnsi cannot represent degrades to `?` and is recorded.
  Embedded route — `entry.embedded.encode(text)` rendered as a hex string,
  for BOTH embedded sub-routes (a `WinAnsiEncoding` hex string is merely
  more verbose than a literal string, never wrong; an `Identity-H` code is
  two bytes, which a literal string would have to escape as arbitrary
  binary). When `hasGlyph` is present, every code point of a segment is
  checked and a `false` result is recorded into the SAME sink — the
  emitted bytes are unchanged either way; the point is that a `.notdef`
  draw is no longer silent.
- **No silent empty draw**: `putSegment` throws
  `oconv: pdf font missing <style>` when neither the segment's own style
  nor `regular` resolves to a `fonts` entry (same for the page-number
  block, `oconv: pdf font missing regular`). The facade guarantees an
  entry for every drawable segment — a violated guarantee must be loud,
  never an empty page.
- **A whitespace-only segment is NOT skipped** — only a genuinely EMPTY
  segment is. This happens whenever two differently-styled words are
  separated by a space token of a third style; dropping it welds the two
  words together for every text extractor downstream (measured on the
  embedded-route oracle before this was fixed).
- Every style segment carries its OWN explicit text matrix (`Tm`) — glyph
  origins in the file are exactly what the linebreaker and stacker
  computed, nothing left to an implicit advance.
- v1 draws NO link annotation: `stack.js` carries a line's uniform
  `link` target for a later version; nothing is emitted here.
- Worker-safe, capture-free (`fw/no-factory-capture`).

## See also

- [`ir-to-pdf`](../../ir-to-pdf.md) — the sole caller, one call per page;
  collapses the scratch sink into `text/unencodable`.
- [`pdf/metrics`](../metrics.md) — supplies `winAnsiByte`, the SAME table
  the widths were measured with.
- [`pdf/stack`](../stack.md) — places every item this module encodes.
- [`pdf-writer.md`](../../../../pdf-writer.md) — `text/unencodable` and the
  no-silent-empty-draw guard in the audience-facing reference.
