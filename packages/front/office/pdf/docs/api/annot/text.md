---
module: pdfTextAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfTextAnnot

> Sticky-note annotation — ISO 32000-2 §12.5.6.4.

**Module** `pdfTextAnnot` | **Source** `packages/front/office/pdf/src/annot/text.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Text`: a sticky note. Subtype-specific entries are `/Open` (initial
pop-up state), `/Name` (icon — `Note`, `Comment`, `Help`, `Insert`, `Key`,
`NewParagraph`, `Paragraph`), `/State` and `/StateModel`. Everything from
`typeBaseAnnot` is inherited; every other entry — including the markup entries
`/T`, `/Subj`, `/RC`, `/CreationDate`, `/IRT`, `/RT`, `/Popup` — lands in
`_extras`.

## Resolve

```js
const text = runtime.resolve('pdfTextAnnot');
// Returns: { typeTextAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeTextAnnot` | `(dict) => TextAnnot` | Base record plus `open`, `iconName`, `state`, `stateModel`. |

`state` and `stateModel` are the raw `Uint8Array` payloads of the PDF strings;
`open` defaults to `false` and `iconName` to `null`.

## Examples

### Type a sticky note

```js
const t = runtime.resolve('pdfTextAnnot').typeTextAnnot(dict);
t.iconName;      // 'Note'
t.open;          // false by default
t._extras.T;     // /T (author) — typed string object
```

### Through the dispatcher

```js
const annot = runtime.resolve('pdfAnnot');
const a = annot.typeAnnot(dict, { Text: runtime.resolve('pdfTextAnnot').typeTextAnnot });
if (a.kind === 'Text') { /* … */ }
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/not-dict` | `ParseError` | Inherited from `typeBaseAnnot`. |
| `pdf/annot/bad-type` | `ParseError` | Inherited from `typeBaseAnnot`. |
| `pdf/annot/text/bad-subtype` | `ParseError` | `/Subtype` present and not `/Text`. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfPopupAnnot`](./popup.md) — the associated `/Popup`.
