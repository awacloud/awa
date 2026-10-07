---
module: pdfLinkAnnot
category: pdf/annot
dependencies: [pdfErrors, pdfParser, pdfAnnot]
returns: object
worker-safe: true
status: complete
---

# pdfLinkAnnot

> Hyperlink — ISO 32000-2 §12.5.6.5.

**Module** `pdfLinkAnnot` | **Source** `packages/front/office/pdf/src/annot/link.js` | **Deps** `pdfErrors`, `pdfParser`, `pdfAnnot` | **Worker-safe** yes

Subtype `/Link`. Subtype-specific entries: `/A` (action — see
[`pdfAction`](../action/action.md)), `/Dest` (destination — see
[`pdfDestination`](../destination/destination.md)), `/H` (highlight mode —
`N`/`I`/`O`/`P`), `/PA` (legacy URI action) and `/QuadPoints` (clickable
regions, multiples of 8 floats §12.5.6.10). `/BS` is part of the base record.
Any other entry lands in `_extras`.

## Resolve

```js
const link = runtime.resolve('pdfLinkAnnot');
// Returns: { typeLinkAnnot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeLinkAnnot` | `(dict) => LinkAnnot` | Base record plus `dest`, `action`, `h`, `pa`, `quadPoints`. |

`/A` is surfaced as `action` (and only when it is a dictionary, not an indirect
reference); `dest` is the raw typed `/Dest` value, left unresolved. `action` and
`dest` are mutually exclusive in practice; the typer does not arbitrate — the
semantic resolver (catalog walker) prioritises `/A`.

## Examples

### Link to a URI

```js
const link = runtime.resolve('pdfLinkAnnot').typeLinkAnnot(dict);
if (link.action) {
    const act = runtime.resolve('pdfAction').typeAction(link.action, typers);
    act.kind === 'URI';
}
```

### Internal link (destination)

```js
if (link.dest) {
    const d = runtime.resolve('pdfDestination')
        .typeDestination(link.dest, catalog.names, resolveRef);
    d.page;
}
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/annot/not-dict` | `ParseError` | Inherited from `typeBaseAnnot`. |
| `pdf/annot/link/bad-subtype` | `ParseError` | `/Subtype` present and not `/Link`. |
| `pdf/annot/link/bad-quadpoints` | `ParseError` | `/QuadPoints` is not an array of numbers. |

## See also

- [`pdfAnnot`](./annot.md)
- [`pdfAction`](../action/action.md) · [`pdfDestination`](../destination/destination.md)
