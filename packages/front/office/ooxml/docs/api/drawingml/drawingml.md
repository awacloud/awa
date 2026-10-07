---
module: drawingml
category: ooxml/drawingml
dependencies: [xml, ooxmlMath, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# drawingml

> Shared DrawingML (ECMA-376 part 1 §20) — typed text bodies + EMU helpers.

**Module** `drawingml` | **Source** `packages/front/office/ooxml/src/drawingml/drawingml.js` | **Deps** `xml`, `ooxmlMath`, `ooxmlShared` | **Worker-safe** yes

The `<a:…>` namespace is cross-format: pptx slides, charts, and inline docx/xlsx shapes. This module exposes a typed model for `<a:txBody>` (paragraphs, runs, breaks, fields) and the EMU unit conversions. `<a:bodyPr>` and `<a:lstStyle>` are preserved verbatim.

## Resolve

```js
const a = runtime.resolve('drawingml');
// Returns: { A_NS, EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT,
//            inchesToEmu, cmToEmu, ptToEmu,
//            srgbClr, textParagraph, textBodyFromString,
//            parseRunProperties, renderRunProperties,
//            parseParagraphProperties, renderParagraphProperties,
//            parseRun, renderRun,
//            parseBreak, renderBreak,
//            parseField, renderField,
//            parseParagraph, renderParagraph,
//            parseTextBody, renderTextBody }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `inchesToEmu` / `cmToEmu` / `ptToEmu` | `(n: number) => number` | Conversion to EMU. |
| `srgbClr` | `(rgb: 'RRGGBB') => element` | `<a:solidFill><a:srgbClr/>` snippet. |
| `textParagraph` | `(text: string) => element` | Single-run `<a:p>`. |
| `textBodyFromString` | `(text: string) => txBody` | Typed single-paragraph model. |
| `parseTextBody` / `renderTextBody` | symmetric | Full round-trip. |
| `parseRunProperties` / `renderRunProperties` | on `<a:rPr>` | Run formatting. |
| `parseParagraphProperties` / `renderParagraphProperties` | on `<a:pPr>` | level, align, indent, marL, bullet. |
| `parseRun` / `renderRun` | `<a:r>` | Typed text run. |
| `parseBreak` / `renderBreak` | `<a:br>` | Line break. |
| `parseField` / `renderField` | `<a:fld>` | Field (page number, slide number, …). |
| `parseParagraph` / `renderParagraph` | `<a:p>` | Full paragraph. |
| `EMU_PER_INCH` (914400), `EMU_PER_CM`, `EMU_PER_PT`, `A_NS` | constants | Units and namespace. |

## Text body model

```js
{
    bodyPr?: xmlNode,    // verbatim
    lstStyle?: xmlNode,  // verbatim
    paragraphs: [{
        pPr?: { level?, align?, indent?, marL?, bullet?, _extras? },
        runs: [textRun | breakRun | fieldRun]
    }]
}

textRun  := { type:'text', value: string, rPr? }
breakRun := { type:'break', rPr? }
fieldRun := { type:'field', id, fieldType?, value?, rPr? }

RunProperties := { lang?, size?, bold?, italic?, underline?, strike?,
                   baseline?, color?: 'RRGGBB', font?, _extras? }
```

## Examples

### Single-line text body

```js
const a = runtime.resolve('drawingml');
const tb = a.textBodyFromString('Hello slide');
a.renderTextBody(tb);
// → <a:txBody>…</a:txBody>, to be inserted into a <p:sp>.
```

### Hand-built formatted runs

```js
const para = {
    pPr: { align: 'ctr' },
    runs: [
        { type: 'text', value: 'Bold ', rPr: { bold: true } },
        { type: 'text', value: 'red',   rPr: { color: 'CC0000' } }
    ]
};
```

### EMU conversion

```js
a.inchesToEmu(2);  // 1828800
a.ptToEmu(12);     // 152400
```

## Notes

- 1 EMU = 1/914400 inch = 1/360000 cm.
- `bullet: 'none'` disables the bullet; `{char:'•'}` forces a character; `{autoNumType:'arabicPeriod'}` numbers the paragraph.
- `align` values: `'l' | 'ctr' | 'r' | 'just' | 'dist'`.
- Unknown elements (fills, effects) stay in the paragraph's or run's `_extras`.

## See also

- [drawingml-shape](./shape.md) — typed `spPr` (fill/line/geometry).
- [drawingml-chart](./chart.md) — typed `c:chartSpace`.
- [pptx-slide](../pptx/slide.md) — the main consumer of text bodies.
