---
module: bitmap
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# bitmap

> Bits ↔ bytes conversion. LSB-first per byte (bit 0 = least significant bit).

**Module** `bitmap` | **Source** `packages/front/fw/src/io/utils/bitmap.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const bitmap = runtime.resolve('bitmap');
// Returns: { bytesToBits, bitsToBytes, padBitsToByte }
```

## API

| Method | Signature | Description |
|--------|-----------|-------------|
| `bytesToBits` | `(ui8a: Uint8Array, ret?) => number[]` | Bytes → bit array (0/1), LSB-first |
| `bitsToBytes` | `(ba: number[], ret?, validate?) => Uint8Array` | Bits → bytes (length must be a multiple of 8) |
| `padBitsToByte` | `(arr: number[]) => number[]` | Pads to a multiple of 8 with zeros |

### `bitmap.bytesToBits(ui8a)`

LSB-first: byte `0b00000011` = `[1,1,0,0,0,0,0,0]`

```js
bitmap.bytesToBits(new Uint8Array([3]));    // [1,1,0,0,0,0,0,0]
bitmap.bytesToBits(new Uint8Array([255]));  // [1,1,1,1,1,1,1,1]
bitmap.bytesToBits(new Uint8Array([1,2]));  // [1,0,0,0,0,0,0,0, 0,1,0,0,0,0,0,0]
```

### `bitmap.bitsToBytes(ba, ret?, validate?)`

```js
bitmap.bitsToBytes([1,1,0,0,0,0,0,0]);         // Uint8Array [3]
bitmap.bitsToBytes([0,1,0,0,0,0,0,0]);         // Uint8Array [2]

// Strict length validation
bitmap.bitsToBytes([1,0,0,0,0,0,0], null, true); // throws — length 7
```

### `bitmap.padBitsToByte(arr)`

Modifies `arr` in place and returns it:

```js
const bits = [1, 0, 1]; // length 3
bitmap.padBitsToByte(bits); // → [1, 0, 1, 0, 0, 0, 0, 0] (5 zeros added)
```

## Examples

```js
const bitmap = runtime.resolve('bitmap');

// Round-trip
const bytes = new Uint8Array([42, 255, 0]);
const bits  = bitmap.bytesToBits(bytes);
bitmap.padBitsToByte(bits); // ensure multiple of 8
const back  = bitmap.bitsToBytes(bits);
// back ≡ bytes
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const bits = libs.bitmap.bytesToBits(args.bytes);
        libs.bitmap.padBitsToByte(bits);
        const back = libs.bitmap.bitsToBytes(bits);
        self.postMessage(back);
    },
    { dependencies: ['bitmap'], args: { bytes: new Uint8Array([42, 255]) } }
);
```

## Notes

- **LSB-first** order: bit 0 (least significant) is the first element of the array.
- `padBitsToByte`: no-op if length is already a multiple of 8.
- `bitsToBytes` with `validate=true`: throws if length is not a multiple of 8.
- Pre-computed lookup table (256 entries) for conversions.

## See also

- [ui8](./ui8.md) — general Uint8Array utilities
