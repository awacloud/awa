---
module: pdfUaTagged
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfUaTagged

> PDF/UA-1 linter (ISO 14289-1) and draft PDF/UA-2 (ISO 14289-2).

**Module** `pdfUaTagged` | **Source** `packages/front/office/pdf/src/extra/pdf-ua-tagged.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Static linter. Catalog checks: `/StructTreeRoot` required, `/MarkInfo /Marked true`, `/Lang`, `/ViewerPreferences /DisplayDocTitle true`. Structure-element checks: Figures need `/Alt` or `/ActualText`; `/Span` is discouraged as a top-level type; the accessible-permission bit (bit 10) must be set.

## Resolve

```js
const ext = runtime.resolve('pdfUaTagged');
// Returns: { validatePdfUa, validateUaStructElement, UA_STRUCTURE }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `validatePdfUa` | `(doc, { part? }) => { pass, errors, warnings, findings }` | Document-level lint of a `pdf.read` result (or a hand-built `{ catalog: { entries }, p }`) against PDF/UA-1 (`part: 1`, the default) or PDF/UA-2 (`part: 2`); each finding names veraPDF's rule (see Notes). |
| `validateUaStructElement` | `(node) => { pass, errors, warnings }` | Lints a single structure node. |
| `UA_STRUCTURE` | frozen catalog | `{ required, forbidden, figure, headings }` structural rule lists. |

## Examples

### Global lint

```js
const ext = runtime.resolve('pdfUaTagged');
const r = ext.validatePdfUa(pdf.read(bytes), { part: 2 });
r.pass;      // false
r.errors;    // [ 'catalog requires /Lang string', … ]
r.findings;  // [ { rule: '8.4.4-t1', severity: 'error', message: 'catalog requires /Lang string' }, … ]
```

### Lint a node

```js
const r = ext.validateUaStructElement(figureNode);
r.errors[0];  // 'Figure requires /Alt or /ActualText'
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pdfua/bad-doc` | `ParseError` | typedDoc is not an object. |
| `pdf/extra/pdfua/struct/bad-node` | `ParseError` | node is not an object. |
| `pdf/extra/pdfua/bad-part` | `ContractError` | `opts.part` is neither 1 nor 2. |

## Notes

- **What is read.** A `pdf.read` result: the catalog from `catalog.raw`, each value checked resolved through `_raw.resolve` when it is a reference (`/MarkInfo` and its `/Marked`, `/Lang`, `/ViewerPreferences` and its `/DisplayDocTitle`), `/P` from the trailer's `/Encrypt` dictionary (a document opened with `password`). A hand-built `{ catalog: { entries }, p }` is read as it is.
- **Checks and rules.** Each error and warning is also a finding `{ rule, severity, message }`, `rule` veraPDF's rule id (`<clause>-t<test>`) of the check for the part: `/StructTreeRoot` (7.1-t11; part 2 8.2.1-t1), `/MarkInfo /Marked true` (6.2-t1), `/ViewerPreferences /DisplayDocTitle true` (7.1-t10; part 2 8.11.2-t1), the accessibility permission bit 10 of an encrypted document (part 1 7.16-t1; part 2 has no such rule), the catalog `/Lang` (part 2 8.4.4-t1; under part 1 a warning with no rule, as the language may be stated by the structure instead). Over the 305 PDF/UA files of the veraPDF corpus, the rules it fails equal veraPDF 1.30.3's on those rules for every file (the `verapdf-lint` suite of `tools/office-scorecard`). It checks the catalog only: veraPDF checks many more rules.

## See also

- [`pdfStructTree`](../tagged/structTree.md)
- [`pdfWellTagged`](./well-tagged-pdf.md)
- [`pdfTaggedPdfTyped`](./tagged-pdf-typed.md)
- [Extras index](./README.md)
