---
module: crc32
category: io/calc
dependencies: []
returns: constructor
worker-safe: true
status: complete
---

# crc32

> Incremental CRC-32 checksum. Reversed IEEE 802.3 polynomial (`0xEDB88320`).

**Module** `crc32` | **Source** `packages/front/fw/src/io/calc/crc32.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const Crc32 = runtime.resolve('crc32');
// Returns: constructor (new Crc32())
```

## API

```js
const crc = new Crc32();
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `append` | `(data: Uint8Array\|number[]) => void` | Adds data to the computation |
| `get` | `() => number` | Returns the final checksum (unsigned uint32) |

## Examples

```js
const Crc32 = runtime.resolve('crc32');

// Single pass
const crc = new Crc32();
crc.append(new Uint8Array([72, 101, 108, 108, 111]));
console.log(crc.get().toString(16)); // hex checksum

// Incremental processing (streaming)
const crc2 = new Crc32();
for (const chunk of dataChunks) {
    crc2.append(chunk);
}
const checksum = crc2.get();
```

## Worker Usage

```js
const worker = fw.createWorker(
    function({ libs, args }) {
        const Crc32 = libs.crc32;
        const crc = new Crc32();
        crc.append(new Uint8Array(args[0]));
        self.postMessage(crc.get());
    },
    { dependencies: ['crc32'], args: [Array.from(largeBuffer)] }
);
```

## Notes

- Each `new Crc32()` instance is independent — no shared internal state.
- `get()` always returns a **unsigned** 32-bit integer (via `>>> 0`).
- Pre-computed lookup table algorithm (256 entries) — fast for large volumes.

## See also

- [adler32](./adler32.md) — Adler-32 alternative (faster, less robust)
