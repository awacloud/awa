---
module: pdfCrossRefStream
category: pdf/syntax
dependencies: [pdfErrors, pdfParserObj]
returns: object
worker-safe: true
status: complete
---

# pdfCrossRefStream

> Cross-reference stream parser `/Type /XRef` — ISO 32000-2 §7.5.8.

**Module** `pdfCrossRefStream` | **Source** `packages/front/office/pdf/src/syntax/crossRefStream.js` | **Deps** `pdfErrors`, `pdfParserObj` | **Worker-safe** yes

An xref stream replaces the classical `xref` + `trailer` pair (PDF 1.5+). Its
dictionary carries `/Size`, `/W` (3-tuple of field widths in bytes), optionally
`/Index` (pairs `[first count …]`, default `[0 Size]`) and `/Prev`, plus every
trailer entry (`/Root`, `/Info`, `/Encrypt`, `/ID`). The payload encodes one
record per entry: three big-endian fields of the `/W` widths:

| type | f2 | f3 |
|------|----|----|
| 0 | offset of the next free object | gen |
| 1 | byte offset | gen |
| 2 | number of the containing ObjStm | index inside that ObjStm |

A zero width means "default value" (default type = 1). The payload must already
be decoded: [`pdfDocument`](../document/document.md) composes this module and
runs the stream through [`pdfFilterDispatch`](./filters/dispatch.md) first, so
reading a 1.5+ file needs no explicit call. Callers driving the parser on its
own decode `/Filter` themselves.

## Resolve

```js
const xrefStm = runtime.resolve('pdfCrossRefStream');
// Returns: { parseCrossRefStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseCrossRefStream` | `(decoded: Uint8Array, dict: PdfDict) => { entries, size, trailer }` | Xref table plus trailer. |

### Return shape

```js
{
    entries: {
        [num]: {
            type: 0 | 1 | 2,
            offset: number,        // type 1 only — 0 otherwise
            gen: number,           // type 0/1
            free: boolean,
            objStm?: number,       // type 2
            index?: number         // type 2
        }
    },
    size: number,                  // /Size, or the entry count
    trailer: PdfDict               // the dictionary itself (carries /Root /Info …)
}
```

## Examples

### Parse an xref-stream section

```js
const xrefStm = runtime.resolve('pdfCrossRefStream');
const decoded = filterDispatch.decode(streamObj);
const { entries, size, trailer } = xrefStm.parseCrossRefStream(decoded, streamObj.dict);
console.log(size, Object.keys(entries).length);
```

### Resolve a compressed object

```js
const e = entries[12];
if (e.type === 2) {
    const objStmRef = { type: 'ref', num: e.objStm, gen: 0 };
    // → fetch the streamObj at objStmRef, decode, parseObjectStream,
    //   then pick the member at e.index.
}
```

### Non-trivial `/Index`

```js
// dict.entries.Index = array([int(0), int(1), int(10), int(3)])
// → 4 entries in total: num 0, then num 10..12.
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/xrefstm/bad-input` | `ParseError` | `decoded` is not a `Uint8Array`. |
| `pdf/xrefstm/bad-dict` | `ParseError` | `dict` is not a typed dictionary. |
| `pdf/xrefstm/wrong-type` | `ParseError` | `/Type` missing or not `/XRef`. |
| `pdf/xrefstm/bad-W` | `ParseError` | `/W` not an array, or not 3 entries. |
| `pdf/xrefstm/bad-W-entry` | `ParseError` | A `/W` entry is not a non-negative int. |
| `pdf/xrefstm/bad-W-zero` | `ParseError` | The `/W` widths sum to 0. |
| `pdf/xrefstm/bad-Index` | `ParseError` | `/Index` not an array, or odd length. |
| `pdf/xrefstm/bad-Index-entry` | `ParseError` | A `/Index` entry is not an int. |
| `pdf/xrefstm/missing-int` | `ParseError` | `/Size` required and missing. |
| `pdf/xrefstm/truncated` | `ParseError` | Payload too short for the announced entry count. |

## See also

- [`pdfXref`](./xref.md) — classical table §7.5.4.
- [`pdfObjStream`](./objStream.md) — resolves type-2 entries.
- [`pdfTrailer`](./trailer.md) — typing of the trailer dictionary.
- [`pdfDocument`](../document/document.md) — composes this parser in the section walk.
