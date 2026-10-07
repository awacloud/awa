---
module: docxProperties
category: ooxml/docx
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# docxProperties

> WordprocessingML run/paragraph/table properties — a bag of typed fields (`<w:rPr>` / `<w:pPr>` / `<w:tblPr>`).

**Module** `docxProperties` | **Source** `packages/front/office/ooxml/src/docx/properties.js` | **Deps** `xml` | **Worker-safe** yes

Maps the most common children of `<w:rPr>` (§17.3.2), `<w:pPr>` (§17.3.1) and `<w:tblPr>` (§17.4.59) onto a flat object. Children that are not modelled are preserved in `_extras` and re-emitted on write. Toggle elements (`<w:b/>`, `<w:i/>`, `<w:strike/>`) follow the ECMA semantics: present without `w:val` = on, `w:val="0"|"false"|"off"` = off.

## Resolve

```js
const props = runtime.resolve('docxProperties');
// Returns: { parseRunProperties, renderRunProperties,
//            parseParagraphProperties, renderParagraphProperties,
//            parseTableProperties, renderTableProperties,
//            readToggle, writeToggle, valOf, elVal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseRunProperties` | `(rPrEl) => RunProperties \| undefined` | Typed bag. |
| `renderRunProperties` | `(rPr) => element \| null` | `<w:rPr>`, or `null` when empty. |
| `parseParagraphProperties` | `(pPrEl) => ParagraphProperties \| undefined` | Typed bag. |
| `renderParagraphProperties` | `(pPr) => element \| null` | `<w:pPr>`, or `null`. |
| `parseTableProperties` | `(tblPrEl) => TableProperties \| undefined` | Typed bag; `undefined` when the element has no element children. |
| `renderTableProperties` | `(tblPr) => element \| null` | `<w:tblPr>` (children: `tblStyle`, `tblW`, `tblBorders`, the `_extras` that precede `tblCellMar` in the schema, `tblCellMar`, then the `_extras` that follow it), or `null` when nothing would render. |
| `readToggle` / `writeToggle` | boolean helpers | For element toggles. |
| `valOf` / `elVal` | `w:val` helpers | Read / write the `w:val` attribute. |

## Model

```js
RunProperties := {
    bold?, italic?, strike?,           // boolean
    underline?: 'single'|'double'|…,
    color?: 'RRGGBB',                  // hex without '#'
    size?: number,                     // half-points (24 = 12pt)
    font?: string,
    vertAlign?: 'superscript'|'subscript'|'baseline',
    highlight?: string,
    rStyle?: string,                   // styleId
    _extras?: [xmlNode]
}

ParagraphProperties := {
    align?: 'left'|'center'|'right'|'both'|'distribute',
    indent?: { left?, right?, firstLine?, hanging? },   // twips
    spacing?: { before?, after?, line?, lineRule? },
    pStyle?: string,                  // styleId
    numPr?: { ilvl, numId },
    rPr?: RunProperties,
    _extras?: [xmlNode]
}

TableProperties := {                  // <w:tblPr>  (§17.4.59)
    style?: string,                   // <w:tblStyle w:val>  (styleId)
    width?: { w: number|string,       // <w:tblW w:w w:type>; number when numeric
              type: 'auto'|'dxa'|'pct'|'nil' },   // default 'auto'
    borders?: TableBorders,           // <w:tblBorders>
    cellMargins?: TableCellMargins,   // <w:tblCellMar>  (§17.4.42)
    _extras?: [xmlNode]               // every other child, verbatim, source order
}

TableCellMargins := {                 // edges render in schema order
    top?: Width, start?: Width, left?: Width,
    bottom?: Width, end?: Width, right?: Width,
    _extras?: [xmlNode]               // any other child of <w:tblCellMar>
}

Width := { w: number|string,          // <w:top w:w w:type>; number when numeric
           type: 'auto'|'dxa'|'pct'|'nil' }   // default 'auto'

TableBorders := {                     // edges render in schema order
    top?: Border, left?: Border, bottom?: Border,
    right?: Border, insideH?: Border, insideV?: Border,
    _extras?: [xmlNode]               // any other child of <w:tblBorders>
}

Border := { val: string, sz?: number, space?: number, color?: string,
            extraAttrs?: { [attrName: string]: string } }
                                      // <w:top w:val w:sz w:space w:color ...>  (§17.3.4)
                                      // extraAttrs: every other attribute (w:themeColor,
                                      // w:themeTint, w:themeShade, w:shadow, w:frame, ...),
                                      // full names, source order; key omitted when empty
```

## Examples

### Bold red 14pt run

```js
const props = runtime.resolve('docxProperties');
const rPrEl = props.renderRunProperties({
    bold: true, color: 'CC0000', size: 28
});
// → <w:rPr><w:b/><w:color w:val="CC0000"/><w:sz w:val="28"/></w:rPr>
```

### Centred paragraph with indentation

```js
props.renderParagraphProperties({
    align: 'center',
    indent: { left: 720, firstLine: 360 },
    pStyle: 'Heading1'
});
```

### A bordered table

```js
props.renderTableProperties({
    style: 'TableGrid',
    borders: { top: { val: 'single', sz: 4, space: 0, color: 'auto' },
               insideH: { val: 'single', sz: 4, space: 0, color: 'auto' } }
});
// → <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblBorders>
//     <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
//     <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
//   </w:tblBorders></w:tblPr>
```

### Default cell margins

```js
props.renderTableProperties({
    style: 'TableGrid',
    cellMargins: { left: { w: 108, type: 'dxa' }, right: { w: 108, type: 'dxa' } }
});
// → <w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblCellMar>
//     <w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>
//   </w:tblCellMar></w:tblPr>
```

## Coverage

- **Typed**: bold/italic/strike/underline/color/size/font/vertAlign/highlight/rStyle (run); align/indent/spacing/pStyle/numPr/rPr (paragraph).
- **Typed (table)**: `tblStyle` (`style`), `tblW` (`width`), `tblBorders` (`borders`, six edges), `tblCellMar` (`cellMargins`, six edges: `top`, `start`, `left`, `bottom`, `end`, `right`). `w:tblGrid`, `w:trPr`, `w:tcBorders`, `w:tblLook` and `w:tblStylePr` are not modelled; they stay verbatim in `_extras` (`tblLook` in `tblPr._extras`).
- **`_extras`**: everything else (kern, `w:lang`, `w:shd`, `w:tabs`, `w:keepNext`, …) — modelled by the `wmlRunFormatting` / `wmlParagraphFormatting` extras.

## Notes

- `size` is in **half-points** (the ECMA convention): 12pt = `size: 24`.
- `color` is hex without `#`. The special value `'auto'` is allowed.
- `align: 'both'` means justified (OOXML terminology).
- `Border.extraAttrs` carries every attribute the four modelled fields do not (`w:themeColor`, `w:themeTint`, `w:themeShade`, `w:shadow`, `w:frame`, and anything else) verbatim, in source order, and re-emits them after `w:color`, so every border attribute is re-emitted on write. An `extraAttrs` key naming `w:val` / `w:sz` / `w:space` / `w:color` is ignored on render; the four fields win.
- A `Border` only renders the attributes it carries: `{ val: 'nil' }` emits `<w:top w:val="nil"/>` and never an `undefined` attribute. `sz` is in eighths of a point.
- `renderTableProperties` follows the file's `_extras`-last convention: `tblBorders._extras` close the borders element and `cellMargins._extras` close the margins element. `tblPr._extras` follow the typed children, split at `tblCellMar`: `tblLook`, `tblCaption`, `tblDescription` and `tblPrChange` render after it, every other extra before it. A schema-ordered `<w:tblPr>` (for example `tblLayout` then `tblCellMar` then `tblLook`) therefore keeps its order through a parse/render round trip.
- `cellMargins` is a default for every cell of the table (or of every table using the style, when set on a table style); `w` is in twentieths of a point with `type: 'dxa'`. Word's built-in `Table Grid` style uses `left`/`right` 108 dxa (0.19 cm).
- Toggles: `bold: true` emits `<w:b/>` (no `w:val`); `bold: false` emits `<w:b w:val="0"/>` (an explicit override of an inherited style).

## See also

- [docx-structure](./structure.md) — applies these props to runs/paragraphs.
- [docx-styles](./styles.md) — reuses them for `docDefaults` and styles.
- [docx-numbering](./numbering.md) — reuses them for `<w:lvl>` rPr/pPr.
