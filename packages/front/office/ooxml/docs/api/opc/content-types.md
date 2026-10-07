---
module: opcContentTypes
category: ooxml/opc
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# opcContentTypes

> Parses/serialises `[Content_Types].xml` (OPC, ECMA-376 part 2 §10).

**Module** `opcContentTypes` | **Source** `packages/front/office/ooxml/src/opc/contentTypes.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

The `[Content_Types].xml` stream maps each part to a MIME type through two rules: `<Default Extension=… ContentType=…/>` (by extension) and `<Override PartName=… ContentType=…/>` (by absolute path). Overrides win.

## Resolve

```js
const ct = runtime.resolve('opcContentTypes');
// Returns: { parse, serialize, lookup, NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text: string) => { defaults, overrides }` | MIME tables. |
| `serialize` | `(types) => string` | `<Types>` XML. |
| `lookup` | `(types, partName: string) => string\|null` | Resolved MIME type for a part. |
| `NS` | string constant | OPC content-types namespace. |

## Shape

```js
{
    defaults: { 'xml': 'application/xml',
                'rels': 'application/vnd.openxmlformats-package.relationships+xml' },
    overrides: { '/word/document.xml': '…wordprocessingml.document.main+xml' }
}
```

## Examples

### Lookup

```js
const ct = runtime.resolve('opcContentTypes');
const types = ct.parse(xmlText);
ct.lookup(types, '/word/document.xml');
// '…wordprocessingml.document.main+xml'  (the override wins)
ct.lookup(types, '/word/styles.xml');
// 'application/xml'  (extension default)
```

### Build from scratch

```js
ct.serialize({
    defaults: { xml: 'application/xml' },
    overrides: { '/word/document.xml': '…document.main+xml' }
});
```

## Notes

- `parse` raises `ParseError('opc/content-types-bad-root')` when the root is not `<Types>`.
- Extensions are looked up lower-cased; `partName` must start with `/`.
- No validation that the MIME strings are valid tokens — the module is a pass-through.
- `lookup` takes a flat `types` object. To resolve a content type from a whole package, use [`ooxmlShared.lookupCT(pkg, partName)`](../_shared/README.md) instead.

## See also

- [opc-package](./package.md) — consumes `parse`/`serialize` on read/write.
- [opc-relationships](./relationships.md) — the other half of the OPC metadata.
