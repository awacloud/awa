---
module: pdfRedactionIso32005
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfRedactionIso32005

> Opt-in: typing of the ISO/TS 32005 apply-redaction audit record (read side). The TS text is not vendored; the entries below are what this module recognises. No content removal is performed.

**Module** `pdfRedactionIso32005` | **Source** `packages/front/office/pdf/src/extra/redaction-iso32005.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

TS 32005 layers an "apply-redaction" workflow on top of the `/Redact` annotation (§12.5.6.21). Captures the audit record: applied annotations, overlay hints (`/RD`, `/IC`, `/RO`), content-stream markers (`/Redact … BMC … EMC`).

## Resolve

```js
const ext = runtime.resolve('pdfRedactionIso32005');
// Returns: { typeRedactionRecord, findRedactMarkers, REDACT_MARKERS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeRedactionRecord` | `(dict) => RedactionRecord` | `{ appliedAt, tool, annotations, rd, ro, ic, markedRegions, raw, _extras }`. |
| `findRedactMarkers` | `(Uint8Array) => { regions: Array<{ beginOffset, endOffset, kind }> }` | Scans BMC/BDC/EMC markers. |
| `REDACT_MARKERS` | frozen catalog | `{ begin: '/Redact BMC', beginPropertyList: '/Redact BDC', end: 'EMC', notes }`. |

## Examples

### Audit record

```js
const ext = runtime.resolve('pdfRedactionIso32005');
const r = ext.typeRedactionRecord(auditDict);
r.appliedAt;     // '2026-05-15'
r.annotations;   // [ ref, ref, … ]
```

### Markers in the content stream

```js
const m = ext.findRedactMarkers(contentBytes);
m.regions.length;        // 1
m.regions[0].kind;       // 'BMC'
m.regions[0].endOffset;  // > beginOffset, or null if EMC is missing
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/redact32005/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/extra/redact32005/bad-annotations` | `ParseError` | `/Annotations` is not an array. |
| `pdf/extra/redact32005/scan/bad-input` | `ParseError` | Bytes are not a Uint8Array. |

## See also

- [`pdfRedactAnnot`](../annot/redact.md)
- [`pdfContentStream`](../content/stream.md)
- [Extras index](./README.md)
