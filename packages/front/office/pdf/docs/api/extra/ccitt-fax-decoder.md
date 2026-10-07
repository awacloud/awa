---
module: pdfCcittFaxDecoder
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfCcittFaxDecoder

> CCITTFaxDecode codec (ITU-T T.4 / T.6), full Group 3/Group 4 read + write.

**Module** `pdfCcittFaxDecoder` | **Source** `packages/front/office/pdf/src/extra/ccitt-fax-decoder.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Implements the CCITT Group 3/Group 4 fax codec referenced by `/Filter /CCITTFaxDecode` (ISO 32000-2 §7.4.6): `K < 0` selects Group 4 (T.6, pure 2D coding), `K == 0` selects Group 3 one-dimensional (T.4 baseline, white/black run Huffman), `K > 0` selects Group 3 mixed 1D/2D (T.4 with a K-row block and a tag bit). Output is a packed bitstream of `Columns` bits per row, MSB-first, with polarity following `/BlackIs1` (default: white = 1). This is the real decoder that [`pdfLegacyDeprecatedFilters`](./legacy-deprecated-filters.md)'s `ccittFaxDecode` delegates to after validating `DecodeParms`; it is registered directly in `src/main.js#extras` and can also be resolved and used standalone.

## Resolve

```js
const ext = runtime.resolve('pdfCcittFaxDecoder');
// Returns: { decode, encode, _internals }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(bytes: Uint8Array, parms: { Columns, Rows?, K?, EndOfLine?, EncodedByteAlign?, BlackIs1?, DamagedRowsBeforeError?, EndOfBlock? }) => Uint8Array` | Packed bitstream, `Columns`-bits-per-row, MSB-first. |
| `encode` | `(lines: Uint8Array[], parms?: { Columns?, K?, EndOfLine?, EncodedByteAlign?, EndOfBlock? }) => Uint8Array` | Encodes an array of one-byte-per-pixel rows (0=white, 1=black) into a CCITT bitstream, including RTC (G3) / EOFB (G4) terminators. |
| `_internals` | object | Test/introspection surface: `{ WHITE_MAP, BLACK_MAP, MODE_CODES, EOL_BITS, codeForRun, encode1DLine, encode2DLine, decode1DLine, decode2DLine, makeBitReader, makeBitWriter, findB1, findNextChange, findChangeFrom }`. Not part of the stable public contract. |

## Examples

### Decode a Group 4 stream

```js
const ext = runtime.resolve('pdfCcittFaxDecoder');
const bits = ext.decode(streamBytes, { K: -1, Columns: 1728, Rows: 100 });
// bits.length === Math.ceil(1728 / 8) * 100
```

### Round-trip encode then decode

```js
const rows = [ new Uint8Array(1728), new Uint8Array(1728) ]; // all-white
const encoded = ext.encode(rows, { Columns: 1728, K: -1 });
const decoded = ext.decode(encoded, { Columns: 1728, Rows: rows.length, K: -1 });
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/ccitt/bad-input` | `ParseError` | `bytes` is not a Uint8Array. |
| `pdf/ccitt/bad-columns` | `ParseError` | `Columns` is `<= 0` or `> 65535`. |
| `pdf/ccitt/bad-runcode` | `ParseError` | An unrecognized white/black run-length code is read. |
| `pdf/ccitt/bad-2d-mode` | `ParseError` | An unrecognized 2D mode code is read. |
| `pdf/ccitt/unsupported-2d-mode` | `ParseError` | A resolved 2D mode has no vertical-offset handling (defensive). |
| `pdf/ccitt/truncated` | `ParseError` | Stream ends mid-line and `DamagedRowsBeforeError` does not tolerate it. |
| `pdf/ccitt/decode-failed` | `ParseError` | Any other decode-time error, wrapped with `cause`. |

`encode` does not throw a validated-input error of its own; malformed `lines`/`parms` produce best-effort output.

## Notes

- The encoder side is production-grade (greedy make-up code choice, `EncodedByteAlign` padding, RTC/EOFB terminators, full 2D state machine) even though the module is filed as a "legacy read" extra alongside [`pdfLegacyDeprecatedFilters`](./legacy-deprecated-filters.md) — it is exercised by that module's `ccittFaxDecode`/`validateCcittParms` pair but is independently usable.
- Rows tolerant of damage (`DamagedRowsBeforeError > 0`) are filled with a blank (all-white) row instead of throwing.

## See also

- [`pdfLegacyDeprecatedFilters`](./legacy-deprecated-filters.md)
- [`pdfFilters`](../syntax/filters/README.md)
- [Extras index](./README.md)
