---
module: pdfResources
category: pdf/document
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfResources

> Resolution of a Page's or Form XObject's `/Resources` dictionary — ISO 32000-2 §7.8.3.

**Module** `pdfResources` | **Source** `packages/front/office/pdf/src/document/resources.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Six named sub-dictionaries map the **local names** used inside a content stream
to indirect objects: `/Font`, `/XObject`, `/ColorSpace`, `/ExtGState`,
`/Pattern`, `/Shading`. A legacy `/ProcSet` is read but never required
(deprecated in PDF 2.0). Resources are **inheritable**: a Page without its own
`/Resources` walks up the page tree's `/Parent` chain (§7.7.3.4).
`resolvePageResources` implements that walk with a cycle guard.

Any category value may itself be an indirect reference (§7.3.10). Real
documents do this: a measured ANSSI guide carries `/ExtGState` as
`N 0 R` on 56 of its 58 pages. Rejecting that used to throw away the
page's whole resource map, fonts included. The resolver you pass reaches
objects inside object streams,
because it is the document's own `_raw.resolve`.

## Resolve

```js
const r = runtime.resolve('pdfResources');
// Returns: { typeResources, resolvePageResources, lookupResource }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeResources` | `(dict\|null, resolveRef?) => Resources` | Direct typing. With `resolveRef`, an indirect category (`/Font 12 0 R`) is resolved through it; a category that resolves to `null` is treated as absent. |
| `resolvePageResources` | `(pageDict, resolveRef) => Resources` | Inherited walk, at most 64 levels; passes `resolveRef` on to `typeResources`. |
| `lookupResource` | `(resources, category, name, resolveRef?) => object` | Named lookup. |

### `Resources` shape

```js
{
    Font:       { [name]: PdfObject },
    XObject:    { [name]: PdfObject },
    ColorSpace: { [name]: PdfObject },
    ExtGState:  { [name]: PdfObject },
    Pattern:    { [name]: PdfObject },
    Shading:    { [name]: PdfObject },
    ProcSet:    string[] | null,
    raw:        object | null
}
```

`lookupResource` returns the resolved object directly (ref → object) when
`resolveRef` is supplied, otherwise the typed entry (possibly a `ref`).

## Examples

### Page → Resources

```js
const r = runtime.resolve('pdfResources');
const res = r.resolvePageResources(pageDict, doc._raw.resolve);
res.Font;       // { F1: <typed font dict>, F2: … }
res.ExtGState;  // { GS1: … }
```

### Look up a named font

```js
const fontDict = r.lookupResource(res, 'Font', 'F1', doc._raw.resolve);
const typed = runtime.resolve('pdfFont').typeFont(fontDict);
```

### Direct typing without the walk

```js
const res = r.typeResources(pageDict.entries.Resources);
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/resources/not-dict` | `ParseError` | `/Resources` is not a dictionary. |
| `pdf/resources/bad-subdict` | `ParseError` | A sub-dictionary (`/Font`, …) is not a dictionary — or it is an indirect reference and no `resolveRef` was supplied. |
| `pdf/resources/bad-shape` | `ParseError` | `/Resources` is neither a dictionary nor a reference. |
| `pdf/resources/cycle` | `ParseError` | Cycle detected in the `/Parent` chain. |
| `pdf/resources/unknown-category` | `ParseError` | Invalid category passed to `lookupResource`. |
| `pdf/resources/missing-name` | `ParseError` | Name not found in the category. |

## See also

- [`pdfPage`](./page.md) — supplies `pageDict`.
- [`pdfPages`](./pages.md) — page-tree walk.
- [`pdfFont`](../font/font.md), [`pdfImages`](../content/images.md) — typers for the resolved entries.
