---
module: lzw
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# lzw

> Lempel-Ziv-Welch — dynamic dictionary, variable-width codes (GIF / TIFF / .Z).

**Module** `lzw` | **Source** `packages/front/fw/src/io/compress/lzw.js` | **Deps** none | **Worker-safe** yes

Classic LZW codec: maintains a dictionary starting with single-byte
sequences (codes 0..255 by default) that grows by one entry per encoded
symbol. Emitted codes grow in width from `minCodeBits + 1` to `maxBits`
bits as the dictionary fills. Different from LZ77 (which emits
`<length, distance>` pairs in a sliding window) — LZW is simpler to
decode, requires no window, and performs well on locally repeated data.

## Wire-format profiles

| Family | `bigEndian` | `useClearEnd` | `minCodeBits` | Used by |
|--------|-------------|---------------|---------------|---------|
| GIF | `false` (LSB-first) | `true` (CLEAR + END) | 8 (variable) | `image/gif` |
| TIFF | `true` (MSB-first) | `true` | 8 | `image/tiff` |
| `compress` / `.Z` | `false` | `false` | 8 | Unix |

**Defaults match the GIF profile**. Override `bigEndian: true` for TIFF.

## Resolve

```js
const lzw = runtime.resolve('lzw');
// { encode, decode }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `encode` | `(data: Uint8Array, opts?) => Uint8Array` | LZW stream |
| `decode` | `(data: Uint8Array, opts?) => Uint8Array` | Original data |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minCodeBits` | `number` (2-12) | `8` | log2 of the initial alphabet (`1 << minCodeBits` first codes) |
| `maxBits` | `number` (9-16) | `12` | Max code width before dictionary growth stops |
| `bigEndian` | `boolean` | `false` | `false` = LSB-first packing (GIF/Z); `true` = MSB-first (TIFF) |
| `useClearEnd` | `boolean` | `true` | Emit the `CLEAR = 1 << minCodeBits` and `END = CLEAR + 1` markers |

> Options **must match** between encode and decode — the LZW container
> does not store its parameters in-band.

## Examples

### Round-trip default (GIF-style)

```js
const lzw = runtime.resolve('lzw');
const data = new TextEncoder().encode('TOBEORNOTTOBEORTOBEORNOT');

const compressed = lzw.encode(data);
const decoded = lzw.decode(compressed);

new TextDecoder().decode(decoded); // 'TOBEORNOTTOBEORTOBEORNOT'
```

### Profile TIFF (MSB-first)

```js
const enc = lzw.encode(data, { bigEndian: true });
const dec = lzw.decode(enc, { bigEndian: true });
```

### Compress (.Z) — without markers

```js
const enc = lzw.encode(data, { useClearEnd: false, maxBits: 16 });
const dec = lzw.decode(enc, { useClearEnd: false, maxBits: 16 });
```

### Reduced alphabet (4 binary symbols)

```js
const data = new Uint8Array([0, 1, 2, 3, 0, 1, 2, 3]);
const enc = lzw.encode(data, { minCodeBits: 2, maxBits: 8 });
const dec = lzw.decode(enc, { minCodeBits: 2, maxBits: 8 });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const out = libs.lzw.encode(args[0]);
        self.postMessage(out);
    },
    { dependencies: ['lzw'], args: [new TextEncoder().encode('hello world')] }
);
```

## Notes

- The decoder incorporates the classic **lag** compensation of one entry relative to the encoder: code-width widening at `nextCode === (1 << codeBits) - 1` (instead of `=== (1 << codeBits)` on the encoder side).
- Handles the **KwKwK** case (code referring to the entry being created) — tested via the canonical sequence `"TOBEORNOTTOBEORTOBEORNOT"`.
- Once `nextCode > (1 << maxBits) - 1`, the dictionary stops growing; existing codes continue to be emitted at `maxBits`. No automatic reset (compress "block mode" / GIF "CLEAR on full" strategy is left to the consumer, which can manually insert a CLEAR via options).
- Edge case: empty input → stream containing only `CLEAR + END` (if `useClearEnd`), otherwise empty.
- No native support for GIF sub-divided blocks (`subBlock` 1-255 bytes + null terminator) — that is the responsibility of the image codec consuming this module.
- Worker-safe: pure factory, no `window`/`document` access.

## See also

- [lz77](./lz77.md) — other LZ family (sliding window + back-refs)
- [lz4](./lz4.md) — fast variant with short matches
- [deflate](./deflate.md) — combines LZ77 + Huffman for gzip/zlib
- [brotli](./brotli.md) — modern equivalent with context modeling
