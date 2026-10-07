---
module: pkgMimetype
category: odf/pkg
dependencies: [odfErrors, odfShared]
returns: object
worker-safe: true
status: complete
---

# pkgMimetype

> Encode/decode the `mimetype` file (first ZIP entry, STORED).

**Module** `pkgMimetype` | **Source** `packages/front/office/odf/src/pkg/mimetype.js` | **Deps** `odfErrors`, `odfShared` | **Worker-safe** yes

The `mimetype` file of an ODF package is a small ASCII file (~38 bytes) placed first in the ZIP, **stored uncompressed**. It identifies the document type.

## Resolve

```js
const mt = runtime.resolve('pkgMimetype');
// → { parse, render, isKnown, CT_ODT, CT_ODS, CT_ODP }
```

## API

| Method | Description |
|--------|-------------|
| `parse(bytes)` | Decodes UTF-8 and trims. Throws `ContractError` if `bytes` isn't a `Uint8Array`, or `ParseError` if empty. |
| `render(string)` | Encodes UTF-8 without a trailing newline. Throws `ContractError` if the argument isn't a non-empty string. |
| `isKnown(mt)` | `true` if in { CT_ODT, CT_ODS, CT_ODP }. |

Constants:

- `CT_ODT = 'application/vnd.oasis.opendocument.text'`
- `CT_ODS = 'application/vnd.oasis.opendocument.spreadsheet'`
- `CT_ODP = 'application/vnd.oasis.opendocument.presentation'`

## Examples

```js
const bytes = mt.render(mt.CT_ODT);
mt.parse(bytes); // 'application/vnd.oasis.opendocument.text'
```

## Notes

- Writing the STORED `mimetype` file is handled by `pkgPackage`, which passes `[bytes, { level: 0 }]` to the zip module.
- No trailing newline (ODF convention).

## See also

- [pkg/package](./package.md)
- [pkg/manifest](./manifest.md)
