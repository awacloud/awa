---
module: pdfTrailer
category: pdf/syntax
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfTrailer

> Typing of the trailer dictionary, ISO 32000-2 §7.5.5 — `{ size, root, info?, prev?, id?, encrypt? }`.

**Module** `pdfTrailer` | **Source** `packages/front/office/pdf/src/syntax/trailer.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

A thin layer over the raw trailer dictionary. It checks the **required** entries
(`/Size`, `/Root`) and extracts the well-defined optional ones. `/Encrypt` is
left raw (a reference is narrowed to `{num, gen}`, an inline dictionary is passed
through). Entries this typer does not model — `/XRefStm` for hybrid-reference
files among them — are reachable only through `raw`.

## Resolve

```js
const trailer = runtime.resolve('pdfTrailer');
// Returns: { typeTrailer }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeTrailer` | `(dict: PdfDict) => TypedTrailer` | Typed record (see shape). |

### `TypedTrailer` shape

```js
{
    size:    number,                              // /Size — required
    root:    { num: number, gen: number },        // /Root — required
    info?:   { num: number, gen: number },        // /Info — only when a ref
    id?:     [Uint8Array, Uint8Array],            // /ID — pair of strings
    prev?:   number,                              // /Prev — previous xref offset
    encrypt?: { num, gen } | PdfObject,           // /Encrypt — ref or inline dict
    raw:     PdfDict                              // the original dictionary
}
```

## Examples

### Plain typing

```js
const xref = runtime.resolve('pdfXref');
const trailer = runtime.resolve('pdfTrailer');

const { dict } = xref.parseTrailerDict(bytes, end);
const t = trailer.typeTrailer(dict);
t.size;          // 42
t.root;          // { num: 1, gen: 0 }
t.prev;          // 12345 (on an incremental update)
```

### Detecting an encrypted file

```js
if (t.encrypt) {
    const sec = runtime.resolve('pdfSecurity');
    // → see the crypto layer
}
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/trailer/not-dict` | `ParseError` | Argument is not `{type:'dict'}`. |
| `pdf/trailer/missing-size` | `ParseError` | `/Size` missing or not a non-negative int. |
| `pdf/trailer/missing-root` | `ParseError` | `/Root` missing or not a reference. |

## See also

- [`pdfXref`](./xref.md) — produces the raw dictionary consumed here.
- [`pdfDocument`](../document/document.md) — chains trailers through `/Prev`.
- [`pdfErrors`](../errors.md)
