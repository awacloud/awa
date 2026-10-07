# Filters — ISO 32000-2 §7.4

The `/Filter` + `/DecodeParms` chain on streams. Every filter exposes
`{ decode, encode }`.

| Module | PDF filter | Abbrev. | Spec | Deps |
|--------|------------|---------|------|------|
| [`pdfFlate`](./flate.md) | `FlateDecode` | `Fl` | §7.4.4 | `pdfErrors`, `zlib` (`@awacloud/fw`) |
| [`pdfAsciiHex`](./asciiHex.md) | `ASCIIHexDecode` | `AHx` | §7.4.2 | `pdfErrors` |
| [`pdfAscii85`](./ascii85.md) | `ASCII85Decode` | `A85` | §7.4.3 | `pdfErrors` |
| [`pdfRunLength`](./runLength.md) | `RunLengthDecode` | `RL` | §7.4.5 | `pdfErrors` |
| [`pdfFilterDispatch`](./dispatch.md) | orchestrator | — | §7.4 | `pdfErrors` + the four above |

## Coverage (decode / encode)

The table below describes the `decoders` map that `pdfFilterDispatch` ships out
of the box.

| Filter | decode | encode | Notes |
|--------|--------|--------|-------|
| `FlateDecode` | yes | yes | `/Predictor` 1, 2 and 10–15 supported in both directions. |
| `ASCIIHexDecode` | yes | yes | Encodes uppercase, wraps every 32 bytes. |
| `ASCII85Decode` | yes | yes | Handles `z` and `~>`. |
| `RunLengthDecode` | yes | yes | Greedy encoder. |
| `DCTDecode` | passthrough | passthrough | The PDF stores the raw JPEG bytes. |
| `JPXDecode` | passthrough | passthrough | Raw JPEG 2000. |
| `Crypt` | passthrough | passthrough | Real handling lives in the [crypto layer](../../crypto/README.md). |
| `LZWDecode` | not registered | — | An implementation exists on the [`pdfLegacyDeprecatedFilters`](../../extra/legacy-deprecated-filters.md) extra (`lzwDecode`/`lzwEncode`, over `@awacloud/fw/io/compress/lzw`). |
| `CCITTFaxDecode` | not registered | — | Implementations exist on `pdfCcittFaxDecoder` and on `pdfLegacyDeprecatedFilters` (`ccittFaxDecode`). |
| `JBIG2Decode` | not registered | — | Header-only support on the [`pdfJbig2Read`](../../extra/jbig2-read.md) extra. |

No extra auto-registers itself into the dispatch map: wire the ones you need
with `dispatch.register(name, impl)` — see [`pdfFilterDispatch`](./dispatch.md).

`Fl`, `AHx`, `A85`, `RL`, `LZW`, `DCT`, `JPX` and `CCF` are recognised as
abbreviations and expanded to the full filter name before dispatch — so an
unregistered `LZW` raises `pdf/filter/unsupported` under the name `LZWDecode`.

## Common pattern

```js
const dispatch = runtime.resolve('pdfFilterDispatch');
const decoded = dispatch.decode(streamObj);
```

## See also

- [Syntax layer](../README.md)
- [`pdfObjStream`](../objStream.md) — decoding is mandatory before parsing.
- [`pdfCrossRefStream`](../crossRefStream.md) — likewise.
