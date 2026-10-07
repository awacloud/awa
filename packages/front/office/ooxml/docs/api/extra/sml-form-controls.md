---
module: smlFormControls
category: extra
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# smlFormControls

> SML — ActiveX controls (`xl/activeX/activeX*.xml`), `<oleObject>`, `<control>`.

**Module** `smlFormControls` | **Source** `packages/front/office/ooxml/src/extra/sml-form-controls.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

Parses / renders the wrapper elements for legacy ActiveX form controls and OLE objects embedded in worksheets. Element names carry no namespace prefix (SpreadsheetML's default namespace).

## Resolve

```js
const ext = smlFormControls.factory(ooxmlErrors, xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseActiveX` / `renderActiveX` | `(text) => {attrs, ocxPr[]}` | `xl/activeX/activeX*.xml` content (`ocxPr` = id, license, persistence, autoLoad) |
| `parseOleObjects` / `renderOleObjects` | `(node) => OleObject[]` | throws `ParseError('xlsx/oleObjects-bad-root')` on a non-`<oleObjects>` root |
| `parseControls` / `renderControls` | `(node) => Control[]` | throws `ParseError('xlsx/controls-bad-root')` on a non-`<controls>` root |
| `parseControl` / `renderControl` | `(text) => xmlNode` | backward-compat raw passthrough (used by the smoke test) |

## Elements typed

`controls`, `control`, `controlPr`, `oleObjects`, `oleObject`, `objectPr`, `anchor`, `ocx`, `ocxPr`. The associated `xl/embeddings/oleObject*.bin` and ActiveX binary persistence parts are preserved by the package layer (no parsing).

## Notes

- ActiveX inner specifications stay as raw bytes — they remain a black box for Office to interpret.
- The shape carries the `rId` link to the `.bin` part so consumers can swap it.

## See also

- [xlsx](../xlsx/xlsx.md)
