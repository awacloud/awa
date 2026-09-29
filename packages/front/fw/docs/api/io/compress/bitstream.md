---
module: bitstream
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# bitstream

> LSB-first bit-stream reader/writer over `Uint8Array` + 15-bit reverse table.

**Module** `bitstream` | **Source** `packages/front/fw/src/io/compress/bitstream.js` | **Deps** none | **Worker-safe** yes

Primitive shared by codecs whose bit layout follows DEFLATE/Brotli
conventions: little-endian packing within each byte, least-significant bit
first. Also exposes the `rev` 15-bit bit-reversal table used by canonical
Huffman decoding.

## Resolve

```js
const bs = runtime.resolve('bitstream');
// { readBits, readBits16, writeBits, writeBits16, byteOffset, slice, max, rev }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `readBits` | `(buf: Uint8Array, bitPos: number, mask: number) => number` | up to 16 bits at `bitPos`, masked |
| `readBits16` | `(buf: Uint8Array, bitPos: number) => number` | up to 24 bits at `bitPos`, **not** masked |
| `writeBits` | `(buf: Uint8Array, bitPos: number, v: number) => void` | writes up to 16 bits (OR-into) |
| `writeBits16` | `(buf: Uint8Array, bitPos: number, v: number) => void` | writes up to 24 bits (OR-into) |
| `byteOffset` | `(bitPos: number) => number` | `ceil(bitPos / 8)` |
| `slice` | `(buf: Uint8Array, start?, end?) => Uint8Array` | copied sub-array (not a view) |
| `max` | `(arr: ArrayLike<number>) => number` | maximum |
| `rev` | `Uint16Array(32768)` | `rev[i]` = bit-reverse of `i` in 15 bits |

### `readBits(buf, bitPos, mask)`

Reads up to 16 bits starting at bit position `bitPos` (absolute index from
the beginning of `buf`). The `mask` must be pre-computed by the caller as
`(1 << nbits) - 1`. The explicit pattern allows the mask to be hoisted out
of hot loops.

### `writeBits(buf, bitPos, v)`

OR-into: destination bits must be zero before the call. This is the default
for a freshly allocated `Uint8Array`, which is the expected pattern
(pre-allocated output buffer, sequential writes).

### `rev`

15-bit bit-reversal table: `rev[i]` is `i` read in mirror over 15 bits,
the result right-shifted by one bit to fit in 15 useful bits. Used by
canonical Huffman decoders to index a table by the `maxBits` low-order
bits of the stream.

## Examples

### Write/read a 9-bit code

```js
const bs = runtime.resolve('bitstream');
const out = new Uint8Array(4);

bs.writeBits(out, 5, 0x1A5);                  // 9 bits at position 5
const v = bs.readBits(out, 5, (1 << 9) - 1);  // 0x1A5
```

### Build a mask from a bit count

```js
const nbits = 11;
const mask  = (1 << nbits) - 1;
bs.readBits(buf, p, mask);                    // reads 11 bits
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const bs = libs.bitstream;
        const buf = args[0];
        self.postMessage(bs.readBits(buf, 0, 0xFFFF));
    },
    { dependencies: ['bitstream'], args: [new Uint8Array([0xCD, 0xAB])] }
);
```

## Notes

- `readBits` always reads **2 consecutive bytes** starting at byte `floor(bitPos / 8)` (not `byteOffset(bitPos)`, which rounds up); an index past the end of the buffer reads as zero, never throws.
- `readBits16` reads **3 consecutive bytes** and does not mask — the caller must apply its own mask.
- `writeBits` / `writeBits16` are `OR-into`, **not** destructive writes: a second call on the same bits produces corrupt data.
- The `rev` table is built **once per factory instance** (~64 KB) — share the instance across consumer modules.

## Benchmark

Micro-cell `bitstream.rw`, `tools/bench/codec-levels.js` (one pass writing
`1 << 20` values of widths 1-16 then reading them back, corpus-independent),
`--reps 7 --warmup 3`, baseline sha `d47f8fc7a68809f519fe7d36ff2b0ba88bcacdbd`.
Host `win32` / `13th Gen Intel(R) Core(TM) i7-13700KF` / Bun `1.3.13`.
Generated `2026-09-24T20:50:02.210Z` (gitignored bench artifact). Rule:
`Δenc < +5 %`; gated on time only (no dec split, no bytes cell —
`bitstream.js` is byte-for-byte unchanged by the clean-room rewrite, see
[huffman](./huffman.md) § Design).

| Cell | Old enc ms | New enc ms | Δenc % | Verdict |
|---|---|---|---|---|
| bitstream.rw | 7.79 | 8.55 | 9.8 | FAIL (enc) |

**0/1 PASS.** `bitstream.js` did not change in the clean-room rewrite
(confirmed byte-for-byte by the module's own perf-pass diff), so this is
measurement noise, not a regression: a later measurement ruling recorded
that an A/A run of two byte-identical copies of the module measures the
same `rw` path at ±10-15 % between copies in the shared-process harness,
while running one engine per process the same path measures 3.25 vs 3.25
ms (equal). The cell is accepted as the harness's own noise floor.

## Provenance

In-house implementation written from RFC 1951 §3.1.1 (bit packing) and RFC 7932 §1.5; the earlier fflate-derived implementation was replaced by a clean-room rewrite (2026-09).

## See also

- [huffman](./huffman.md) — builds on `rev` and the slice/max helpers
- [deflate](./deflate.md) — first consumer (RFC 1951)
