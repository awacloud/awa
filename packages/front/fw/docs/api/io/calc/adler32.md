---
module: adler32
category: io/calc
dependencies: []
returns: constructor
worker-safe: true
status: complete
---

# adler32

> Incremental Adler-32 checksum (RFC 1950). Used in Zlib/Deflate formats.

**Module** `adler32` | **Source** `packages/front/fw/src/io/calc/adler32.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const Adler32 = runtime.resolve('adler32');
// Returns: constructor (new Adler32())
```

## API

```js
const adler = new Adler32();
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `append` | `(data: Uint8Array) => void` | Adds data to the computation |
| `get` | `() => number` | Returns `(B << 16) | A` unsigned (RFC 1950 §2.2) |

## Examples

```js
const Adler32 = runtime.resolve('adler32');

const adler = new Adler32();
adler.append(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
console.log(adler.get().toString(16)); // "07c801b5"

// Incremental processing
const adler2 = new Adler32();
for (const chunk of dataChunks) {
    adler2.append(chunk);
}
const checksum = adler2.get();
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const Adler32 = libs.adler32;
        const adler = new Adler32();
        adler.append(new Uint8Array(args.data));
        self.postMessage(adler.get());
    },
    { dependencies: ['adler32'], args: { data: Array.from(largeBuffer) } }
);
```

## Notes

- Returned format: `(B << 16) | A` — big-endian value conforming to RFC 1950.
- Optimized: 2655-byte blocks with fast modular reduction (`& 0xFFFF + 15 * (>> 16)`).
- Faster than CRC-32 but less robust against corruptions.
- Same API as `crc32` (compatible `append/get`).

## See also

- [crc32](./crc32.md) — CRC-32 checksum (more robust)
- [zlib](../compress/zlib.md) — uses Adler-32 internally
