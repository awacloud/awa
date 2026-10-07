---
module: pdfAOutputIntent
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfAOutputIntent

> PDF/A detection (`/S /GTS_PDFA1`) and basic validation — ISO 19005-{1..4}.

**Module** `pdfAOutputIntent` | **Source** `packages/front/office/pdf/src/extra/pdf-a-output-intent.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Recognizes an `/OutputIntent` whose `/S` is `GTS_PDFA1` (or later ISO 19005-2/3/4 profile names), extracts the conformance-level letter (a/b/u/e/f), and maps `/OutputConditionIdentifier` to a known registry profile.

## Resolve

```js
const ext = runtime.resolve('pdfAOutputIntent');
// Returns: { detectPdfAProfile, validatePdfABasics, PDFA_PROFILES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `detectPdfAProfile` | `(outputIntentDict) => { isPdfA, subtype, identifier, profile, part, level, catalog, raw }` | Detected profile fields (`part`/`level`/`catalog` are `null` when the identifier is unrecognized). |
| `validatePdfABasics` | `(typedDoc) => { pass, errors, warnings }` | Lints Catalog/Metadata basics. |
| `PDFA_PROFILES` | frozen catalog | `'1a'`, `'1b'`, `'2a'`, …, `'4f'` → `{ part, level, iso, notes }`. |

## Examples

### Detect the profile

```js
const ext = runtime.resolve('pdfAOutputIntent');
const p = ext.detectPdfAProfile(outputIntent);
p.part;   // 2
p.level;  // 'b'
p.catalog.iso;  // 'ISO 19005-2:2011'
```

### Lint

```js
const r = ext.validatePdfABasics(typedDoc);
r.pass;      // false
r.errors;    // [ 'catalog requires /Metadata XMP stream', … ]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pdfa/not-dict` | `ParseError` | outputIntent is not a dict. |
| `pdf/extra/pdfa/lint/bad-doc` | `ParseError` | typedDoc is not an object. |

## See also

- [`pdfOutputIntent`](../prepress/outputIntent.md)
- [`pdfXmp`](../metadata/xmp.md)
- [`pdfXPrepress`](./pdf-x-prepress.md)
- [Extras index](./README.md)
