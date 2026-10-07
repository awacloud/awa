---
module: pdfLegacyDeprecatedFilters
category: pdf/extra
dependencies: [pdfErrors, lzw, pdfCcittFaxDecoder]
returns: object
worker-safe: true
status: complete
---

# pdfLegacyDeprecatedFilters

> LZWDecode (via fw) + CCITTFax (via `pdfCcittFaxDecoder`) + DCT/JPX passthrough — legacy.

**Module** `pdfLegacyDeprecatedFilters` | **Source** `packages/front/office/pdf/src/extra/legacy-deprecated-filters.js` | **Deps** `pdfErrors`, `lzw` (fw binding), `pdfCcittFaxDecoder` | **Worker-safe** yes

Read side of three legacy filters. LZWDecode = wrapper over `@awacloud/fw/io/compress/lzw` (TIFF profile, MSB-first, 8-bit min, CLEAR/END), supports `/EarlyChange`. CCITTFaxDecode validates the `DecodeParms` shape and then delegates the actual Group 3/Group 4 decode to the [`pdfCcittFaxDecoder`](./ccitt-fax-decoder.md) dependency — this module is a thin, validated pass-through, not a decoder itself. DCTDecode/JPXDecode are signature-checked passthroughs (JPEG/JPX bytes returned unchanged).

## Resolve

```js
const ext = runtime.resolve('pdfLegacyDeprecatedFilters');
// Returns: { lzwDecode, lzwEncode, validateCcittParms, ccittFaxDecode,
//   dctDecode, jpxDecode, CCITT_KEYS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `lzwDecode` | `(bytes, decodeParms?) => Uint8Array` | TIFF-profile LZW decode. |
| `lzwEncode` | `(bytes) => Uint8Array` | TIFF-profile LZW encode. |
| `validateCcittParms` | `(parms) => NormalizedParms` | Validates and normalizes the CCITT `DecodeParms` shape. |
| `ccittFaxDecode` | `(bytes, decodeParms) => Uint8Array` | Validates parms then calls `pdfCcittFaxDecoder.decode(bytes, parms)`. |
| `dctDecode` | `(bytes) => Uint8Array` | Checks the JPEG SOI marker, then passthrough. |
| `jpxDecode` | `(bytes) => Uint8Array` | Checks the JP2/codestream signature, then passthrough. |
| `CCITT_KEYS` | `Set` | Accepted CCITT `DecodeParms` keys (`K`, `EndOfLine`, `EncodedByteAlign`, `Columns`, `Rows`, `EndOfBlock`, `BlackIs1`, `DamagedRowsBeforeError`). |

## Examples

### LZW decode

```js
const ext = runtime.resolve('pdfLegacyDeprecatedFilters');
const plain = ext.lzwDecode(streamBytes, { EarlyChange: 1 });
```

### CCITT parms validation + decode

```js
const p = ext.validateCcittParms({ K: -1, Columns: 1728, Rows: 100 });
p.K;        // -1 (Group 4)
p.Columns;  // 1728

const image = ext.ccittFaxDecode(streamBytes, { K: -1, Columns: 1728, Rows: 100 });
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/filters/missing-lzw` | `ParseError` | The `lzw` fw dependency has no `decode`/`encode`. |
| `pdf/filters/missing-ccitt` | `ParseError` | The `pdfCcittFaxDecoder` dependency has no `decode`. |
| `pdf/filters/bad-input` | `ParseError` | bytes is not a Uint8Array. |
| `pdf/lzw/bad-earlychange` | `ParseError` | `/EarlyChange` is not 0 or 1. |
| `pdf/lzw/decode-failed` | `ParseError` | The fw decode threw. |
| `pdf/lzw/encode-failed` | `ParseError` | The fw encode threw. |
| `pdf/ccitt/bad-parms` | `ParseError` | parms is not an object. |
| `pdf/ccitt/unknown-parm` | `ParseError` | A key outside `CCITT_KEYS`. |
| `pdf/dct/bad-soi` | `ParseError` | JPEG SOI marker absent. |
| `pdf/jpx/bad-signature` | `ParseError` | Not a recognized JPEG 2000 codestream or JP2 box stream. |

Actual T.4/T.6 decode failures (truncation, unrecognized codes) surface through `pdfCcittFaxDecoder`'s own error codes (see that page) — this module does not wrap or rename them.

## See also

- [`pdfCcittFaxDecoder`](./ccitt-fax-decoder.md)
- [`pdfFilters`](../syntax/filters/README.md)
- [Extras index](./README.md)
