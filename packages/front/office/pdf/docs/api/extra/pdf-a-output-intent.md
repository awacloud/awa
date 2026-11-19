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
| `validatePdfABasics` | `(doc, { profile? }) => { pass, errors, warnings, findings }` | Lints the catalog and trailer basics of a `pdf.read` result (or a hand-built `{ catalog: { entries }, encrypted }`); with `profile` (a `PDFA_PROFILES` key) each finding names veraPDF's rule (see Notes). |
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
const r = ext.validatePdfABasics(pdf.read(bytes), { profile: '2b' });
r.pass;      // false
r.errors;    // [ 'catalog requires /Metadata XMP stream', … ]
r.findings;  // [ { rule: '6.6.2.1-t1', severity: 'error', message: 'catalog requires /Metadata XMP stream' }, … ]
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/pdfa/not-dict` | `ParseError` | outputIntent is not a dict. |
| `pdf/extra/pdfa/lint/bad-doc` | `ParseError` | typedDoc is not an object. |
| `pdf/extra/pdfa/bad-profile` | `ContractError` | `opts.profile` is not a `PDFA_PROFILES` key. |

## Notes

- **What is read.** A `pdf.read` result: the catalog from `catalog.raw`, references resolved through `_raw.resolve`, encryption from the trailer's `/Encrypt` (a document opened with `password`). A hand-built `{ catalog: { entries }, encrypted }` is read as it is.
- **Checks and rules.** Each error and warning is also a finding `{ rule, severity, message }`, `rule` veraPDF's rule id (`<clause>-t<test>`) of the check under `opts.profile` (null without one): the catalog `/Metadata` (part 1 6.7.2-t1, parts 2 and 3 6.6.2.1-t1, part 4 6.7.2.1-t1) and encryption (6.1.3-t2) are errors; a `/MarkInfo` that is not a dictionary and a missing `/OutputIntents` are warnings with no rule. Over the 482 PDF/A files of the veraPDF corpus, the rules it fails equal veraPDF 1.30.3's on those rules for every file (the `verapdf-lint` suite of `tools/office-scorecard`). It checks those basics only: veraPDF checks many more rules.

## See also

- [`pdfOutputIntent`](../prepress/outputIntent.md)
- [`pdfXmp`](../metadata/xmp.md)
- [`pdfXPrepress`](./pdf-x-prepress.md)
- [Extras index](./README.md)
