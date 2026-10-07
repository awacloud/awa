---
module: pdfFilterDispatch
category: pdf/syntax/filters
dependencies: [pdfErrors, pdfFlate, pdfAsciiHex, pdfAscii85, pdfRunLength]
returns: object
worker-safe: true
status: complete
---

# pdfFilterDispatch

> The `/Filter` + `/DecodeParms` chain — ISO 32000-2 §7.4.

**Module** `pdfFilterDispatch` | **Source** `packages/front/office/pdf/src/syntax/filters/dispatch.js` | **Deps** `pdfErrors`, `pdfFlate`, `pdfAsciiHex`, `pdfAscii85`, `pdfRunLength` | **Worker-safe** yes

Reads `/Filter` (a name or an array of names) and applies the decoders **in
order** — the first name is applied first, which is the spec convention and the
reverse of the encoding order. Recognised PDF abbreviations: `Fl`, `AHx`, `A85`,
`RL`, `LZW`, `DCT`, `JPX`, `CCF`. Opaque filters exposed as passthrough:
`DCTDecode`, `JPXDecode`, `Crypt`. Any filter absent from `decoders` raises
`pdf/filter/unsupported`.

`decodeStream` marshals `/DecodeParms` from the typed AST form
(`{type:'dict', entries:{K: {type, value}}}`) to a plain `key → value`
object (reading `entry.value` per key) before handing it to a decoder —
decoders such as `pdfFlate` read plain properties (`params.Predictor`,
`params.Columns`, …), never typed nodes. The three `/DecodeParms` shapes
are all handled: absent (→ `null` params for every filter), a single dict
(→ applies to the first filter only, `null` for the rest, per spec), and
an array parallel to `/Filter` (→ one marshalled dict per filter, `null`
entries preserved).

## Resolve

```js
const dispatch = runtime.resolve('pdfFilterDispatch');
// Returns: { decode, decodeChain, encodeChain, register, names, decoders,
//            normalizeFilterList, applyDecodeChain, applyEncodeChain,
//            decodeStream }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `decode` | `(streamObj: PdfStream) => Uint8Array` | End-to-end decode from the typed stream, against the built-in `decoders`. |
| `decodeChain` | `(bytes, filters: string[], params?: object[]) => Uint8Array` | Explicit decode against the built-in `decoders`. |
| `encodeChain` | `(bytes, filters: string[], params?: object[]) => Uint8Array` | Explicit encode against the built-in `decoders`. |
| `register` | `(name: string, impl: { decode, encode? }) => void` | Adds or replaces a decoder in `decoders`. |
| `names` | `() => string[]` | Lists the currently registered filter names. |
| `decoders` | `object` | The live map itself (escape hatch — mutating it is what `register` does). |
| `normalizeFilterList` | `(filterEntry) => string[]` | Expands abbreviations and returns the canonical name list. Useful to inspect a chain without decoding. |
| `applyDecodeChain` | `(bytes, filters, params, decoders) => Uint8Array` | Lower-level decode against a **caller-supplied** decoder map. |
| `applyEncodeChain` | `(bytes, filters, params, decoders) => Uint8Array` | Lower-level encode against a caller-supplied decoder map. |
| `decodeStream` | `(streamObj, decoders) => Uint8Array` | Lower-level `decode`: reads `/Filter` + `/DecodeParms` off the stream dictionary, then delegates to `applyDecodeChain`. |

`decode`, `decodeChain` and `encodeChain` are thin bindings of the three
lower-level helpers over the module's own `decoders` map; the `apply*`/
`decodeStream` triple is exported so a caller can run a chain against an
isolated map without mutating the shared one.

## Examples

### End-to-end decode

```js
const dispatch = runtime.resolve('pdfFilterDispatch');
const decoded = dispatch.decode(streamObj);   // reads Filter + DecodeParms
```

### Explicit chain

```js
const out = dispatch.decodeChain(bytes, ['ASCII85Decode', 'FlateDecode']);
// Applies ASCII85 then Flate (= array order).
```

### Register a custom decoder (LZW)

```js
const legacy = runtime.resolve('pdfLegacyDeprecatedFilters');
dispatch.register('LZWDecode', {
    decode: (bytes, params) => legacy.lzwDecode(bytes, params),
    encode: (bytes) => legacy.lzwEncode(bytes)
});
```

### Decode against an isolated map

```js
const isolated = { ...dispatch.decoders, DCTDecode: myJpegDecoder };
const out = dispatch.decodeStream(streamObj, isolated);
```

### Inspect a chain without decoding

```js
dispatch.normalizeFilterList(streamObj.dict.entries.Filter);
// ['ASCII85Decode', 'FlateDecode']
```

### List the available filters

```js
dispatch.names();
// ['FlateDecode', 'ASCIIHexDecode', 'ASCII85Decode', 'RunLengthDecode',
//  'DCTDecode', 'JPXDecode', 'Crypt']
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/filter/non-name` | `ParseError` | An entry of the `/Filter` array is not a name. |
| `pdf/filter/bad-type` | `ParseError` | `/Filter` is neither a name nor an array. |
| `pdf/filter/unsupported` | `ParseError` | Filter absent from `decoders`. |
| `pdf/filter/no-encoder` | `ParseError` | `encodeChain` invoked for a filter with no `encode`. |
| `pdf/filter/not-stream` | `ParseError` | `decode()`/`decodeStream()` given something other than a typed stream. |
| `pdf/filter/bad-decodeparms` | `ParseError` | `/DecodeParms` is neither a dict, an array, nor null. |

## See also

- [Filters index](./README.md)
- [`pdfFlate`](./flate.md), [`pdfAsciiHex`](./asciiHex.md), [`pdfAscii85`](./ascii85.md), [`pdfRunLength`](./runLength.md)
- [`pdfObjStream`](../objStream.md), [`pdfCrossRefStream`](../crossRefStream.md) — consumers.
