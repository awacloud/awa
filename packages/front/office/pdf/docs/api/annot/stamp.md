---
module: pdfStampAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfStampAnnot

> Rubber-stamp annotation — ISO 32000-2 §12.5.6.12.

**Module** `pdfStampAnnot` | **Source** `packages/front/office/pdf/src/annot/stamp.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Stamp`. The only subtype-specific entry is `/Name` — the icon
(`Approved`, `Experimental`, `NotApproved`, `AsIs`, `Expired`,
`NotForPublicRelease`, `Confidential`, `Final`, `Sold`, `Departmental`,
`ForComment`, `TopSecret`, `Draft`, `ForPublicRelease`). The actual rendering
lives in `/AP` (base record); `/Name` is only a hint. The shared markup entries
(`/T`, `/Subj`, `/CreationDate`, `/Popup`, …) are captured into `_extras`.

## Resolve

```js
const stamp = runtime.resolve('pdfStampAnnot');
// Returns: { typeStampAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeStampAnnot` | `(dict) => StampAnnot` | Base record plus `iconName`. |

## Examples

```js
const s = runtime.resolve('pdfStampAnnot').typeStampAnnot(dict);
s.iconName;     // 'Approved'
s.ap;           // appearance-stream dictionary (base record)
s._extras.T;    // /T (author) — typed string object
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/stamp/bad-subtype` | `ParseError` | `/Subtype` present and not `/Stamp`. |

## See also

- [`pdfAnnot`](./annot.md) · [`pdfMarkupAnnot`](./markup.md)
- [`pdfAppearance`](../form/appearance.md)
