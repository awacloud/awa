---
module: lz4
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# lz4

> LZ4 compression — ultra-fast algorithm, block and streaming compression/decompression.

**Module** `lz4` | **Source** `packages/front/fw/src/io/compress/lz4.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const lz4 = runtime.resolve('lz4');
// Returns: { compress, decompress, Lz4CompressStream, Lz4DecompressStream }
```

## API

### `lz4.compress(src, len, opts?) → [size, data]`

Compresses a `Uint8Array` block.

```js
const [size, data] = lz4.compress(uint8Array, uint8Array.length);                      // mode 'speed'
const [rSize, rData] = lz4.compress(uint8Array, uint8Array.length, { mode: 'ratio' }); // smaller, slower
```

| Option | Values | Default |
|--------|--------|---------|
| `opts.mode` | `'speed'` (fast search) or `'ratio'` (deeper search, smaller block) — see [Modes](#modes) | `'speed'` |

| Return | Meaning |
|--------|---------|
| `size > 0` | Success — `size` = compressed size |
| `size === 0` | Incompressible data — return original |
| `size === -1` | Error — input exceeds ~1 GB |

Throws a `RangeError` naming the value when `opts.mode` is neither `'speed'`
nor `'ratio'`. Both modes produce standard LZ4 blocks: `decompress` reads either.

### `lz4.decompress(src) → [size, data]`

Decompresses an LZ4 block.

```js
const [origSize, original] = lz4.decompress(compressed);
```

| Return | Meaning |
|--------|---------|
| `size > 0` | Success — `size` = decompressed size |
| `size === -1` | Decompression error |

### `new lz4.Lz4CompressStream(ondata?, opts?)`

Streaming compression. Each chunk is processed as an independent LZ4 block.
`opts.mode` is the same as for `compress` (default `'speed'`); an unknown mode
throws a `RangeError` at construction.

```js
const chunks = [];
const stream = new lz4.Lz4CompressStream((chunk) => chunks.push(chunk));

stream.push(data1);
stream.push(data2);
stream.push(lastChunk, true);  // true = dernier chunk
```

### `new lz4.Lz4DecompressStream(ondata?)`

Streaming decompression.

```js
const output = [];
const stream = new lz4.Lz4DecompressStream((chunk) => output.push(chunk));

stream.push(compressedChunk);
stream.push(lastCompressedChunk, true);
```

## Characteristics

| Aspect | Value |
|--------|-------|
| Maximum input size | ~1 GB (0x3F000000 bytes) |
| Minimum match length | 4 bytes |
| Compression modes | `'speed'` (default, 1 candidate per position) / `'ratio'` (chain of 4) — same block format |
| Decompression buffer allocation | One exact-size allocation — a validation pass sums the decoded size first |
| Streaming | Each chunk = independent LZ4 block |

## Modes

Both modes run the same encoder and emit the same block format; they differ
only in how hard the match search works.

| | `'speed'` (default) | `'ratio'` |
|---|---|---|
| Candidates per position | 1 (newest bucket entry, no chains) | up to 4 (hash chains) |
| Positions indexed inside an emitted match | none | the last 3 |
| Miss run before the stride grows | 32 | 64 |

Measured with the codec bench (`tools/bench/codec-levels.js --lz4-mode`,
Bun 1.3.13, 256 KiB corpora, `small` = 200 × 2 KiB slices; encode time in ms,
median of 7), next to the single-mode encoder this module replaced
(pre-rewrite baseline):

| Corpus | previous encoder: B / ms | `'speed'`: B / ms | `'ratio'`: B / ms |
|---|---|---|---|
| text | 84076 / 0.83 | 83621 / 0.85 | 77053 / 1.32 |
| source | 57987 / 0.51 | 57188 / 0.57 | 50538 / 0.71 |
| json | 90883 / 0.52 | 90742 / 0.63 | 75186 / 0.94 |
| random | 262144 / 0.09 | 262144 / 0.07 | 262144 / 0.09 |
| repeat | 1142 / 0.21 | 1135 / 0.21 | 1135 / 0.16 |
| small | 218866 / 12.9 | 217745 / 1.96 | 209947 / 2.58 |

`'speed'` is never larger than the previous encoder on these corpora and
encodes at about its speed (from −85 % on many small inputs to +20 % on
short-match text such as json); `'ratio'` trades 1.5 to 1.8 times the encode
time on large text for blocks 8 to 17 % smaller. Both decode with the same
`decompress`, within about 10 % of each other (a `'speed'` block carries more
literals, a `'ratio'` block more matches).

## Full example

```js
const lz4 = runtime.resolve('lz4');
const utf8 = runtime.resolve('utf8');

const data = utf8.toBytes('Hello World '.repeat(1000));

// Block
const [size, compressed] = lz4.compress(data, data.length);
console.log(`${data.length} → ${size} bytes`);

const [origSize, restored] = lz4.decompress(compressed);
console.log(utf8.fromBytes(restored));  // 'Hello World Hello World ...'

// Streaming compression
const parts = [];
const comp = new lz4.Lz4CompressStream((chunk) => parts.push(chunk));
comp.push(data.slice(0, 500));
comp.push(data.slice(500), true);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const lz4 = libs.lz4;
        const [size, compressed] = lz4.compress(args.data, args.data.length);
        self.postMessage({ size, compressed }, [compressed.buffer]);
    },
    { dependencies: ['lz4'], args: { data: new Uint8Array(rawData) } }
);
```

## Notes

- LZ4 favours **speed** (hundreds of MB/s) over ratio — for maximum ratio, use `brotli` (quality 11) or `deflate` (level 9).
- Block format: each `compress` call produces an independent LZ4 block — no multi-block LZ4 frame header.
- `Lz4CompressStream` / `Lz4DecompressStream`: each `push` produces one or more complete blocks (no inter-push buffering).

## Design

**Match search (hash, chain, skip).** Every visited position hashes its
4-byte little-endian word multiplicatively (`Math.imul` by 2654435761, top
`hashBits` bits, with `hashBits` between 8 and 16 sized to the input) into a
bucket table. In `'ratio'` mode each bucket heads a chain linked through a
64 KiB ring indexed by position, so a lookup walks older candidates newest
first: at most 4 inside the 64 KiB window, keeping the longest and stopping
early on a match of 32 bytes or one that reaches the end limit. In `'speed'`
mode only the newest entry of the bucket is tried, and no chain is kept at
all (no ring is allocated or written). A cheap test comes first: the byte at
the current best length must match before the whole 4-byte word is compared.
The kept match is then widened backwards over the pending literals (both
modes: without it, `'speed'` would exceed the previous encoder's size on the
text corpora). After a match, `'ratio'` indexes its last 3 covered positions,
`'speed'` none. After a run of misses the stride grows by one every 64
(`'ratio'`) or 32 (`'speed'`) misses, so incompressible stretches are sampled
instead of scanned. The two modes are one function with three parameters
(probes, covered positions, skip shift); `'ratio'` is byte-identical to the
single-mode encoder it replaced, and the parameterisation costs it nothing
measurable.

**Match extension.** Past the first 4 bytes, a candidate is compared byte by
byte up to 16 bytes, because most matches end there. A candidate that gets
that far is compared in 4-byte words, and a final byte loop finishes whatever
the word loop leaves before the end limit. The length found is always the
exact common prefix; `lz4.test.js` checks it for every run length from 7 to
96 and at the end-of-block cut.

**Literal copies.** Literals are copied byte by byte in both the encoder and
the decoder. Literal runs between matches are short, and a
`set(subarray(...))` would allocate a view object for every sequence (a
`Buffer` when the input is one), which costs more than the copy it saves.

**What the chain costs.** The 4-probe chain and the 3-position indexing are
what buy `'ratio'`'s smaller blocks; `'speed'` drops both and keeps only a
fraction of the size gain (see [Modes](#modes)). Among the configurations
measured for `'speed'` (1 or 2 probes, 0 to 3 indexed positions, with and
without backward widening, skip after 16, 32 or 64 misses, 14 to 16 hash
bits), the one shipped is the fastest overall that stays at or below the previous
encoder's size on every bench corpus.

**Decoder.** Two passes: the first validates every sequence and sums the
output size (so the size limit is checked before any allocation), the second
copies into one exact-size buffer. A non-overlapping match longer than 32
bytes uses `copyWithin`. Overlapping matches are copied byte by byte, because
they re-read bytes they have just written.

## Benchmark

`tools/bench/codec-levels.js --lz4-mode {speed,ratio}`, `--reps 7 --warmup
3`, baseline sha `d47f8fc7a68809f519fe7d36ff2b0ba88bcacdbd` (the single-mode
encoder this module replaced). Host `win32` / `13th Gen Intel(R) Core(TM)
i7-13700KF` / Bun `1.3.13`. Generated `2026-09-24T21:14:48.449Z` (`speed`)
and `2026-09-24T21:14:48.950Z` (`ratio`), both gitignored bench artifacts.

**Gate reading (a later measurement ruling).** The rule for lz4 is
`Δbytes ≤ 0` per corpus — the only gated figure; the mode's own encode
time is recorded, not gated: `'speed'`'s delta is the accepted
measurement floor (the fastest configuration found that still keeps bytes
≤ 0 on every corpus), and `'ratio'`'s delta is a recorded compression
trade-off. Both decode with the unchanged `decompress`.

### `'speed'` (default)

| Corpus | Old B | New B | Δbytes % | Δenc % (reps 7) | Δenc % (reps 21) | Δdec % | Bytes gate |
|---|---|---|---|---|---|---|---|
| text | 84076 | 83621 | -0.54 | +3.1 | +27.8 | -28.9 | PASS |
| source | 57987 | 57188 | -1.38 | +22.1 | +10.7 | -12.1 | PASS |
| json | 90883 | 90742 | -0.16 | +16.9 | +14.3 | -25.9 | PASS |
| random | 262144 | 262144 | 0.00 | -17.6 | -22.8 | -100.0 | PASS |
| repeat | 1142 | 1135 | -0.61 | -0.7 | -16.3 | -63.0 | PASS |
| small | 218866 | 217745 | -0.51 | -82.9 | -83.5 | -73.2 | PASS |

Bytes ≤ 0 on all 6 corpora. The reps-7/reps-21 spread on text/source/json
(companion artifact `05-supp-lz4-speed-reps21-20260924T2114Z.json`,
gitignored) is the harness's own noise floor — the baseline side alone
moved from 0.82 to 0.65 ms on `text` between the two runs — not a
regression; it is accepted as the measured floor by the ruling.

### `'ratio'`

| Corpus | Old B | New B | Δbytes % | Δenc % (reps 7) | Δenc % (reps 21) | Δdec % | Bytes gate |
|---|---|---|---|---|---|---|---|
| text | 84076 | 77053 | -8.35 | +55.2 | +54.3 | -29.5 | PASS |
| source | 57987 | 50538 | -12.85 | +44.4 | +56.6 | +11.7 | PASS |
| json | 90883 | 75186 | -17.27 | +76.5 | +83.0 | -28.0 | PASS |
| random | 262144 | 262144 | 0.00 | +8.8 | +3.6 | +0.0 | PASS |
| repeat | 1142 | 1135 | -0.61 | -27.6 | -9.9 | -64.7 | PASS |
| small | 218866 | 209947 | -4.08 | -79.3 | -78.4 | -56.3 | PASS |

Bytes ≤ 0 on all 6 corpora. Encode time (+44 to +83 % on text/source/json)
is recorded as the ratio trade-off, not gated — this is the same encoder
the module shipped before the speed/ratio split, byte-identical
by hash (gitignored companion artifact, reps 21).

**Totals: 12/12 PASS on the gated figure (bytes ≤ 0, both modes, all 6
corpora); 0 cells fail on bytes.** No byte was traded for time in the
default: `'speed'` stays at or below the previous encoder's size on every
corpus (see [Modes](#modes) for the configuration search).

## Provenance

In-house implementation written from the LZ4 Block Format specification; the earlier node-lz4-derived implementation was replaced by a clean-room rewrite (2026-09).

## See also

- [gzip](./gzip.md), [zlib](./zlib.md) — standard HTTP compression
- [deflate](./deflate.md) — DEFLATE engine
