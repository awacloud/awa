---
module: docxCustomXml
category: ooxml/docx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxCustomXml

> Custom XML data parts — `customXml/item{N}.xml` + `customXml/itemProps{N}.xml` (§17.5.2 + §22.4).

**Module** `docxCustomXml` | **Source** `packages/front/office/ooxml/src/docx/customXml.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

A docx can carry arbitrary user XML and bind SDTs to XPaths through a `storeItemID`. Each data store lives in two parts: `item{N}.xml` (opaque user XML) and `itemProps{N}.xml` (`<ds:datastoreItem ds:itemID="{GUID}">` + schemaRefs).

## Resolve

```js
const cx = runtime.resolve('docxCustomXml');
// Returns: { parseProps, renderProps, propsBytes,
//            generateStoreItemID,
//            DS_NS,
//            REL_TYPE_CUSTOM_XML, REL_TYPE_CUSTOM_XML_PROPS,
//            CT_CUSTOM_XML_PROPS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseProps` | `(text\|bytes) => { storeItemID, schemaRefs? }` | Typed props. |
| `renderProps` | `(props) => string` | `<ds:datastoreItem>` XML. |
| `propsBytes` | `(props) => Uint8Array` | UTF-8 bytes. |
| `generateStoreItemID` | `() => '{GUID}'` | Brace-wrapped RFC 4122 v4 GUID from `crypto.getRandomValues`; throws `docx/no-random-source` without it. |
| `DS_NS`, `REL_TYPE_CUSTOM_XML`, `REL_TYPE_CUSTOM_XML_PROPS`, `CT_CUSTOM_XML_PROPS` | string | OPC bindings. |

## Model

```js
{
    storeItemID: '{0EBA2C1A-…}',     // GUID, the lookup key of SDT.dataBinding
    schemaRefs?: [string]            // optional schema URIs
}
```

Relationship chain:

```
/word/document.xml
  └─ customXml rel      → /customXml/item1.xml         (opaque user XML)
/customXml/item1.xml
  └─ customXmlProps rel → /customXml/itemProps1.xml    (typed props)
```

## Examples

### Attach a data store

```js
const cx = runtime.resolve('docxCustomXml');
const id = cx.generateStoreItemID();   // '{A1B2C3D4-…}'
const userXml = '<root><name>Alice</name></root>';

const props = { storeItemID: id, schemaRefs: ['urn:my-schema'] };

// Place the parts and their relationships by hand:
opc.setPart(pkg, '/customXml/item1.xml', opc.stringToBytes(userXml));
opc.setPart(pkg, '/customXml/itemProps1.xml',
    cx.propsBytes(props), cx.CT_CUSTOM_XML_PROPS);
opc.setRels(pkg, '/word/document.xml', [
    { Id: 'rIdCx1', Type: cx.REL_TYPE_CUSTOM_XML, Target: '../customXml/item1.xml' }
]);
opc.setRels(pkg, '/customXml/item1.xml', [
    { Id: 'rIdCxP1', Type: cx.REL_TYPE_CUSTOM_XML_PROPS,
      Target: 'itemProps1.xml' }
]);
```

### Read

```js
const props = cx.parseProps(pkg.parts['/customXml/itemProps1.xml']);
// → { storeItemID: '{…}', schemaRefs: ['urn:…'] }
```

## Notes

- `generateStoreItemID` uses `crypto.getRandomValues`; without it, `generateStoreItemID` throws `docx/no-random-source` (`RenderError`) — pass `storeItemID` explicitly. The source is read from `globalThis.crypto` at each call.
- `storeItemID` must be unique within the package and match the `dataBinding.storeItemID` of every SDT bound to it.
- The item part is **opaque** — the module never parses its content (arbitrary user-defined XML).
- Word also accepts `itemProps` without `schemaRefs`; the array is then omitted from the parsed object.
- A props root other than `<ds:datastoreItem>` raises `ParseError('docx/customxml-bad-root')`.

## See also

- [docx](./docx.md) — orchestrator (reads/writes the customXml parts).
- [docx-structure](./structure.md) — SDTs with `dataBinding`.
