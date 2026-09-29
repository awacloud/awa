---
module: deflate
category: io/compress
dependencies: [bitstream, huffman, lz77]
returns: object
worker-safe: true
status: complete
---

# deflate

> DEFLATE compression (RFC 1951) — LZ77 + Huffman coding. Internal engine used by `gzip`, `zlib`, and `zip`.

**Module** `deflate` | **Source** `packages/front/fw/src/io/compress/deflate.js` | **Deps** `bitstream`, `huffman`, `lz77` | **Worker-safe** yes

## Resolve

```js
const deflate = runtime.resolve('deflate');
// Returns: { deflateSync, inflateSync, deflate, inflate, DeflateStream, InflateStream }
```

## API

### Synchrone

```js
const compressed   = deflate.deflateSync(uint8Array, opts?);  // → Uint8Array
const decompressed = deflate.inflateSync(compressed, opts?);  // → Uint8Array
```

### Asynchrone

```js
const compressed   = await deflate.deflate(uint8Array, opts?);  // → Uint8Array
const decompressed = await deflate.inflate(compressed, opts?);  // → Uint8Array
```

The async API uses `queueMicrotask` — it does not block the thread but is not multi-threaded.

### Streaming — compression (deflate)

```js
const chunks = [];
const stream = new deflate.DeflateStream(opts?, (chunk) => chunks.push(chunk));

stream.push(data1);
stream.push(data2);
stream.flush();              // flushes the buffer without finalizing
stream.push(lastChunk, true); // finalizes the stream
```

### Streaming — decompression (inflate)

```js
const output = [];
const stream = new deflate.InflateStream(opts?, (chunk) => output.push(chunk));

stream.push(compressedChunk);
stream.push(lastChunk, true);
```

## Options

### Compression

| Option | Type | Description |
|--------|------|-------------|
| `level` | `0–9` | Compression level (0 = store, 9 = max). Default: 6 |
| `mem` | `0–12` | Hash-table width for the LZ77 scan, `min(22, 12 + mem)` bits (not a window/search-depth size). Default: unset — width tracks input size, `clamp(ceil(log2(inputLength)), 12, 20)` |
| `lazy` | `boolean` | Lazy matching in the LZ77 scan: a better ratio (about −0.7 % bytes at levels 8–9) for a slower scan at levels 4–9. Default: `false` — the fast path. See [Design › Encoder](#encoder) |
| `dictionary` | `Uint8Array` | Pre-compression dictionary |

The same options reach `deflate` through `gzip`, `zlib` and `zip`, so
`gzipSync(data, { level: 9, lazy: true })` is the maximum-ratio request.

### Decompression

| Option | Type | Description |
|--------|------|-------------|
| `out` | `Uint8Array` | Pre-allocated output buffer |
| `dictionary` | `Uint8Array` | Dictionary matching the compression |

## Error codes

Every error thrown by this module is an `Error` carrying a numeric `e.code`.
The table lists the complete set — verified against the `fail()` call sites in
`deflate.js`.

| Code | Message | Raised when |
|------|---------|-------------|
| 0 | `unexpected EOF` | the input ends inside a block header, a symbol, or a stored body (one-shot decoding, or a stream closed with `final = true`) |
| 1 | `invalid block type` | `BTYPE = 3` (RFC 1951 §3.2.3 reserved value) |
| 2 | `invalid length/literal` | a literal/length code has no entry in the active table, or a length symbol above 285 is read |
| 3 | `invalid distance` | a distance code has no entry, a distance symbol above 29 is read, or the distance reaches back before the start of the output (dictionary included) |
| 4 | `stream finished` | `push()` after the chunk marked `final` |
| 5 | `no stream handler` | `push()` on a stream constructed without `ondata` |
| 8 | `invalid data` | a malformed dynamic header, a stored-block `LEN`/`NLEN` mismatch, or an overflow of the caller-provided `out` buffer (the message states which) |

Codes 12 and 13 belong to [gzip](./gzip.md) and [zip](./zip.md); `deflate`
never emits them.

## Design

### Decoder

The decoder (`inflateSync`, `inflate`, `InflateStream`) is written from
RFC 1951 and shares its derived tables with the encoder below.

**Tables.** Nothing is transcribed by hand. `LENGTH_EXTRA` / `LENGTH_BASE`
(symbols 257–285) and `DIST_EXTRA` / `DIST_BASE` (symbols 0–29) are derived at
factory time from the RFC §3.2.5 formulas — `extra(i) = i < 8 || i === 28 ? 0
: (i - 4) >> 2` for lengths, `extra(i) = i < 4 ? 0 : (i - 2) >> 1` for
distances — with the bases accumulated from 3 and 1 respectively and the
single special case `LENGTH_BASE[28] = 258`. `CODE_LENGTH_ORDER` (§3.2.7) and
the fixed code lengths (§3.2.6: 8/9/7/8 for the literal code, a flat 5 for the
30 usable distance codes) follow the same rule. The decode tables come from
the shared `huffman.buildMap(lengths, maxBits, 1)` primitive: an entry is
`(symbol << 4) | codeLength`, indexed by the next `maxBits` bits read
LSB-first, and entry `0` means "no code here". `deflate.test.js` re-derives
each table from the RFC formulas, compares it with the RFC tables transcribed
literally, and decodes a hand-assembled vector per length and per distance
symbol at both ends of its range.

**Block state machine.** A decoder state — `bitPos`, `finalBlock`, `phase`,
`storedRemaining`, the two tables and their widths, `out` / `outLen` /
`emitted` — moves between four phases: `HEADER` reads `BFINAL` + `BTYPE` and
the per-type preamble (stored `LEN`/`NLEN`, the fixed tables, or the dynamic
header of §3.2.7); `STORED` copies the body of a `BTYPE = 0` block, resuming a
partial copy; `CODES` decodes literal/length and distance symbols until
end-of-block; `DONE` is reached when the final block ends.

**Resumability.** `bitstream.readBits` pads reads past the end of the buffer
with zeros, so an overrun is detected by POSITION, never by an exception:
`bitPos` is snapshotted before each block header and before each symbol, and a
read that lands past `input.length * 8` — or a table lookup that returns entry
`0` while fewer than `maxBits` bits remain — restores the snapshot. In
one-shot mode that condition fails with code 0; in stream mode it returns
"need input", `InflateStream` keeps the bytes from the last consumed byte
boundary, and the next `push` re-reads from the snapshot (a partially read
dynamic header is simply re-parsed, which is bounded by the header size).
After each push only the last 32 KiB of output are retained as the
back-reference window.

**Output growth.** Without `opts.out` the buffer starts at
`max(64 KiB, 3 × input.length)` and doubles on demand; the result is a
copy trimmed to the exact length. With `opts.out` the decoder writes directly
into the caller's buffer, returns a view into it, and raises code 8 rather
than growing. `opts.dictionary` primes the output with the dictionary's last
32 KiB so back-references into it are ordinary in-buffer copies; combined with
`opts.out`, decoding runs in an internal buffer and the payload alone is
copied across at the end.

**Known limitation.** An over-subscribed or incomplete dynamic Huffman code is
not validated when the header is read. Such a stream is not silently accepted:
decoding proceeds and ends in code 2, code 3 or code 8 as soon as a hole in
the table is hit.

### Encoder

The compressor (`deflateSync`, `deflate`, `DeflateStream`) is written from
RFC 1951 as well. Its matching pass is the shared [lz77](./lz77.md) module —
`deflate` owns only the DEFLATE-specific parts: the symbol mapping of §3.2.5,
the block-type decision, and the canonical Huffman coding of §3.2.6/§3.2.7.

**Matching.** `lz77.encodeTokens` is called once per compression unit with
`windowBits: 15`, `minMatch: 3`, `maxMatch: 258` and an injected `hashFn` —
the 3-byte Fibonacci hash
`imul(d[i] | d[i+1] << 8 | d[i+2] << 16, 0x9E3779B1) >>> (32 - hashBits)`,
i.e. exactly the bytes that define a minimum-length match, and with the
`chainSkip` walk on. Search effort per level, as shipped (zlib's shape for
`chainDepth` / `niceLength` / `goodLength` / `maxLazy`):

| Level | `chainDepth` | `niceLength` | `goodLength` | `maxLazy` |
|---|---|---|---|---|
| 0 | — | — | — | — (stored blocks only, no `lz77` call) |
| 1 | 4 | 8 | — | — |
| 2 | 8 | 16 | — | — |
| 3 | 16 | 32 | — | — |
| 4 | 16 | 16 | 4 | 4 |
| 5 | 32 | 32 | 8 | 16 |
| 6 | 128 | 128 | 8 | 16 |
| 7 | 256 | 128 | 8 | 32 |
| 8 | 1024 | 258 | 32 | 128 |
| 9 | 4096 | 258 | 32 | 258 |

`level` defaults to 6 and is clamped to `0..9`. No level turns lazy
matching on: `goodLength` / `maxLazy` (levels 1–3: the `lz77` defaults)
only act under the `lazy` option below.

**Lazy matching is an option, not a level.** `{ lazy: true }` enables
`lz77`'s lazy probe at every level ≥ 1 — the same engine with one more
probe per match, throttled by the level's `goodLength` / `maxLazy`. It is
what buys the ratio (−0.67 % bytes at levels 8–9 on the bench corpora, and
better than zlib on the text corpus) and what costs the time (+18 % at
level 8, +90 % on the JSON corpus). The default stays the fast
configuration because that is the one that meets the batch's `< +5 %`
time gate at every level. Measured on the option-vs-separate-path
question: the `lazy` test is taken once per match, on a hoisted local,
and an interleaved A/B of the shipped scanner against the same file with
the lazy branch deleted gives an aggregate Δ of +0.1 % / +1.5 % / +0.5 %
(levels 1 / 4 / 8) in one load order and −1.1 % / +0.2 % / −1.0 % in the
other — noise, so one loop and one option rather than two scan functions.

**`mem` → `hashBits`.** With `mem` given, the hash table is
`min(22, 12 + mem)` bits wide; without it the width tracks the input size,
`clamp(ceil(log2(inputLength)), 12, 20)`.

**Blocks and cost.** The scan of a compression unit is one
`lz77.encodeTokens` call whose packed `(len | 0, dist | byte)` pairs are
read in place: a block is a window `[from, to)` of 16 384 tokens over that
buffer, tallied in one pass into the literal/length and distance
frequencies and the total of extra bits, then written; the tail block
carries `BFINAL`. The pairs are never copied into a second layout. For each
block three exact bit costs are computed and the cheapest wins:

| Type | Cost |
|---|---|
| stored (§3.2.4) | `8 × (5 + n) + align`, only when `n ≤ 65535` |
| fixed (§3.2.6) | `3 + Σ litFreq·fixedLitLen + Σ distFreq·5 + extraBits` |
| dynamic (§3.2.7) | `3 + 14 + 3·HCLEN + Σ clFreq·clLen + clExtra + Σ litFreq·litLen + Σ distFreq·distLen + extraBits` |

Trees come from `huffman.buildTree(freqs, 15)` (7 for the code-length code)
and codes from `huffman.buildMap(lengths, maxBits, 0)`, which are already
bit-reversed for `bitstream.writeBits`. A block with no distance token is
written with `HDIST = 1` and a single distance length of zero, as §3.2.7
allows. The dynamic form is skipped when the literal/length or code-length
code would hold a single symbol: that code is incomplete, which §3.2.7
tolerates only for distances. An empty input is therefore one empty final
fixed block — the two bytes `03 00`.

`BLOCK_TOKENS` stays at 16 384: `huffman.buildTree` uses a frequency
sentinel of 25 001, so a block's symbol total must stay below it.

**Memory.** The token buffer is the encoder's working set: `deflateSync`
on N bytes holds an `Int32Array` of `2 × N` entries — 8 bytes per input
byte — until it returns (up to 8 MiB of it is kept between calls as a
scratch buffer; larger ones are transient). `DeflateStream` compresses in
64 KiB units and stays bounded. A resumable scanner filling a fixed
`BLOCK_TOKENS` buffer would remove this and is the recorded follow-up.

**Streaming.** `DeflateStream` keeps the last 32 KiB of input as a window and
buffers pushes until 64 KiB or `final`, then compresses `window ++ pending`
with `start = window.length`. Whole bytes go out through `ondata`; a trailing
partial byte stays in the carry and opens the next unit, so `flush()` never
forces byte alignment. The contract is that the **concatenation** of every
`ondata` chunk is one valid raw DEFLATE stream — where the chunk boundaries
fall is not part of it, and they differ from the pre-batch engine's.

## Benchmark

Final gate record on the merged tree (task 03 + the perf landing), full
baseline sha `b10c8a6da43e8c598645d097a678c38249ddebbc` (`git merge-base
master HEAD`), with the batch's exact command:

```
bun packages/front/fw/tools/bench/deflate-levels.js \
    --baseline b10c8a6da43e8c598645d097a678c38249ddebbc --reps 7 --warmup 3 \
    --json tmp/bench/04-final-20260905T105342Z.json
```

Host: `win32` / `13th Gen Intel(R) Core(TM) i7-13700KF` / Bun `1.3.13`.
Six deterministic corpora (`text` = the RFC 7932 dictionary blob,
`source` = `brotli.js`, `json`, `random`, `repeat`, `small` = 200 × 2 KiB
calls), levels 1–9, median of 7 timed reps after 3 warm-ups. Artifact
`tmp/bench/04-final-20260905T105342Z.json` (gitignored), generated
`2026-09-05T10:53:48.246Z`. Every output of both engines round-trips
through our `inflateSync`, and the fw test suite cross-checks the same
corpora against `node:zlib`. Δ is `new` against `old`; a negative Δtime
is faster. The ruled gate is `Δtime < +5 %` per level, with a proposed
ratio tolerance of `Δratio ≤ +1 %`.

### Default configuration (shipped table, `lazy` off)

| Level | Old ms | New ms | Δtime % | Old bytes | New bytes | Δratio % | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | 27.01 | 22.86 | **−15.3 %** | 577 206 | 574 443 | −0.48 % | PASS |
| 2 | 26.15 | 23.03 | **−11.9 %** | 567 921 | 567 269 | −0.11 % | PASS |
| 3 | 26.73 | 22.38 | **−16.3 %** | 564 084 | 562 905 | −0.21 % | PASS |
| 4 | 29.23 | 26.24 | **−10.2 %** | 561 392 | 564 059 | +0.48 % | PASS |
| 5 | 28.20 | 22.84 | **−19.0 %** | 560 089 | 560 350 | +0.05 % | PASS |
| 6 | 31.48 | 25.10 | **−20.2 %** | 557 944 | 558 319 | +0.07 % | PASS |
| 7 | 33.80 | 26.66 | **−21.1 %** | 557 528 | 557 952 | +0.08 % | PASS |
| 8 | 35.16 | 27.51 | **−21.8 %** | 557 337 | 557 772 | +0.08 % | PASS |
| 9 | 40.24 | 28.13 | **−30.1 %** | 557 334 | 557 766 | +0.08 % | PASS |

All nine levels **PASS** both thresholds: Δtime is negative (faster) at
every level and Δratio stays within ±1 % (better than the baseline at
levels 1–3, at parity elsewhere — the largest regression is +0.48 % at
level 4). Per corpus, the persistent residual is the incompressible
`random` corpus (+13 … +53 % in this run — the known fixed per-position
cost of the generic scanner over an engine that inlines its probe, the
analysis' fix 7, deliberately not taken); `repeat` is the biggest winner
at −46 … −56 %.

**Measurement caveat.** Individual per-corpus cells of this sequential
harness move by up to ±30–50 % between runs on this host, in both
directions — the aggregate per level, not any single cell, is what the
gate reads. The `text` corpus at level 4 is a reproducible instance of
this (this run: old 2.79 ms / new 3.82 ms, a cell Δtime of +37 %, while
the level's aggregate is still −10.2 %): an earlier interleaved-repetition
investigation traced it to a JIT-state carry-over that appears only when the `repeat`
corpus runs immediately before `text` in the same process at level 4,
disappears when level 4 runs alone or in a directory-to-directory
interleaved comparison — there this engine is byte-identical to the
analysis' `p6nl` prototype at every cell and within ±1 % of its time — and
is unrelated to the engine change. Read the aggregates, not the cells; a
finer per-corpus verdict needs interleaved A/B repetitions (backlog item
proposed in the perf-landing session, not yet filed as this task's
perimeter excludes the bench tool).

### `{ lazy: true }` (same engine, lazy matching on) — supplementary, not gated

Measured separately by the perf-landing session at `--warmup 15 --reps 11`
(not re-run by this task: the batch gate covers only the default
configuration above).

| Level | Old ms | New ms | Δtime | Old bytes | New bytes | Δbytes |
|---|---|---|---|---|---|---|
| 1 | 25.03 | 21.40 | −14.5 % | 577 206 | 570 076 | **−1.24 %** |
| 2 | 30.04 | 23.15 | −22.9 % | 567 921 | 561 810 | **−1.08 %** |
| 3 | 26.82 | 26.02 | −3.0 % | 564 084 | 557 766 | **−1.12 %** |
| 4 | 27.75 | 24.22 | −12.7 % | 561 392 | 563 035 | +0.29 % |
| 5 | 28.43 | 25.71 | −9.6 % | 560 089 | 556 986 | **−0.55 %** |
| 6 | 31.13 | 28.18 | −9.5 % | 557 944 | 555 149 | **−0.50 %** |
| 7 | 32.67 | 31.93 | −2.3 % | 557 528 | 554 208 | **−0.60 %** |
| 8 | 35.61 | 43.72 | +22.8 % | 557 337 | 553 585 | **−0.67 %** |
| 9 | 40.61 | 46.73 | +15.1 % | 557 334 | 553 579 | **−0.67 %** |

Lazy matching is where the ratio comes from — and where the time goes at
the two top levels: `json` +85 … +91 %, `text` +38 … +40 %, `source`
+6 … −13 %, `small` −9 … −14 %. At level 9 with `lazy` the `text` corpus
compresses to 58 286 bytes, below zlib's 59 319 at its level 9; at
level 4 the zlib-shaped table (`maxLazy 4`) gives up ratio on `json`
(+4.5 %) for a −13 % time, the trade the analysis flagged and the owner
accepted.

Artifacts of the `lazy` run: `tmp/bench/04-default.{json,md}` and
`tmp/bench/04-lazy.{json,md}` (gitignored). Re-run with
`bun packages/front/fw/tools/bench/deflate-levels.js --baseline b10c8a6da43e8c598645d097a678c38249ddebbc --warmup 15 --reps 11 [--opts '{"lazy":true}']`.
The gate table above (default configuration) was re-run for this record
with the batch's own `--reps 7 --warmup 3`; artifact
`tmp/bench/04-final-20260905T105342Z.json` (gitignored).

### Clean-room huffman/bitstream rewrite (2026-09)

`deflate.js` itself is unchanged by the clean-room rewrite; this record
measures the effect on the `deflate` codec of the underlying
`huffman`/`bitstream` clean-room rewrite (see [huffman](./huffman.md),
[bitstream](./bitstream.md)) plus the perf pass landed on `huffman.js`
(two-queue fast path ahead of package-merge). Same six corpora and levels
1-9, `--reps 7 --warmup 3`, baseline sha
`d47f8fc7a68809f519fe7d36ff2b0ba88bcacdbd` (`git merge-base master HEAD`
taken before the rewrite). Host `win32` / `13th Gen Intel(R) Core(TM)
i7-13700KF` / Bun `1.3.13`. Generated `2026-09-24T20:49:44.085Z`
(gitignored bench artifact). Rule: `Δenc < +5 %`, `Δdec < +5 %` per level
and per corpus; `Δbytes ≤ 0`.

| Level | Corpus | Old enc ms | New enc ms | Δenc % | Old dec ms | New dec ms | Δdec % | Old B | New B | Δbytes % | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | text | 2.85 | 2.36 | -17.4 | 1.01 | 0.97 | -3.6 | 62495 | 62495 | 0.00 | PASS |
| 1 | source | 1.84 | 1.83 | -0.4 | 0.71 | 0.66 | -7.7 | 40427 | 40427 | 0.00 | PASS |
| 1 | json | 2.50 | 2.44 | -2.2 | 1.02 | 0.78 | -23.0 | 55435 | 55435 | 0.00 | PASS |
| 1 | random | 4.76 | 4.29 | -10.0 | 0.08 | 0.08 | 6.2 | 262224 | 262224 | 0.00 | FAIL (dec) |
| 1 | repeat | 0.88 | 0.86 | -1.5 | 0.26 | 0.24 | -7.7 | 1047 | 1047 | 0.00 | PASS |
| 1 | small | 10.17 | 9.93 | -2.4 | 4.52 | 4.46 | -1.3 | 153607 | 153607 | 0.00 | PASS |
| 2 | text | 3.72 | 3.89 | 4.5 | 0.70 | 0.70 | -0.9 | 60878 | 60878 | 0.00 | PASS |
| 2 | source | 2.16 | 2.13 | -1.4 | 0.60 | 0.58 | -3.6 | 38671 | 38671 | 0.00 | PASS |
| 2 | json | 3.30 | 3.27 | -1.1 | 0.71 | 0.68 | -5.4 | 53329 | 53329 | 0.00 | PASS |
| 2 | random | 4.36 | 4.48 | 2.7 | 0.07 | 0.06 | -0.8 | 262224 | 262224 | 0.00 | PASS |
| 2 | repeat | 0.86 | 0.85 | -1.5 | 0.23 | 0.27 | 16.4 | 1047 | 1047 | 0.00 | FAIL (dec) |
| 2 | small | 8.98 | 8.74 | -2.7 | 4.08 | 3.96 | -3.0 | 151958 | 151958 | 0.00 | PASS |
| 3 | text | 2.56 | 2.81 | 9.6 | 0.65 | 0.64 | -1.6 | 60040 | 60040 | 0.00 | FAIL (enc) |
| 3 | source | 2.14 | 2.12 | -1.2 | 0.53 | 0.51 | -3.0 | 37669 | 37669 | 0.00 | PASS |
| 3 | json | 3.31 | 3.22 | -2.9 | 0.74 | 0.70 | -5.1 | 51783 | 51783 | 0.00 | PASS |
| 3 | random | 4.56 | 4.22 | -7.5 | 0.07 | 0.06 | -8.5 | 262224 | 262224 | 0.00 | PASS |
| 3 | repeat | 0.86 | 0.86 | 0.5 | 0.21 | 0.22 | 3.5 | 1047 | 1047 | 0.00 | PASS |
| 3 | small | 9.28 | 8.86 | -4.5 | 4.00 | 3.18 | -20.5 | 150890 | 150890 | 0.00 | PASS |
| 4 | text | 3.96 | 3.94 | -0.6 | 0.66 | 0.65 | -1.6 | 60041 | 60041 | 0.00 | PASS |
| 4 | source | 3.41 | 3.38 | -0.8 | 0.56 | 0.54 | -2.3 | 38117 | 38117 | 0.00 | PASS |
| 4 | json | 5.65 | 5.46 | -3.4 | 0.73 | 0.71 | -2.3 | 51779 | 51779 | 0.00 | PASS |
| 4 | random | 5.23 | 5.40 | 3.1 | 0.06 | 0.07 | 1.4 | 262224 | 262224 | 0.00 | PASS |
| 4 | repeat | 1.46 | 1.43 | -1.7 | 0.21 | 0.23 | 11.5 | 1047 | 1047 | 0.00 | FAIL (dec) |
| 4 | small | 9.36 | 7.95 | -15.0 | 5.03 | 5.18 | 2.9 | 151652 | 151652 | 0.00 | PASS |
| 5 | text | 2.86 | 2.83 | -1.0 | 0.72 | 0.70 | -1.7 | 59678 | 59678 | 0.00 | PASS |
| 5 | source | 2.39 | 2.37 | -0.6 | 0.60 | 0.60 | 0.2 | 37242 | 37242 | 0.00 | PASS |
| 5 | json | 3.92 | 3.90 | -0.5 | 0.74 | 0.67 | -9.7 | 50296 | 50296 | 0.00 | PASS |
| 5 | random | 4.53 | 4.35 | -4.0 | 0.06 | 0.06 | -1.3 | 262224 | 262224 | 0.00 | PASS |
| 5 | repeat | 0.84 | 0.84 | 0.2 | 0.21 | 0.21 | 0.2 | 1047 | 1047 | 0.00 | PASS |
| 5 | small | 9.98 | 8.26 | -17.2 | 4.36 | 5.35 | 22.7 | 150639 | 150639 | 0.00 | FAIL (dec) |
| 6 | text | 3.00 | 2.95 | -1.5 | 0.69 | 0.64 | -7.3 | 59597 | 59597 | 0.00 | PASS |
| 6 | source | 2.62 | 2.55 | -2.5 | 0.53 | 0.52 | -1.4 | 36870 | 36870 | 0.00 | PASS |
| 6 | json | 5.30 | 5.17 | -2.5 | 0.73 | 0.69 | -4.7 | 49048 | 49048 | 0.00 | PASS |
| 6 | random | 4.52 | 4.22 | -6.5 | 0.06 | 0.07 | 16.8 | 262224 | 262224 | 0.00 | FAIL (dec) |
| 6 | repeat | 0.92 | 0.84 | -8.9 | 0.20 | 0.21 | 2.9 | 1047 | 1047 | 0.00 | PASS |
| 6 | small | 10.45 | 8.56 | -18.1 | 4.10 | 4.16 | 1.6 | 150312 | 150312 | 0.00 | PASS |
| 7 | text | 2.92 | 2.94 | 0.6 | 0.69 | 0.66 | -5.0 | 59591 | 59591 | 0.00 | PASS |
| 7 | source | 2.81 | 2.77 | -1.4 | 0.51 | 0.49 | -3.0 | 36815 | 36815 | 0.00 | PASS |
| 7 | json | 5.73 | 6.03 | 5.1 | 0.72 | 0.69 | -4.5 | 48850 | 48850 | 0.00 | FAIL (enc) |
| 7 | random | 4.61 | 4.31 | -6.6 | 0.06 | 0.07 | 5.0 | 262224 | 262224 | 0.00 | PASS |
| 7 | repeat | 0.86 | 0.85 | -0.3 | 0.20 | 0.20 | 3.8 | 1047 | 1047 | 0.00 | PASS |
| 7 | small | 9.50 | 8.34 | -12.2 | 5.16 | 4.18 | -19.0 | 150232 | 150232 | 0.00 | PASS |
| 8 | text | 3.01 | 3.00 | -0.6 | 0.69 | 0.64 | -6.8 | 59590 | 59590 | 0.00 | PASS |
| 8 | source | 3.05 | 3.05 | -0.2 | 0.57 | 0.52 | -8.7 | 36768 | 36768 | 0.00 | PASS |
| 8 | json | 6.79 | 6.85 | 0.8 | 0.75 | 0.70 | -7.0 | 48755 | 48755 | 0.00 | PASS |
| 8 | random | 4.44 | 4.20 | -5.4 | 0.06 | 0.06 | -0.2 | 262224 | 262224 | 0.00 | PASS |
| 8 | repeat | 0.88 | 0.90 | 2.7 | 0.20 | 0.22 | 5.9 | 1047 | 1047 | 0.00 | FAIL (dec) |
| 8 | small | 10.25 | 9.32 | -9.1 | 3.52 | 4.72 | 34.1 | 150199 | 150199 | 0.00 | FAIL (dec) |
| 9 | text | 2.99 | 3.16 | 5.7 | 0.67 | 0.66 | -1.6 | 59590 | 59590 | 0.00 | FAIL (enc) |
| 9 | source | 3.21 | 3.19 | -0.7 | 0.55 | 0.50 | -7.9 | 36763 | 36763 | 0.00 | PASS |
| 9 | json | 6.72 | 6.78 | 0.8 | 0.76 | 0.76 | -0.2 | 48755 | 48755 | 0.00 | PASS |
| 9 | random | 4.78 | 4.50 | -5.9 | 0.07 | 0.06 | -14.4 | 262224 | 262224 | 0.00 | PASS |
| 9 | repeat | 0.85 | 0.84 | -1.0 | 0.20 | 0.21 | 9.0 | 1047 | 1047 | 0.00 | FAIL (dec) |
| 9 | small | 9.45 | 8.94 | -5.4 | 4.77 | 3.81 | -20.2 | 150199 | 150199 | 0.00 | PASS |

**43/54 PASS, 11/54 FAIL.** `Δbytes` is `+0.000 %` on every one of the 54
cells (the deflate codec's own bit-packing is untouched; only the
`huffman`/`bitstream` primitives underneath it changed). Every red cell is
a time cell, and it is the harness's own measurement noise: a later
measurement ruling accepted these cells as the measured floor, based on a
live-vs-live identical-code A/A run at the same parameters that puts
10-21 of these 54 cells past `|5 %|`, while at `--reps 15` all
sub-millisecond and GC-heavy cells stabilise. The residual cells above are
accepted as the measurement floor, not a regression — the same acceptance
applies to `brotli.md`, `lz4.md`, `huffman.md` and `bitstream.md`.

## Provenance

In-house implementation from RFC 1951; the earlier fflate-derived
implementation has since been replaced. The LZ77 matching pass is the
shared `lz77` module.

## Example

```js
const deflate = runtime.resolve('deflate');

const data = new TextEncoder().encode('Hello World '.repeat(500));

// Sync
const compressed   = deflate.deflateSync(data, { level: 6 });
const decompressed = deflate.inflateSync(compressed);

// With dictionary (better compression for similar data)
const dict = new TextEncoder().encode('Hello World ');
const c = deflate.deflateSync(data, { level: 9, dictionary: dict });
const d = deflate.inflateSync(c, { dictionary: dict });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const deflate = libs.deflate;
        const compressed = deflate.deflateSync(args.data, { level: 6 });
        self.postMessage(compressed, [compressed.buffer]);
    },
    { dependencies: ['deflate'], args: { data: new Uint8Array(largeData) } }
);
```

## Notes

- This module is the low-level primitive. For common usage, prefer [gzip](./gzip.md) or [zlib](./zlib.md) which add a header + checksum.
- The `DeflateStream` / `InflateStream` streams are reused internally by `gzip` and `zlib`.
- Both halves implement RFC 1951 §3.2.3–§3.2.7 directly — see [Design › Decoder](#decoder) for the table derivation, the block state machine and the resumability rule, and [Design › Encoder](#encoder) for the level table, the `lazy` opt-in, the block-cost rule and the streaming chunk contract; [Benchmark](#benchmark) carries the measured record against the pre-batch engine.

## See also

- [gzip](./gzip.md) — DEFLATE + gzip header + CRC32
- [zlib](./zlib.md) — DEFLATE + zlib header + Adler32
- [zip](./zip.md) — multi-file archiving
- [lz77](./lz77.md) — the hash-chain matcher the encoder scans with
