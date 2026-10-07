---
module: pkgManifest
category: odf/pkg
dependencies: [odfErrors, odfShared, xml]
returns: object
worker-safe: true
status: complete
---

# pkgManifest

> Parse/render `META-INF/manifest.xml` — list of `<manifest:file-entry>`.

**Module** `pkgManifest` | **Source** `packages/front/office/odf/src/pkg/manifest.js` | **Deps** `odfErrors`, `odfShared`, `xml` | **Worker-safe** yes

Model:

```js
{
  version: '1.4',
  entries: [
    { fullPath: '/', mediaType: 'application/vnd.oasis.opendocument.text', version: '1.4' },
    { fullPath: 'content.xml', mediaType: 'text/xml' },
    ...
  ],
  _extras?
}
```

The **first** entry is the `/` root, whose `mediaType` identifies the document type.

## Resolve

```js
const manifest = runtime.resolve('pkgManifest');
// → { parse, serialize, empty, setEntry, MANIFEST_NS }
```

## API

| Method | Description |
|--------|-------------|
| `parse(xmlString)` | Throws `ParseError` if the root isn't `<manifest:manifest>`. |
| `serialize(model)` | XML with prolog + manifest namespace. The written root declares every namespace prefix it uses: a parsed source's other root declarations come back through `_extras.attrs`, any other prefix is declared from `odfShared.ODF_PREFIXES`, and a prefix nobody declares throws `RenderError('odf/render-error/namespace')`. |
| `empty(mimetype)` | Manifest with only the root entry. |
| `setEntry(m, fullPath, mediaType)` | Adds or replaces an entry. |

## Notes

- Preserve-unknowns: custom attributes and unrecognized children are kept in `_extras`.
- `manifest:version` defaults to `'1.4'`.
- No encryption or digest support: a `manifest:encryption-data` child of an entry is not interpreted, it is kept in the entry's `_extras.children` and written back by `serialize`.

## See also

- [pkg/package](./package.md)
