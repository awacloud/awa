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
// Returns: { typePdfXOutputIntent, lintPdfXPage, PDFX_PROFILES, COLOR_POLICY }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typePdfXOutputIntent` | `(dict) => { isPdfX, subtype, identifier, profile, catalog, raw }` | Typed output intent. |
| `lintPdfXPage` | `(page) => { pass, errors, warnings }` | Structural per-page lint. |
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
| `pdf/extra/pdfx/lint/bad-page` | `ParseError` | page is not a typed page dict. |

## See also

- [`pdfPageBoundary`](../prepress/pageBoundary.md)
- [`pdfOutputIntent`](../prepress/outputIntent.md)
- [`pdfAOutputIntent`](./pdf-a-output-intent.md)
- [Extras index](./README.md)
