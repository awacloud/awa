---
module: pdfInfoDictDeprecated
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfInfoDictDeprecated

> `/Info` linter (deprecated in PDF 2.0) with XMP mapping.

**Module** `pdfInfoDictDeprecated` | **Source** `packages/front/office/pdf/src/extra/info-dict-deprecated.js` | **Deps** `pdfErrors` | **Worker-safe** yes

PDF 2.0 (ISO 32000-2 §14.3.3) deprecates the Document Information Dictionary in favour of the XMP metadata stream. This module inspects a Catalog + `/Info` pair and emits structured warnings when `/Info` is present on a PDF 2.0 document, with a suggested XMP mapping per the standard's recommended namespaces.

## Resolve

```js
const ext = runtime.resolve('pdfInfoDictDeprecated');
// Returns: { lint, mapInfoKey, suggestionsFor, INFO_TO_XMP, isVersion2OrHigher }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `lint` | `({ version, info, xmpPresent }) => { version, isPdf2, hasInfo, xmpPresent, warnings }` | Top-level lint. |
| `mapInfoKey` | `(name) => { ns, field } \| null` | Lookup by Info key. |
| `suggestionsFor` | `(infoDict) => Suggestion[]` | List of per-entry mappings. |
| `INFO_TO_XMP` | object | Info key → `{ ns, field }`. |
| `isVersion2OrHigher` | `(version) => boolean` | |

## Examples

### Lint

```js
const ext = runtime.resolve('pdfInfoDictDeprecated');
const r = ext.lint({ version: 2.0, info: infoDict, xmpPresent: false });
r.warnings;
// [ { code: 'pdf/info-deprecated', severity: 'warn', message: '…', suggestions: [...] },
//   { code: 'pdf/info-without-xmp', severity: 'warn', message: '…' } ]
```

### Map a key

```js
ext.mapInfoKey('Author');  // { ns: 'dc', field: 'creator' }
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/info-deprecated/bad-version` | `ParseError` | version is not string/name/number. |
| `pdf/info-deprecated/bad-info` | `ParseError` | Info is not a dict. |

### Warning codes (lint output)

| Code | Severity | When |
|------|----------|------|
| `pdf/info-deprecated` | warn | PDF 2.0 + `/Info` present. |
| `pdf/info-without-xmp` | warn | PDF 2.0 + `/Info` without XMP. |

## See also

- [`pdfInfo`](../metadata/info.md)
- [`pdfXmp`](../metadata/xmp.md)
- [`pdfXmpExtended`](./xmp-extended.md)
- [Extras index](./README.md)
