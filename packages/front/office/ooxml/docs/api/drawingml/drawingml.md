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
| `parseTextBody` / `renderTextBody` | `(el, opts?)` / `(tb, rootTag?)` | Full round-trip. |
| `parseRunProperties` / `renderRunProperties` | `(el, opts?)` / `(rPr)` on `<a:rPr>` | Run formatting. |
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
                   baseline?, color?: 'RRGGBB' | TypedColor, font?, _extras? }

TypedColor := { rgb: 'RRGGBB' } | { schemeColor: string },  // + mods?: [{ name, val? }]
```

Every `parse*` function takes an optional last argument `opts`, passed down to
the run properties; `pptx.read` and `xlsx.read` forward their own
`typedRunColors` option through it.

- **Default** (`typedRunColors` absent or `false`, the 1.0.0 model): a run
  fill (`a:solidFill`) holding an `a:srgbClr` reads as its `'RRGGBB'` string
  (colour transforms dropped); any other fill — a theme colour, `a:sysClr`,
  … — stays verbatim in `_extras`.
- **`typedRunColors: true`**: `color` is the `'RRGGBB'` string for a bare
  `a:srgbClr`, else `{ rgb | schemeColor, mods? }` — a theme colour such as
  `tx1` with `lumMod 75000` / `lumOff 25000` (Office's default dark-grey
  text) becomes `{ schemeColor: 'tx1', mods: [{ name: 'lumMod', val: 75000 },
  { name: 'lumOff', val: 25000 }] }`. Other colour kinds (`a:sysClr`,
  `a:prstClr`, …) and transforms that do not fit `{ name, val? }` stay
  verbatim in `_extras`.

`renderRunProperties` accepts both forms and writes a typed `color` back in
schema order (before `a:latin`).

```js
const a = runtime.resolve('drawingml');
const xml = runtime.resolve('xml');
const rPrEl = xml.parse('<a:rPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + '<a:solidFill><a:schemeClr val="tx1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr>');
a.parseRunProperties(rPrEl).color;                            // → undefined (fill in _extras)
a.parseRunProperties(rPrEl, { typedRunColors: true }).color;
// → { schemeColor: 'tx1', mods: [{ name: 'lumMod', val: 75000 }] }
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
- The written `<a:pPr>` and `<a:rPr>` / `<a:defRPr>` put the typed children and the `_extras` together in schema order (`CT_TextParagraphProperties`: `lnSpc`, `spcBef`, `spcAft`, bullet colour, size, font, the bullet, `tabLst`, `defRPr`, `extLst`; `CT_TextCharacterProperties`: `ln`, the fill, the effects, `highlight`, underline line and fill, `latin`, `ea`, `cs`, `sym`, `hlinkClick`, `hlinkMouseOver`, `rtl`, `extLst`), whatever their order in the model; an element the schema does not list follows in the order given, and an `mc:AlternateContent` takes the place of what it holds.

## See also

- [drawingml-shape](./shape.md) — typed `spPr` (fill/line/geometry).
- [drawingml-chart](./chart.md) — typed `c:chartSpace`.
- [pptx-slide](../pptx/slide.md) — the main consumer of text bodies.
