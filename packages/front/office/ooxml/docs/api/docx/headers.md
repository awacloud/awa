---
module: docxHeaders
category: ooxml/docx
dependencies: [ooxmlErrors, xml, docxStructure, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxHeaders

> `word/header*.xml` and `word/footer*.xml` parts — standalone bodies anchored through `sectPr` (§17.10.3-4).

**Module** `docxHeaders` | **Source** `packages/front/office/ooxml/src/docx/headers.js` | **Deps** `ooxmlErrors`, `xml`, `docxStructure`, `ooxmlShared` | **Worker-safe** yes

Headers and footers are standalone parts holding block-level content (paragraphs/tables) — the same body model as the main document. They are bound to a section via `<w:headerReference w:type="…" r:id="…"/>` or `<w:footerReference …/>` inside `sectPr`.

## Resolve

```js
const h = runtime.resolve('docxHeaders');
// Returns: { parse, serialize, bytesOf,
//            REL_TYPE_HEADER, REL_TYPE_FOOTER,
//            CT_HEADER, CT_FOOTER }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(input: text\|bytes\|XmlElement, kind: 'header'\|'footer') => obj` | Typed model. An already-parsed root element is used as is. |
| `serialize` | `(obj) => string` | `<w:hdr>` or `<w:ftr>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `REL_TYPE_HEADER`, `REL_TYPE_FOOTER`, `CT_HEADER`, `CT_FOOTER` | string | OPC bindings. |

## Model

```js
{ type: 'header'|'footer',
  body: [paragraph | table],
  _extras?: [xmlNode] }
```

## Reference types (sectPr)

| `type` value (`w:type`) | Pages affected |
|----------|---------------|
| `'default'` | every page without an override |
| `'first'` | first page (requires `<w:titlePg/>` in sectPr) |
| `'even'` | even pages (requires `evenAndOddHeaders` in settings) |

## Examples

### Default header + first page

```js
const doc = {
    type: 'document', body: [/* … */],
    sectPr: {
        pageSize: { w: 12240, h: 15840 },
        titlePg: true,
        headerReferences: [
            { type: 'default', rId: 'rIdH1' },
            { type: 'first',   rId: 'rIdH2' }
        ]
    }
};
d.write(doc, {
    headers: {
        rIdH1: { type: 'header', body: [d.paragraph('Confidential')] },
        rIdH2: { type: 'header', body: [d.paragraph('Cover page')] }
    }
});
```

### Parse a footer

```js
const h = runtime.resolve('docxHeaders');
const obj = h.parse(pkg.parts['/word/footer1.xml'], 'footer');
// obj.body = [paragraph, …]
```

## Notes

- Rendering strips `<w:sectPr>` from the body (illegal inside a header/footer).
- Uses `docxStructure.parseBody` / `renderBodyChildren` — the same elements as the main document are supported.
- The `rId` in `headerReferences` must match the key in the `opts.headers` object passed to `docx.write`.
- Several sections can share one header (the same `rId`).
- A root other than the expected `<w:hdr>` / `<w:ftr>` raises `ParseError('docx/header-bad-root')` / `ParseError('docx/footer-bad-root')`.
- `docx.read` passes a root already processed by `markupCompatibility` (ignorable extension content dropped, the two repeating-section elements kept); a standalone call on text or bytes does no markup-compatibility processing.
- The written root declares `w` and `r`, plus `mc`, `w15` and `mc:Ignorable="w15"` when the part holds a `w15` element.

## See also

- [docx](./docx.md) — orchestrator (`headers` / `footers` options).
- [docx-settings](./settings.md) — `evenAndOddHeaders`, required for `even`.
- [docx-structure](./structure.md) — `sectPr` in the body.
