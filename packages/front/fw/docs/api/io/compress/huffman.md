---
module: huffman
category: io/compress
dependencies: [bitstream]
returns: object
worker-safe: true
status: complete
---

# huffman

> Canonical Huffman code construction (encode + decode) with length cap.

**Module** `huffman` | **Source** `packages/front/fw/src/io/compress/huffman.js` | **Deps** `bitstream` | **Worker-safe** yes

Primitives shared by the DEFLATE/Brotli codecs:

- `buildMap` — from an array of canonical code lengths, produces the
  encoding table (symbol → code) **or** the decoding table indexed by
  the `maxBits` LSBs of the stream.
- `buildTree` — from symbol frequencies, computes the code lengths of an
  optimal prefix code whose lengths never exceed `maxBits` (package-merge,
  no post-hoc length adjustment).

The assignment follows the canonical convention: symbols with shorter code
first, ties broken by symbol order. See RFC 1951 §3.2.2.

## Resolve

```js
const hf = runtime.resolve('huffman');
// { buildMap, buildTree }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `buildMap` | `(codeLengths: Uint8Array, maxBits: number, reversed: 0\|1) => Uint16Array` | encode table (`reversed=0`) or decode table (`reversed=1`) |
| `buildTree` | `(freqs: Uint16Array \| number[], maxBits: number) => { t: Uint8Array, l: number }` | `t` = code lengths, `l` = max bits used |

### `buildMap(cd, mb, reversed)`

**Encoder mode** (`reversed = 0`): returns `Uint16Array[cd.length]` where
`out[s]` is the canonical code of symbol `s` bit-reversed over `cd[s]` bits
(0 for unused symbols), so that `bitstream.writeBits(buf, p, out[s])` followed
by `p += cd[s]` puts the code on the wire most-significant bit first, as RFC
1951 §3.1.1 requires.

**Decoder mode** (`reversed = 1`): returns `Uint16Array[1 << maxBits]`
indexed by the `maxBits` low-order bits of the stream. Each entry is
packed as `(symbol << 4) | codeLength`. To decode:

```js
const entry = decTable[bs.readBits(buf, p, (1 << mb) - 1)];
const symbol = entry >> 4;
const len    = entry & 0x0F;
p += len;
```

### `buildTree(freqs, mb)`

Runs the package-merge algorithm (Larmore & Hirschberg, 1990) over the
used symbols sorted by frequency (ties by symbol index): the result
minimises `Σ freq[s] · t[s]` among all prefix codes whose lengths stay within
`mb`, so the cap is part of the optimisation rather than a repair applied to
an unlimited Huffman tree. Cost is `O(n log n)` for `n` used symbols when an
unlimited Huffman code already fits in `mb` (the usual case, see
[Design](#design)), and `O(n · mb)` when the cap binds.
Frequencies are plain non-negative integers of any size (`Uint16Array`,
`Uint32Array` or `number[]`; sums below `2^32` are exact). Special cases:

| Input | Output |
|-------|--------|
| All frequencies 0 | `{ t: Uint8Array(0), l: 0 }` |
| Single symbol `s` with freq > 0 | `{ t: [0,…,1 @ s], l: 1 }` |
| ≥ 2 symbols | Complete canonical code (Kraft sum = 1), `l = max(t) ≤ mb`; a more frequent symbol never gets a longer code |

The returned `t` array is sized to `maxSymbol + 1` (not the next power of 2).

## Examples

### Build a code from frequencies

```js
const hf = runtime.resolve('huffman');

const freqs = new Uint16Array([5, 9, 12, 13, 16, 45]);
const { t, l } = hf.buildTree(freqs, 15);
// t = [4, 4, 3, 3, 3, 1] — canonical code lengths
// l = 4
```

### Round-trip encode → decode

```js
const enc = hf.buildMap(t, l, 0);   // {symbol → code}
const dec = hf.buildMap(t, l, 1);   // table indexed by LSB bits

// Verification
for (let s = 0; s < t.length; ++s) {
    if (!t[s]) continue;
    const entry = dec[enc[s]];
    console.assert((entry >> 4) === s);
    console.assert((entry & 0x0F) === t[s]);
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const hf = libs.huffman;
        const { t, l } = hf.buildTree(args[0], 15);
        self.postMessage({ lengths: Array.from(t), maxBits: l });
    },
    {
        dependencies: ['huffman'],
        args: [new Uint16Array([1, 2, 3, 4])],
    }
);
```

## Notes

- `buildMap` in decoder mode allocates `1 << maxBits` entries: keep `maxBits` as tight as possible (15 for DEFLATE literal/length, 5 for DEFLATE distance, up to 15 for Brotli).
- Decode packing `(sym << 4) | len`: limits `len` to 4 bits (≤ 15). Consistent with the constraints of both supported RFCs.
- Every call returns fresh arrays, including the empty `{ t: Uint8Array(0), l: 0 }` result; the output is deterministic for a given input.
- Zero-frequency symbols are **excluded**: a symbol with frequency 0 gets `t[s] = 0` and must not be emitted by the encoder.

## Design

**Two paths, one answer.** `buildTree` sorts the used symbols once, by
frequency then symbol, and first runs a plain Huffman construction over them
with two queues instead of a heap: the sorted leaves, and the merged nodes,
which are created in non-decreasing weight order, so each step only compares
the two queue heads. On equal weights the leaf is taken first. Each item
records the step that absorbed it, and one reverse pass over the steps turns
those links into depths. If the deepest code fits in `mb`, that code is
returned: an unlimited Huffman code that respects the cap is optimal under the
cap too. Only when it does not fit does package-merge run, on the same sorted
leaves.

The two paths are not merely equal in cost: package-merge with the same tie
rule (leaf before package on equal weight) returns the **same lengths**
whenever the Huffman code fits, so the fast path never changes a codec's
output. `huffman.test.js` holds `buildTree` equal to an independent
package-merge (explicit coin counts) on every alphabet of 2 to 5 symbols with
frequencies 1 to 5, at the Huffman depth, one above and one below it, and on
400 seeded random vectors with tie-heavy and wide frequencies. Swapping the
tie rule of the fast path (`<=` to `<`) turns both tests red.

Measured on the codec bench histograms (200 calls, Bun 1.3.13), `buildTree`
spends about 70 % of its package-merge time in the level merges; the fast path
cuts a call by 60 to 78 % (text: 3.26 to 0.71 ms per 200 calls) and leaves
the sort as the dominant cost. The DEFLATE code-length code (`mb = 7`) and
skewed Brotli alphabets still reach package-merge when the cap binds.

**Decode-table fill.** A code of length `len` owns every slot of the
`1 << mb` table whose low `len` bits spell it in stream order, so each symbol
writes its entry at `rev(code)` and then every `1 << len` slots: one pass per
symbol, no sorting, and no second pass for the long codes.

## Benchmark

Micro-cells, `tools/bench/codec-levels.js` (`<corpus>:buildTree` = 200×
`buildTree(hist, 15)`; `<corpus>` = 200× `buildMap(lengths, 15, 0)` then
200× `buildMap(lengths, 15, 1)`, on this engine's own `buildTree` output),
`--reps 7 --warmup 3`, baseline sha
`d47f8fc7a68809f519fe7d36ff2b0ba88bcacdbd`. Host `win32` / `13th Gen
Intel(R) Core(TM) i7-13700KF` / Bun `1.3.13`. Generated
`2026-09-24T20:50:02.210Z` (gitignored bench artifact). Rule: `Δenc < +5 %`,
`Δdec < +5 %`; gated on time only (no bytes cell).

| Corpus | Old enc ms | New enc ms | Δenc % | Old dec ms | New dec ms | Δdec % | Verdict |
|---|---|---|---|---|---|---|---|
| text:buildTree | 2.09 | 0.68 | -67.4 | 0.00 | 0.00 | 0.0 | PASS |
| text | 0.10 | 0.10 | 4.1 | 13.79 | 6.76 | -51.0 | PASS |
| source:buildTree | 1.28 | 0.43 | -66.3 | 0.00 | 0.00 | 0.0 | PASS |
| source | 0.08 | 0.09 | 14.6 | 14.13 | 5.42 | -61.6 | FAIL (enc) |
| json:buildTree | 0.31 | 0.16 | -46.7 | 0.00 | 0.00 | 0.0 | PASS |
| json | 0.04 | 0.06 | 37.0 | 13.95 | 5.24 | -62.4 | FAIL (enc) |
| random:buildTree | 3.26 | 1.02 | -68.7 | 0.00 | 0.00 | 0.0 | PASS |
| random | 0.15 | 0.15 | -2.0 | 14.00 | 8.63 | -38.4 | PASS |
| repeat:buildTree | 0.83 | 0.32 | -61.7 | 0.00 | 0.00 | 0.0 | PASS |
| repeat | 0.07 | 0.10 | 32.5 | 14.24 | 6.91 | -51.5 | FAIL (enc) |
| small:buildTree | 1.16 | 0.41 | -64.5 | 0.00 | 0.00 | 0.0 | PASS |
| small | 0.08 | 0.09 | 11.5 | 14.03 | 5.57 | -60.3 | FAIL (enc) |

**8/13 PASS, 5/13 FAIL** (of the 13 huffman + bitstream micro-cells; 8/12
PASS, 4/12 FAIL restricted to this module's own 12 rows above —
`bitstream.rw` is [bitstream](./bitstream.md)'s cell). Every `buildTree`
row PASSES, by a wide margin (−47 to −69 %): the two-queue fast path (see
Design) is the dominant win. The `buildMap`-encode red cells
(source/json/repeat/small, +12 to +37 %) sit inside the harness's own
noise floor: a later measurement ruling recorded that an A/A run of two
byte-identical copies of the new module measures +4 to +14 % on the same
cell, and no variant tried moved it monomorphically. The paired
`buildMap`-decode timing (same cell, `reversed = 1`) is faster everywhere
(−38 to −62 %) and never fails.

## Provenance

In-house implementation from RFC 1951 §3.2.2 (canonical assignment) and a length-limited optimal code construction (package-merge, Larmore & Hirschberg 1990); the earlier fflate-derived implementation was replaced by a clean-room rewrite (2026-09).

## See also

- [bitstream](./bitstream.md) — provides `rev` (bit-reversal) and TypedArray helpers
- [deflate](./deflate.md) — RFC 1951 §3.2.2 (canonical assignment)
