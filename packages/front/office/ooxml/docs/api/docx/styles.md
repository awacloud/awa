---
module: docxStyles
category: ooxml/docx
dependencies: [ooxmlErrors, xml, docxProperties, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxStyles

> `word/styles.xml` part — `docDefaults` + paragraph/character/table/numbering styles (§17.7).

**Module** `docxStyles` | **Source** `packages/front/office/ooxml/src/docx/styles.js` | **Deps** `ooxmlErrors`, `xml`, `docxProperties`, `ooxmlShared` | **Worker-safe** yes

## Resolve

```js
const styles = runtime.resolve('docxStyles');
// Returns: { parse, serialize, defaults, bytesOf,
//            renderStyle, parseStyle,
//            REL_TYPE_STYLES, CT_STYLES }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => stylesObj` | Typed model. |
| `serialize` | `(obj) => string` | `<w:styles>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `defaults` | `() => stylesObj` | Skeleton with `Normal` + `docDefaults`. |
| `parseStyle` / `renderStyle` | `(<w:style>)` / `(style)` | Round-trip of a single style. |
| `REL_TYPE_STYLES`, `CT_STYLES` | string constants | OPC bindings. |

## Model

```js
{
    docDefaults?: { rPr?: RunProperties, pPr?: ParagraphProperties },
    styles: [{
        type: 'paragraph'|'character'|'table'|'numbering',
        styleId: string,
        name?: string,
        basedOn?: string,        // parent styleId
        next?: string,           // style applied to the following paragraph
        isDefault?: boolean,
        rPr?: RunProperties,
        pPr?: ParagraphProperties,
        tblPr?: TableProperties,   // table styles: style / width / borders / cellMargins (see docxProperties)
        _extras?: [xmlNode]
    }],
    _extras?: [xmlNode]
}
```

## Examples

### A bold red "Heading1" style

```js
const styles = runtime.resolve('docxStyles');
const obj = styles.defaults();
obj.styles.push({
    type: 'paragraph',
    styleId: 'Heading1',
    name: 'heading 1',
    basedOn: 'Normal',
    next: 'Normal',
    pPr: { spacing: { before: 240, after: 120 } },
    rPr: { bold: true, size: 32, color: 'CC0000' }
});
const xmlText = styles.serialize(obj);
```

### Read

```js
const obj = styles.parse(pkg.parts['/word/styles.xml']);
obj.styles.find(s => s.styleId === 'Normal');
```

## Notes

- `defaults()` returns `docDefaults` with `{ rPr: { font: 'Calibri', size: 22 } }` (= 11pt) and a single default `Normal` paragraph style.
- `isDefault: true` emits `w:default="1"` — only one style per `type` should carry it (not enforced).
- A table style's `<w:tblPr>` is typed as `tblPr` (`style`, `width`, `borders` — see [docx-properties](./properties.md)). A style renders its children in the CT_Style order `name`, `basedOn`, `next`, `pPr`, `rPr`, `tblPr`, then `_extras`.
- `<w:trPr>`, `<w:tcPr>` and the conditional `<w:tblStylePr>` parts inside table styles are not typed here and land in `_extras`. `defaults()` is unchanged: it carries no `tblPr`.
- Pass the object to `docx.write(doc, { styles: obj })`; the relationship and content type are wired automatically.
- A root other than `<w:styles>` raises `ParseError('docx/styles-bad-root')`.

## See also

- [docx](./docx.md) — the write orchestrator.
- [docx-properties](./properties.md) — `rPr` / `pPr` typing.
