---
module: pdfDestination
category: pdf/destination
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfDestination

> Explicit and named destinations — ISO 32000-2 §12.3.2.

**Module** `pdfDestination` | **Source** `packages/front/office/pdf/src/destination/destination.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

A destination describes a view within a document: `[page, fit, …args]`. `fit` is one of `XYZ`, `Fit`, `FitH`, `FitV`, `FitR`, `FitB`, `FitBH`, `FitBV`. `typeDestination` accepts an explicit array, a name/string (looked up through the supplied names dict — either `/Names /Dests` (PDF 1.2+ name tree) or the legacy PDF 1.1 `/Dests` dict), or a dict carrying `/D`.

## Resolve

```js
const dest = runtime.resolve('pdfDestination');
// Returns: { typeDestination }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeDestination` | `(value, namesDict?, resolveRef?) => Destination` | Typed form. |

### Shape `Destination`

```js
{
    page: { num, gen } | { pageNum: number },   // explicit ref, or remote page index
    fit: 'XYZ' | 'Fit' | 'FitH' | 'FitV' | 'FitR' | 'FitB' | 'FitBH' | 'FitBV',
    args: (number | null)[]                      // per `fit`'s expected arity
}
```

## Examples

### Explicit destination

```js
const dest = runtime.resolve('pdfDestination');
const d = dest.typeDestination(dictItemD, null, resolveRef);
d.fit === 'XYZ';
d.args;     // [left, top, zoom]
```

### Named destination

```js
const d = dest.typeDestination(
    { type: 'name', value: 'chap1' },
    catalog.names?.entries?.Dests,
    resolveRef
);
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/dest/bad-input` | `ParseError` | `value` is null or not a typed PDF object. |
| `pdf/dest/bad-type` | `ParseError` | Value is neither array, name nor string. |
| `pdf/dest/empty` | `ParseError` | Destination array is empty. |
| `pdf/dest/bad-page` | `ParseError` | First element is neither a ref nor an int. |
| `pdf/dest/missing-fit` | `ParseError` | Second element missing or not a name. |
| `pdf/dest/unknown-fit` | `ParseError` | `fit` outside the known set. |
| `pdf/dest/bad-arg` | `ParseError` | A fit argument is neither a number nor null. |
| `pdf/dest/no-names` | `ParseError` | Named destination with no `namesDict` supplied. |
| `pdf/dest/unknown-name` | `ParseError` | Name not found in `/Dests`. |

## See also

- [`pdfOutline`](../outline/outline.md) · [`pdfAction`](../action/action.md)
- [`pdfLinkAnnot`](../annot/link.md)
