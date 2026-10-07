---
module: pdfLinearizationWrite
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfLinearizationWrite

> Linearization Parameter Dictionary emitter — Annex F (write-side stub).

**Module** `pdfLinearizationWrite` | **Source** `packages/front/office/pdf/src/extra/linearization-write.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Builds a `/Linearized` dict and a placeholder hint-stream for emission as the first indirect object of a linearized PDF (ISO 32000-2 Annex F). The full hint table (page-offset / shared-objects) remains future work — the stub is length-0 to keep the structural shape correct.

## Resolve

```js
const ext = runtime.resolve('pdfLinearizationWrite');
// Returns: { buildLinearizedDict, buildHintStreamStub,
//   validateLinearizedDict, LINEARIZED_KEYS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `buildLinearizedDict` | `(params) => dictObj` | Typed `/Linearized` dict. |
| `buildHintStreamStub` | `() => streamObj` | Length-0 stub. |
| `validateLinearizedDict` | `(dict) => { pass, errors, warnings }` | Validates the Table F.1 shape. |
| `LINEARIZED_KEYS` | frozen array | `['Linearized','L','H','O','E','N','T']`. |

### Required `params`

`version` (defaults to 1.0), `fileLength`, `hintOffset`, `hintLength`, `firstPageObj`, `firstPageEnd`, `pageCount`, `mainXrefOffset`, and optionally `firstPage`.

## Examples

### Build the dict

```js
const ext = runtime.resolve('pdfLinearizationWrite');
const dict = ext.buildLinearizedDict({
    version: 1.0, fileLength: 12345,
    hintOffset: 678, hintLength: 200,
    firstPageObj: 5, firstPageEnd: 4000,
    pageCount: 10, mainXrefOffset: 12000
});
```

### Validate

```js
ext.validateLinearizedDict(parsedDict).pass;  // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/linwrite/bad-params` | `RenderError` | `params` is not an object. |
| `pdf/extra/linwrite/missing-<key>` | `RenderError` | A required numeric parameter is absent (`fileLength`, `firstPageObj`, `firstPageEnd`, `pageCount`, `mainXrefOffset`). |
| `pdf/extra/linwrite/missing-hint` | `RenderError` | `hintOffset`/`hintLength` absent. |
| `pdf/extra/linwrite/validate/not-dict` | `RenderError` | `validateLinearizedDict` argument is not a dict. |

## See also

- [`pdfLinearization`](../linearization/linearization.md)
- [Extras index](./README.md)
