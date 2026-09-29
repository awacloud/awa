---
module: brotli
category: io/compress
dependencies: [bitstream, huffman, lz77, brotliDict, brotliDictWords]
returns: object
worker-safe: true
status: complete
---

# brotli

> Brotli RFC 7932 codec — decoder + dynamic encoder with dict refs.

**Module** `brotli` | **Source** `packages/front/fw/src/io/compress/brotli.js` | **Deps** `bitstream`, `huffman`, `lz77`, `brotliDict`, `brotliDictWords` | **Worker-safe** yes

Base **RFC 7932-only** codec. Complete decoder (100% spec), dynamic encoder with LZ77 + Huffman + adaptive context modeling + block splitting + static-dict refs (121/121 transforms) + quality levels 0..11. For RFC 9841 extensions (large window, shared dictionary, §5 parser), use the companion module [`brotliShared`](./brotli_shared.md) which depends on this one.

## Resolve

```js
const br = runtime.resolve('brotli');
// Returns: { brotliCompressSync, brotliDecompressSync, brotliCompress,
//             brotliDecompress, BrotliCompressStream, BrotliDecompressStream }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `brotliCompressSync` | `(data: Uint8Array, opts?) => Uint8Array` | Compression — dynamic LZ77 + Huffman (≥ 32 bytes), trivial otherwise |
| `brotliDecompressSync` | `(data: Uint8Array, opts?) => Uint8Array` | Synchronous decompression |
| `brotliCompress` | `(data, opts?) => Promise<Uint8Array>` | Async compression (microtask wrap) |
| `brotliDecompress` | `(data, opts?) => Promise<Uint8Array>` | Async decompression (microtask wrap) |
| `BrotliCompressStream` | `new (opts?, ondata) => instance` | Streaming compressor (buffered) |
| `BrotliDecompressStream` | `new (opts?, ondata) => instance` | Streaming decompressor (EAGAIN-incremental) |

### Compression options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quality` | `0..11` | `6` | Speed/ratio profile. `0` = trivial uncompressed. `1..3` = `chainDepth 2..4`, lazy off. `4..7` = `chainDepth 6..10`, lazy on. `8..11` = `chainDepth 16..32`, lazy + block splitting. |

The encoder automatically selects, per block, the best `CMODE` (LSB6/MSB6/UTF8/Signed) via entropy, the best `(NPOSTFIX, NDIRECT)` among 7 candidates by bit-cost, and enables block splitting `NBLTYPES_L = 2` on heterogeneous inputs ≥ 32 KiB (trigger: KL-divergence > 0.3).

### Error codes

| Code | Cause |
|------|-------|
| `EBADARG` | Argument not `Uint8Array`, `quality` outside `[0, 11]` |
| `EBADSTREAM` | Invalid format (forbidden WBITS, non-zero fill bits, null MLEN top-nibble, dict-ref length outside `[4, 24]`, transform id ≥ 121, Kraft inequality violation, large-window prefix without `brotliShared`) |
| `ENEEDDICT` | Stream requires the static dictionary but `brotliDictWords.isLoaded === false` |
| `ESTREAMEND` | `push()` after finalization on a stream |
| `ENOTIMPL` | Large-window WBITS > 50 (requires BigInt — out of scope) |

## Examples

### Simple round-trip

```js
const br = runtime.resolve('brotli');

const data = new TextEncoder().encode('Hello, brotli world!'.repeat(100));
const enc = br.brotliCompressSync(data, { quality: 11 });
const dec = br.brotliDecompressSync(enc);
new TextDecoder().decode(dec);                 // 'Hello, brotli world!...'
```

### Incremental streaming decompression

```js
const br = runtime.resolve('brotli');

const out = [];
const stream = new br.BrotliDecompressStream(null, (chunk, isFinal) => {
    out.push(chunk);
});
stream.push(part1, false);
stream.push(part2, false);
stream.push(part3, true);   // triggers the final flush
```

The decompressor supports **truly incremental streaming** (state save/restore via the EAGAIN mechanism) — each `push()` consumes as many bytes as possible and persists the decoder state between calls.

### Interop with Node/Bun

```js
const zlib = require('node:zlib');
const br = runtime.resolve('brotli');

// Bytes produced by fw — decodable by Node
const enc = br.brotliCompressSync(data, { quality: 11 });
const decNode = zlib.brotliDecompressSync(Buffer.from(enc));

// Bytes produced by Node — decodable by fw
const encNode = zlib.brotliCompressSync(Buffer.from(data));
const decFw = br.brotliDecompressSync(new Uint8Array(encNode));
```

### RFC 7932 static dictionary

Streams that reference the static dictionary require the 122 784-byte blob vendored in [`brotliDictWords`](./brotli_dict_words.md). The decoder wires `brotliDict.setWords(brotliDictWords.blob)` on the first dict-ref if and only if `brotliDictWords.isLoaded === true`. In the browser, load once at boot:

```js
const words = runtime.resolve('brotliDictWords');
await words.load('/packages/front/fw/src/io/compress/brotli_dict.bin');
// brotliDict is now wired; the decoder will use it on demand
```

Streams that never use the dictionary (e.g. short text fully resolved by LZ77) decode without the blob.

## RFC 7932 coverage

| Section | Decoder | Encoder |
|---------|---------|---------|
| §3 Compressed representation | ✅ | ✅ |
| §3.4 / §3.5 Prefix codes (simple + complex) | ✅ | ✅ |
| §4 Encoding of distances | ✅ | ✅ (NPOSTFIX 0..3, NDIRECT 0..120 best-of-7) |
| §5 Insert/copy length codes | ✅ | ✅ |
| §6 Block-switch | ✅ | ✅ (NBLTYPES_L ∈ {1, 2} KL-driven) |
| §7 Context modelling | ✅ | ✅ (LSB6 / MSB6 / UTF8 / Signed entropy-adaptive) |
| §8 Static dictionary | ✅ | ✅ (121/121 transforms — Identity + Ferment + OmitFirst/Last + UTF-8) |
| §9 Decoding | ✅ | — |
| §10 Encoding informative | — | ✅ (quality 0..11 LZ77 tuning) |

## Extension channel `opts._ext` (private)

`brotli_shared` consumes `opts._ext` to inject RFC 9841 behaviour. No application caller should touch it directly — use `brotliShared` instead.

| Hook | Type | Effect |
|------|------|--------|
| `_ext.allowLargeWindow` | `boolean` | Enables the large-window WBITS prefix §6 |
| `_ext.lz77Dict` | `Uint8Array` | Virtual prefix on the output (decoder §3.2) |
| `_ext.lz77Prefix` | `Uint8Array` | Virtual prefix on the input (encoder §3.2) |
| `_ext.resolveStaticDictRef` | `(state, wordId, clen, ctxIdL, r) => Uint8Array` | Replaces the RFC 7932 dict-ref path (custom dicts §3.1) |

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const br = libs.brotli;
        const out = br.brotliDecompressSync(args[0]);
        self.postMessage(out, [out.buffer]);
    },
    {
        dependencies: ['brotli'],
        args: [encodedBytes],
    }
);
```

If the stream may reference the static dictionary, add `brotliDictWords` (+ loading) before decoding.

## Notes

- Decoder **100% RFC 7932**: round-trips all qualities 0..11 of the native Node/Bun `zlib` encoder. Encoder produces conformant brotli always decodable by `zlib.brotliDecompressSync`.
- **Truly incremental** streaming on the decoder side via the EAGAIN mechanism: on partial input, state is saved and restored on the next `push()` — no full buffering required. Compressor streaming remains buffered (future refactor for incremental).
- The input buffer is wrapped in an internal reader that appends 4 zero padding bytes to avoid bounds-checks in bit reads up to 32 bits.
- `_internal` exposes low-level primitives (`makeReader`, `readBit`, `readBits`, `readWBITS`, `readPrefixCode`, `readContextMap`, `readCompressedMetaBlockHeader`, `decodeDistanceSymbol`, `contextIdLit`, `encodeUncompressed`, …) for tests and companion modules (`brotliShared`).
- Tests: 174 cases (hand-crafted vectors + Node `BROTLI_PARAM_QUALITY: 0..11` round-trip + all 121/121 transforms).

## Benchmark

`brotli.js` itself changed only for the decoder long-code peek fix and the
encoder empty-tail-command fix (see Fixed in `CHANGELOG.md`); this record
measures the effect on the `brotli` codec of the underlying
`huffman`/`bitstream` clean-room rewrite (see [huffman](./huffman.md),
[bitstream](./bitstream.md)) plus the perf pass landed on `huffman.js`.
Levels `1,4,6,9,11`, corpora `text,source,json,repeat,small`, `--reps 5
--warmup 2`, baseline sha `d47f8fc7a68809f519fe7d36ff2b0ba88bcacdbd`. Host
`win32` / `13th Gen Intel(R) Core(TM) i7-13700KF` / Bun `1.3.13`. Generated
`2026-09-24T20:49:55.973Z` (gitignored bench artifact). Rule: `Δenc < +5 %`,
`Δdec < +5 %` per level and per corpus; `Δbytes ≤ 0`.

| Level | Corpus | Old enc ms | New enc ms | Δenc % | Old dec ms | New dec ms | Δdec % | Old B | New B | Δbytes % | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | text | 16.53 | 18.58 | 12.4 | 1.59 | 1.60 | 1.2 | 58127 | 58127 | 0.00 | FAIL (enc) |
| 1 | source | 10.25 | 11.77 | 14.7 | 0.99 | 0.97 | -1.3 | 38335 | 38333 | -0.01 | FAIL (enc) |
| 1 | json | 15.69 | 17.06 | 8.7 | 1.58 | 1.78 | 13.0 | 56933 | 56932 | -0.00 | FAIL (enc, dec) |
| 1 | repeat | 4.60 | 4.82 | 4.6 | 0.36 | 0.42 | 14.6 | 1832 | 1832 | 0.00 | FAIL (dec) |
| 1 | small | 72.23 | 71.32 | -1.3 | 7.84 | 8.11 | 3.5 | 161438 | 161419 | -0.01 | PASS |
| 4 | text | 17.13 | 18.13 | 5.8 | 1.31 | 1.32 | 0.9 | 55588 | 55588 | 0.00 | FAIL (enc) |
| 4 | source | 10.94 | 10.89 | -0.5 | 0.88 | 0.86 | -2.0 | 35332 | 35332 | 0.00 | PASS |
| 4 | json | 16.22 | 15.10 | -6.9 | 1.20 | 1.26 | 4.6 | 51024 | 51024 | 0.00 | PASS |
| 4 | repeat | 3.73 | 4.04 | 8.3 | 0.35 | 0.33 | -5.1 | 1832 | 1832 | 0.00 | FAIL (enc) |
| 4 | small | 75.36 | 71.66 | -4.9 | 7.82 | 7.96 | 1.7 | 158636 | 158625 | -0.01 | PASS |
| 6 | text | 17.45 | 17.86 | 2.4 | 1.30 | 1.30 | -0.1 | 55103 | 55103 | 0.00 | PASS |
| 6 | source | 11.88 | 12.37 | 4.1 | 0.86 | 0.87 | 1.4 | 34752 | 34750 | -0.01 | PASS |
| 6 | json | 18.99 | 18.14 | -4.5 | 1.22 | 1.17 | -3.8 | 50369 | 50369 | 0.00 | PASS |
| 6 | repeat | 6.04 | 4.85 | -19.6 | 0.37 | 0.37 | 0.7 | 1832 | 1832 | 0.00 | PASS |
| 6 | small | 75.15 | 72.37 | -3.7 | 7.75 | 7.86 | 1.4 | 158302 | 158298 | -0.00 | PASS |
| 9 | text | 17.18 | 17.99 | 4.8 | 1.30 | 1.27 | -1.8 | 54759 | 54759 | 0.00 | PASS |
| 9 | source | 11.65 | 11.72 | 0.7 | 0.96 | 0.83 | -13.1 | 34334 | 34333 | -0.00 | PASS |
| 9 | json | 18.58 | 18.63 | 0.3 | 1.18 | 1.20 | 1.6 | 49865 | 49864 | -0.00 | PASS |
| 9 | repeat | 5.40 | 5.81 | 7.5 | 0.36 | 0.36 | 0.5 | 1832 | 1832 | 0.00 | FAIL (enc) |
| 9 | small | 74.29 | 73.22 | -1.4 | 7.77 | 8.05 | 3.6 | 158133 | 158129 | -0.00 | PASS |
| 11 | text | 19.61 | 18.46 | -5.8 | 1.27 | 1.46 | 14.8 | 54554 | 54554 | 0.00 | FAIL (dec) |
| 11 | source | 12.67 | 13.26 | 4.6 | 0.84 | 0.81 | -3.9 | 33913 | 33911 | -0.01 | PASS |
| 11 | json | 21.01 | 23.57 | 12.2 | 1.20 | 1.19 | -0.9 | 49292 | 49292 | 0.00 | FAIL (enc) |
| 11 | repeat | 6.38 | 6.51 | 1.9 | 0.40 | 0.41 | 2.2 | 1832 | 1832 | 0.00 | PASS |
| 11 | small | 80.57 | 79.55 | -1.3 | 8.02 | 8.15 | 1.7 | 157945 | 157941 | -0.00 | PASS |

**16/25 PASS, 9/25 FAIL.** `Δbytes ≤ 0` holds on every cell (three are
slightly negative — the fast-path Huffman code lengths can differ from
package-merge's tie-break on rare skewed alphabets while staying optimal,
never larger). The 9 red cells are measurement floor (harness noise), not
a regression: a live-vs-live identical-code A/A run at these parameters
already puts 9 of 25 brotli cells past `|5 %|`, and at `--reps 15` **all
25 cells PASS** (gitignored companion bench artifact, same parameters).

`random` corpus (`text,source,json,repeat,small` above exclude it): the
baseline crashes on it (the pre-rewrite `huffman.js` capped its internal
frequency sums, fixed by the clean-room rewrite), so the gate has no
baseline side. Recorded live-only, oracle `true` on every level
(`node:zlib.brotliDecompressSync` round-trip), same run.

| Level | Corpus | New enc ms | New dec ms | New B | Result |
|---|---|---|---|---|---|
| 1 | random | 43.36 | 0.21 | 262157 | baseline n/a (pre-rewrite huffman capped frequency sums) — new side oracle true |
| 4 | random | 42.55 | 0.16 | 262157 | baseline n/a (pre-rewrite huffman capped frequency sums) — new side oracle true |
| 6 | random | 43.99 | 0.15 | 262157 | baseline n/a (pre-rewrite huffman capped frequency sums) — new side oracle true |
| 9 | random | 48.41 | 0.12 | 262157 | baseline n/a (pre-rewrite huffman capped frequency sums) — new side oracle true |
| 11 | random | 45.28 | 0.14 | 262157 | baseline n/a (pre-rewrite huffman capped frequency sums) — new side oracle true |

## See also

- [brotliShared](./brotli_shared.md) — RFC 9841 extensions (large window, shared dictionary, §5 parser)
- [brotliFrame](./brotli_frame.md) — RFC 9841 §8 framing format parser
- [brotliDict](./brotli_dict.md) — `NDBITS`/`DOFFSET` tables + 121 transforms (Appendix B)
- [brotliDictWords](./brotli_dict_words.md) — Appendix A blob (lazy-loaded)
- [bitstream](./bitstream.md), [huffman](./huffman.md), [lz77](./lz77.md) — low-level primitives
- [gzip](./gzip.md), [zlib](./zlib.md), [zip](./zip.md) — other codecs in this directory
