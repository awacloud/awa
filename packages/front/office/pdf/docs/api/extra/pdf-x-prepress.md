---
module: pdfXPrepress
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfXPrepress

> PDF/X conformance (X-1a, X-3, X-4, …, X-6) — ISO 15930.

**Module** `pdfXPrepress` | **Source** `packages/front/office/pdf/src/extra/pdf-x-prepress.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

PDF/X profile family (X-1a/X-3/X-4/X-4p/X-5g/X-5n/X-5pg/X-6) with `/OutputIntent /S /GTS_PDFX`. Structural lint: `/TrimBox` (or `/ArtBox`, never both) on every page, plus a `/BleedBox` presence warning.

## Resolve

```js
const ext = runtime.resolve('pdfXPrepress');
// Returns: { typePdfXOutputIntent, lintPdfXPage, typeOpi, typeOpiDict,
//   OPI_KEYS, typePrepressPart, PREPRESS_PART_KEYS, PDFX_PROFILES,
//   COLOR_POLICY }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typePdfXOutputIntent` | `(dict) => { isPdfX, subtype, identifier, profile, catalog, raw }` | Typed output intent. |
| `lintPdfXPage` | `(page) => { pass, errors, warnings }` | Structural per-page lint. |
| `typeOpi` | `(dict) => { version13?, version20?, raw, _extras }` | An image or form XObject's `/OPI` dictionary: each version dictionary (key `1.3` / `2.0`) typed by `typeOpiDict` (a reference as read, `null` for a value of another type), present only when the key is; the other keys in `_extras`. |
| `typeOpiDict` | `(dict, version) => OpiDict` | An OPI version dictionary, `version` `'1.3'` or `'2.0'`: one field per key of its list, named after the key in lower case (`CropRect` → `croprect`, `MainImage` → `mainimage`), present only when the key is — a name, a byte or text string, a number or a boolean by its value, an array (a rectangle included) as read, `F` (file specification) and `Inks` as read with a name by its value, a reference as read, `null` for a value of none of the key's types — plus `raw` and `_extras` (the other keys). |
| `OPI_KEYS` | frozen object | Version → its keys (the Arlington PDF Model's lists). |
| `typePrepressPart` | `(dict, kind) => PrepressPart` | A separation dictionary (`kind` `separation`: `Pages`, `DeviceColorant` a name or a string, `ColorSpace`), a page's box colour information (`boxColorInfo`) or box style (`boxStyle`: `C`, `W`, `S`, `D`), a trap network region (`trapRegion`: `TP`, `TZ`) or an output intent's destination profile reference (`outputProfileRef`): one field per key of its list, named after the key in lower case, present only when the key is — a name, a string (its bytes), a number or an integer by its value, an array, a dictionary or a stream as read, a key of several types by the first that fits, a reference as read, `null` for a value of another type — plus `raw` and `_extras`. |
| `PREPRESS_PART_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `PDFX_PROFILES` | frozen catalog | Profile name → `{ iso, color, flavor }`. |
| `COLOR_POLICY` | frozen catalog | `None`/`Convert`/`Tag`/`Embed` → description. |

## Examples

### Detect the profile

```js
const ext = runtime.resolve('pdfXPrepress');
const oi = ext.typePdfXOutputIntent(outputIntent);
oi.profile;        // 'X-4'
oi.catalog.iso;    // 'ISO 15930-7:2010'
```

### Lint a page

```js
const r = ext.lintPdfXPage(page);
r.pass;    // false
r.errors;  // [ 'page requires /TrimBox or /ArtBox' ]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pdfx/not-dict` | `ParseError` | outputIntent is not a dict. |
| `pdf/extra/pdfx/opi/not-dict` | `ParseError` | `typeOpi` / `typeOpiDict`: not a dict. |
| `pdf/extra/pdfx/opi/version` | `ContractError` | `typeOpiDict`: `version` not `'1.3'` or `'2.0'`. |
| `pdf/extra/pdfx/part/not-dict` | `ParseError` | `typePrepressPart`: not a dict. |
| `pdf/extra/pdfx/part/kind` | `ContractError` | `typePrepressPart`: `kind` missing or not a key of `PREPRESS_PART_KEYS`. |
| `pdf/extra/pdfx/lint/bad-page` | `ParseError` | page is not a typed page dict. |

## See also

- [`pdfPageBoundary`](../prepress/pageBoundary.md)
- [`pdfOutputIntent`](../prepress/outputIntent.md)
- [`pdfAOutputIntent`](./pdf-a-output-intent.md)
- [Extras index](./README.md)
