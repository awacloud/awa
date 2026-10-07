---
module: pdfObjStream
category: pdf/syntax
dependencies: [pdfErrors, pdfParserObj, pdfTokenizer, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfObjStream

> Object-stream parser `/Type /ObjStm` — ISO 32000-2 §7.5.7.

**Module** `pdfObjStream` | **Source** `packages/front/office/pdf/src/syntax/objStream.js` | **Deps** `pdfErrors`, `pdfParserObj`, `pdfTokenizer`, `pdfParser` | **Worker-safe** yes

An object stream is a compressed container holding several non-stream indirect
objects. Its dictionary carries `/N` (object count), `/First` (offset of the
first body inside the decoded payload) and, optionally, `/Extends`. The payload
starts with `N` pairs `<num> <byteOffset>` (offsets relative to `/First`),
followed by the bodies concatenated without `obj`/`endobj`. The generation is
always `0` by spec §7.5.8.4 (compressed objects). The payload must already be
decoded: [`pdfDocument`](../document/document.md) composes this module and runs
the container through [`pdfFilterDispatch`](./filters/dispatch.md) — once per
container per document — so `doc._raw.resolve(ref)` returns a compressed object
like any other indirect. Callers driving the parser on its own apply `/Filter`
(typically Flate) themselves.

## Resolve

```js
const objStm = runtime.resolve('pdfObjStream');
// Returns: { parseObjectStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseObjectStream` | `(decoded: Uint8Array, dict: PdfDict) => Array<{num, gen:0, value}>` | Every member object. |

### `parseObjectStream`

1. Validates `/Type /ObjStm` when present.
2. Reads `/N` and `/First` (required, integers ≥ 0).
3. Tokenises `[0, First[` to recover the `(num, offset)` pairs.
4. Slices each body `[First+off[i], First+off[i+1][` (or to the end for the
   last one) and feeds it to the standard `parseObject`.

Out-of-order or out-of-payload offsets raise `pdf/objstm/bad-offset`.

## Examples

### Parse a freshly inflated ObjStm

```js
const objStm = runtime.resolve('pdfObjStream');
const dict = streamObj.dict;             // { type: 'dict', entries: { Type, N, First, … } }
const decoded = filterDispatch.decode(streamObj);
const members = objStm.parseObjectStream(decoded, dict);
// → [{ num: 5, gen: 0, value: { type: 'dict', entries: { Type: …, Count: … } } }, …]
```

### Feed the members back into a resolver

```js
for (const { num, value } of members) {
    indirects.set(`${num}:0`, { value, offset: -1 });   // -1 → "compressed"
}
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/objstm/bad-input` | `ParseError` | `decoded` is not a `Uint8Array`. |
| `pdf/objstm/bad-dict` | `ParseError` | `dict` is not a typed dictionary. |
| `pdf/objstm/wrong-type` | `ParseError` | `/Type` present but not `/ObjStm`. |
| `pdf/objstm/missing-int` | `ParseError` | `/N` or `/First` missing or not an int. |
| `pdf/objstm/bad-N` | `ParseError` | `/N` negative. |
| `pdf/objstm/bad-First` | `ParseError` | `/First` outside the payload range. |
| `pdf/objstm/bad-pair` | `ParseError` | Malformed `(num, off)` header pair. |
| `pdf/objstm/bad-offset` | `ParseError` | Member offset out of range. |

## See also

- [`pdfCrossRefStream`](./crossRefStream.md) — points at ObjStm members (type 2).
- [`pdfParser`](./parser.md) — consumed for each body.
- [`pdfFilterDispatch`](./filters/dispatch.md) — mandatory `/Filter` decode beforehand.
