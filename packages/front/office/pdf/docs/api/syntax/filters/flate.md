---
module: pdfFlate
category: pdf/syntax/filters
dependencies: [pdfErrors, zlib]
returns: object
worker-safe: true
status: complete
---

# pdfFlate

> `FlateDecode` ISO 32000-2 §7.4.4 — wrapper over `@awacloud/fw` zlib (RFC 1950), with predictors.

**Module** `pdfFlate` | **Source** `packages/front/office/pdf/src/syntax/filters/flate.js` | **Deps** `pdfErrors`, `zlib` (`@awacloud/fw/io/compress/zlib`) | **Worker-safe** yes

PDF `FlateDecode` is full zlib framing (CMF/FLG header + deflate payload +
Adler32 trailer). The raw compression is delegated to `@awacloud/fw`'s `zlib` module,
which produces and consumes exactly that format.

**`/DecodeParms /Predictor` is handled here**, in both directions:

| `Predictor` | Meaning |
|-------------|---------|
| `1` | None (default) |
| `2` | TIFF Predictor 2 — requires `BitsPerComponent = 8` |
| `10`–`14` | PNG None / Sub / Up / Average / Paeth, per row |
| `15` | PNG optimum — the encoder picks per row; the decoder reads the tag byte either way |

`Columns`, `Colors` and `BitsPerComponent` are read alongside `Predictor`
(defaults `1`, `1`, `8`) and accepted in both the PDF spelling (`Predictor`,
`Columns`, …) and the lowercase spelling (`predictor`, `columns`, …).

## Resolve

```js
const flate = runtime.resolve('pdfFlate');
// Returns: { decode, encode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(bytes: Uint8Array, params?: object) => Uint8Array` | Inflated payload, un-predicted when `params` requests it; the decoded prefix, flagged `truncated`, for a stream that ends before its final block. |
| `encode` | `(bytes: Uint8Array, params?: object) => Uint8Array` | Predicted (when requested) then zlib-deflated payload. |

`params` is optional: omit it, or leave `Predictor` at `1`, and the byte stream
is passed through the raw zlib codec untouched.

## Truncated streams

Some producers write `FlateDecode` streams whose deflate data ends before the
final block — the input runs out mid-stream, though `/Length` is exact.
Viewers display what decodes, and so does `decode`: when the strict inflate
fails only because the input ended before the final block, the payload is
decoded again through fw's streaming decoder (`UnzlibStream`, without the
end-of-input signal) and the bytes decoded so far are returned.

- The returned `Uint8Array` carries a **non-enumerable** own property
  `truncated: true`. It is invisible to `Object.keys`, spread and deep
  equality, so callers that ignore it see an ordinary byte array; callers
  that care test `out.truncated === true`. A complete stream never carries it.
- With a `Predictor`, only the **whole** predicted rows of the prefix are
  decoded (a trailing partial row is dropped), so a truncated image or xref
  stream does not fail with `pdf/flate/png-row-mismatch`. A complete stream
  keeps the strict row check.
- The streaming decoder holds back the last 4 input bytes as a presumed
  Adler-32 trailer, so the recovered prefix can stop a few bytes short of
  everything the input encodes.

Everything else still throws `pdf/flate/inflate-failed`: a bad zlib header,
an invalid block type, length or distance, a stream truncated inside its
header, and a truncated stream from which nothing could be decoded. The
error's `cause` is the original strict-inflate error.

```js
const out = flate.decode(streamObj.raw);
if (out.truncated) {
    // a decoded prefix — the stream ended before its final deflate block
}
```

## Examples

### Decode a Flate stream

```js
const flate = runtime.resolve('pdfFlate');
const decoded = flate.decode(streamObj.raw);
```

### Decode with a PNG predictor

```js
const decoded = flate.decode(streamObj.raw, {
    Predictor: 12, Columns: 5, Colors: 1, BitsPerComponent: 8
});
```

### Round trip

```js
const enc = new TextEncoder().encode('hello, pdf');
const compressed = flate.encode(enc);
const back = flate.decode(compressed);
new TextDecoder().decode(back);   // 'hello, pdf'
```

### Through the dispatch

```js
const dispatch = runtime.resolve('pdfFilterDispatch');
const out = dispatch.decode(streamObj);  // resolves /Filter and /DecodeParms
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/flate/missing-fw` | `ParseError` | Factory invoked without the `@awacloud/fw` zlib module (no `zlibSync`/`unzlibSync`). |
| `pdf/flate/bad-input` | `ParseError` | Argument is not a `Uint8Array`. |
| `pdf/flate/inflate-failed` | `ParseError` | `unzlibSync` threw — corrupt or non-zlib payload, or a truncated stream from which nothing could be decoded (see [Truncated streams](#truncated-streams)). `cause` is the original error. |
| `pdf/flate/deflate-failed` | `ParseError` | `zlibSync` threw. |
| `pdf/flate/bad-predictor` | `ParseError` | `Predictor` outside `{1, 2, 10..15}`. |
| `pdf/flate/bad-predictor-params` | `ParseError` | `Columns`, `Colors` or `BitsPerComponent` ≤ 0. |
| `pdf/flate/bad-png-filter` | `ParseError` | Row tag byte outside `0..4`. |
| `pdf/flate/tiff-bpc-unsupported` | `ParseError` | TIFF Predictor 2 with `BitsPerComponent ≠ 8`. |
| `pdf/flate/png-row-mismatch` | `ParseError` | Payload length of a complete stream not a whole number of predicted rows. |

## See also

- [`pdfFilterDispatch`](./dispatch.md) — filter orchestrator.
- [Filters index](./README.md)
- [`pdfObjStream`](../objStream.md) — typical consumer (ObjStm streams are almost always Flate-encoded).
