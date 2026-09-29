---
module: brotliShared
category: io/compress
dependencies: [brotli, brotliDict, brotliDictWords]
returns: object
worker-safe: true
status: complete
---

# brotliShared

> RFC 9841 (Shared Brotli) extensions on top of the RFC 7932 codec.

**Module** `brotliShared` | **Source** `packages/front/fw/src/io/compress/brotli_shared.js` | **Deps** `brotli`, `brotliDict`, `brotliDictWords` | **Worker-safe** yes

RFC 9841 companion to [`brotli`](./brotli.md). Adds user-facing support for large window mode (§6), shared LZ77 dictionary (§3.2), multi-dict + context map custom static dictionaries (§3.1) and the Shared Dictionary Stream parser (§5). The codec engine remains single: this module translates its public options into `opts._ext` (private extension channel) and delegates to `brotli`.

## Resolve

```js
const bs = runtime.resolve('brotliShared');
// Returns: { brotliCompressSync, brotliDecompressSync, brotliCompress,
//             brotliDecompress, BrotliCompressStream, BrotliDecompressStream,
//             parseSharedDictionary }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `brotliCompressSync` | `(data: Uint8Array, opts?) => Uint8Array` | Compression — accepts RFC 9841 options |
| `brotliDecompressSync` | `(buf: Uint8Array, opts?) => Uint8Array` | Decompression — accepts `allowLargeWindow` + `sharedDictionary` |
| `brotliCompress` | `(data, opts?) => Promise<Uint8Array>` | Async variant |
| `brotliDecompress` | `(buf, opts?) => Promise<Uint8Array>` | Async variant |
| `BrotliCompressStream` | `new (opts?, ondata) => instance` | Streaming compressor |
| `BrotliDecompressStream` | `new (opts?, ondata) => instance` | Streaming decompressor |
| `parseSharedDictionary` | `(buf: Uint8Array) => ParsedDict` | RFC 9841 §5 parser — see below |

### RFC 9841 options

| Option | Type | Description |
|--------|------|-------------|
| `allowLargeWindow` | `boolean` | Enables large window mode §6 (WBITS 10..62). Without this option, a large-window prefix is rejected with `EBADSTREAM`. WBITS ≤ 50 uses Number, WBITS 51..62 uses BigInt for distance-decode. |
| `windowBits` | `number` (10..62) | Encoder-side WBITS (default `22`). For `wb > 24`, automatically enables the RFC 9841 §6 large-window prefix. |
| `sharedDictionary` | `object` | Either `{ lz77: Uint8Array }` (raw LZ77 dict, §3.2), or the result of `parseSharedDictionary(buf)` (full dict §3.1 + §3.2). Encoder-side: virtual prefix on the input + custom-dict scan (Identity transforms, NUM_DICTIONARIES = 1). Decoder-side: `wordLists` / `transformLists` / `contextMap` consulted for dict-refs (multi-dict supported). |

### `parseSharedDictionary(buf)`

Decodes the RFC 9841 §5 "shared dictionary" container format. The result is directly usable as `opts.sharedDictionary`.

```ts
{
    lz77Dict: Uint8Array | null,
    wordLists: Array<{ sizeBits, offsets, words }>,
    transformLists: Array<{ stringlets, transforms }>,
    dictionaryMap: Array<{ wordListIdx, transformListIdx }> | null,
    contextMap: Uint8Array(64) | null,
    bytesConsumed: number,
}
```

Throws `EBADARG` if the argument is not a `Uint8Array`. Throws `EBADSTREAM` on invalid signature (expected: `0x91 0x00`), corrupt varint, out-of-range lengths or out-of-bounds indices.

## RFC 9841 coverage

| Section | Decoder | Encoder |
|---------|---------|---------|
| §3.1 Custom static dictionary (multi-dict + context map + ShiftFirst/All) | ✅ | ✅ (NUM_DICTIONARIES=1, Identity transforms) |
| §3.2 Shared LZ77 dictionary | ✅ | ✅ |
| §5  Shared Dictionary Stream parser (`parseSharedDictionary`) | ✅ | n/a |
| §6  Large window mode WBITS 10..50 (Number-safe) | ✅ | ✅ |
| §6  Large window mode WBITS 51..62 (BigInt distance-decode) | ✅ | ✅ |
| §8  Framing format | see [`brotliFrame`](./brotli_frame.md) | — |

## Examples

### Decompressing a large-window stream

```js
const bs = runtime.resolve('brotliShared');
const dec = bs.brotliDecompressSync(streamBytes, { allowLargeWindow: true });
```

### Round-trip with a shared LZ77 dictionary

```js
const bs = runtime.resolve('brotliShared');

const dict = new TextEncoder().encode('the quick brown fox jumps over the lazy dog');
const data = new TextEncoder().encode('the quick brown fox ran');

const enc = bs.brotliCompressSync(data, { sharedDictionary: { lz77: dict } });
const dec = bs.brotliDecompressSync(enc, { sharedDictionary: { lz77: dict } });
new TextDecoder().decode(dec);                  // 'the quick brown fox ran'
```

### Container §5 → decompression with a custom dict

```js
const bs = runtime.resolve('brotliShared');

const parsed = bs.parseSharedDictionary(containerBytes);
const decoded = bs.brotliDecompressSync(streamBytes, { sharedDictionary: parsed });
```

## Why a separate module

RFC 9841 is a **strict extension** of RFC 7932 — all valid RFC 9841 streams begin with a WBITS prefix that is forbidden in RFC 7932 (or use an API-side opt-in option). The separation:

- reduces the RFC 7932 codec surface (`brotli.test.js` exercises only the base);
- avoids importing the ~250 lines of §5 parser for consumers that do not need it;
- clarifies spec boundaries for audits and tests.

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const bs = libs.brotliShared;
        const parsed = bs.parseSharedDictionary(args[0]);
        const out = bs.brotliDecompressSync(args[1], { sharedDictionary: parsed });
        self.postMessage(out, [out.buffer]);
    },
    {
        dependencies: ['brotli', 'brotliShared', 'brotliDict', 'brotliDictWords'],
        args: [containerBytes, streamBytes],
    }
);
```

## Notes

- The `opts._ext` channel consumed by `brotli` is internal — `brotliShared` is the only site that constructs it (`_buildExt(opts)`). Do not manipulate it directly from application code.
- `_makeResolveStaticDictRef(customDict)` captures the multi-dict + contextMap configuration in a closure passed as a hook to the decoder. Resolution iterates in the order `[contextMap[cidL], 0, 1, ...]` (the context-pointed dict comes first).
- WBITS 51..62 requires BigInt for distance arithmetic and a chunked buffer (Uint8Array caps at 4 GiB) — remains out of scope.
- `_internal` exposes the helpers `ferment`, `shiftStep`, `shiftAddend`, `shiftFirst`, `shiftAll`, `applyCustomTransform`, `customLookupWord` for tests and tooling. Same conventions as `brotli._internal`.
- Tests: 14 cases (`parseSharedDictionary` happy/error paths + codec wrappers + `sharedDictionary` integration + large-window round-trips).

## See also

- [brotli](./brotli.md) — underlying RFC 7932 codec
- [brotliFrame](./brotli_frame.md) — RFC 9841 §8 framing format parser
- [brotliDict](./brotli_dict.md) — RFC 7932 tables + transforms (reused by §3.1)
- [brotliDictWords](./brotli_dict_words.md) — static dictionary blob
