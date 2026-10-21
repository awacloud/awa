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
| `renderTableProperties` | `(tblPr) => element \| null` | `<w:tblPr>` (the typed children and the `_extras` in `CT_TblPr` order), or `null` when nothing would render. `renderRunProperties` and `renderParagraphProperties` order theirs by `CT_RPr` / `CT_PPr` the same way. |
| `readToggle` / `writeToggle` | boolean helpers | For element toggles. |
| `valOf` / `elVal` | `w:val` helpers | Read / write the `w:val` attribute. |
| `sequence(names)` | `(names: Array<string\|string[]>) => seq` | Indexes an `xsd:sequence` of child names for `orderBySequence`; an entry that is an array names elements sharing one place (a choice inside the sequence). |
| `orderBySequence(children, seq)` | `(XmlNode[], seq) => XmlNode[]` | A new array of `children` sorted by their place in `seq`, stably. An `mc:AlternateContent` takes the place of the element its `mc:Fallback` (else its first `mc:Choice`) holds; a name `seq` does not list goes before the sequence's trailing `…Change` entry when it has one, else last. The same code as `ooxmlShared`'s (this module has no `ooxmlShared` dependency); `docxStructure` uses it to put the elements a read preserved in `_extras` back among the typed ones. |

## Model

```js
RunProperties := {
    bold?, italic?, strike?,           // boolean
    underline?: 'single'|'double'|…,
    color?: 'RRGGBB',                  // hex without '#'
    size?: number,                     // half-points (24 = 12pt)
    font?: string,                     // <w:rFonts>: ascii, else hAnsi, else cs
    fonts?: { hint?, ascii?, hAnsi?, eastAsia?, cs?,
              asciiTheme?, hAnsiTheme?, eastAsiaTheme?, cstheme? },
                                       // every <w:rFonts> attribute, as read
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

- **Typed**: bold/italic/strike/underline/color/size/font/fonts/vertAlign/highlight/rStyle (run); align/indent/spacing/pStyle/numPr/rPr (paragraph).
- **Run fonts**: `font` is one name (`w:ascii`, else `w:hAnsi`, else `w:cs`); a model without `fonts` writes it to the three as `<w:rFonts w:ascii w:hAnsi w:cs>`. A read also gives `fonts`, every attribute of `<w:rFonts>` by its local name (a `<w:rFonts>` holding only `w:hint` gives `fonts` and no `font`), and the writer writes `fonts` back as it is while `font` still equals the name it derives. A changed `font` is written to `ascii`, `hAnsi` and `cs`, and their theme attributes (`asciiTheme`, `hAnsiTheme`, `cstheme`) are left out — Word would otherwise apply the theme font over the edit; a removed `font` removes those six. `eastAsia`, `eastAsiaTheme` and `hint` are always kept; with no attribute left, no `<w:rFonts>` is written.
- **Typed (table)**: `tblStyle` (`style`), `tblW` (`width`), `tblBorders` (`borders`, six edges), `tblCellMar` (`cellMargins`, six edges: `top`, `start`, `left`, `bottom`, `end`, `right`). `w:tblGrid`, `w:trPr`, `w:tcBorders`, `w:tblLook` and `w:tblStylePr` are not modelled; they stay verbatim in `_extras` (`tblLook` in `tblPr._extras`); a table written with no grid gets one derived from its rows (see [structure](./structure.md)).
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
