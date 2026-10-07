---
module: pdfOutputIntent
category: pdf/prepress
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfOutputIntent

> Output intent — ISO 32000-2 §14.11.5.

**Module** `pdfOutputIntent` | **Source** `packages/front/office/pdf/src/prepress/outputIntent.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Describes the target rendering colour environment (`/Type /OutputIntent`), referenced from the Catalog's `/OutputIntents` array. Fields: `/S` (subtype — `GTS_PDFX` / `GTS_PDFA1` / `GTS_PDFA2` / etc., required), `/OutputCondition`, `/OutputConditionIdentifier`, `/RegistryName`, `/Info`, `/DestOutputProfile` (ICC stream ref), `/DestOutputProfileRef` (PDF 2.0 — ref to an external stream), `/MixingHints`, `/SpectralData`.

## Resolve

```js
const oi = runtime.resolve('pdfOutputIntent');
// Returns: { typeOutputIntent }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeOutputIntent` | `(dict) => OutputIntent` | Typing. |

### Shape

```js
{
    subtype,                            // /S, e.g. 'GTS_PDFA2'
    outputCondition, outputConditionIdentifier,
    registryName, info,
    destOutputProfile,                  // ICC stream ref
    destOutputProfileRef,               // PDF 2.0
    mixingHints, spectralData,
    raw, _extras
}
```

## Examples

### PDF/A conformance

```js
const oi = runtime.resolve('pdfOutputIntent');
for (const ref of catalog.outputIntents) {
    const o = oi.typeOutputIntent(doc._raw.resolve(ref));
    if (o.subtype === 'GTS_PDFA2') console.log('PDF/A-2 ready');
}
```

### ICC extraction

```js
const profile = doc._raw.resolve(o.destOutputProfile);
// profile.raw → ICC bytes for downstream colour management
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/output-intent/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/output-intent/bad-type` | `ParseError` | `/Type` is not `/OutputIntent`. |
| `pdf/output-intent/missing-s` | `ParseError` | `/S` is absent. |
| `pdf/output-intent/bad-str` | `ParseError` | A string field is mistyped. |
| `pdf/output-intent/bad-profile` | `ParseError` | `/DestOutputProfile` is neither a stream nor a ref. |
| `pdf/output-intent/bad-profile-ref` | `ParseError` | `/DestOutputProfileRef` is neither a dict nor a ref. |
| `pdf/output-intent/bad-mixing` | `ParseError` | `/MixingHints` is not a dict. |
| `pdf/output-intent/bad-spectral` | `ParseError` | `/SpectralData` is not a dict. |

## See also

- [`pdfPageBoundary`](./pageBoundary.md) · [`pdfCatalog`](../document/catalog.md)
