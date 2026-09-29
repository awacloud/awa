---
module: ui8
category: io/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ui8

> Uint8Array utilities — byte-by-byte comparison, binary buffer concatenation.

**Module** `ui8` | **Source** `packages/front/fw/src/io/utils/ui8.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const ui8 = runtime.resolve('ui8');
// Returns: { equal, join, concat }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `equal` | `(a: Uint8Array, b: Uint8Array) => boolean` | `true` if lengths are equal and bytes are identical |
| `join` | `(a: Uint8Array, b: Uint8Array) => Uint8Array` | New buffer = a + b |
| `concat` | `(arr: Uint8Array[]) => Uint8Array` | New buffer = concatenation of all elements |

### `ui8.equal(a, b)`

Byte-by-byte comparison. Returns `false` if lengths differ.

```js
const a = new Uint8Array([1, 2, 3]);
const b = new Uint8Array([1, 2, 3]);
const c = new Uint8Array([1, 2, 4]);

ui8.equal(a, b);  // → true
ui8.equal(a, c);  // → false
ui8.equal(a, new Uint8Array([1, 2]));  // → false (different lengths)
```

### `ui8.join(a, b)`

Concatenates two `Uint8Array` into a new array.

```js
const header  = new Uint8Array([0xde, 0xad]);
const payload = new Uint8Array([0xbe, 0xef]);

const frame = ui8.join(header, payload);
// → Uint8Array([0xde, 0xad, 0xbe, 0xef])
```

### `ui8.concat(arr)`

Concatenates an array of `Uint8Array` into a single buffer. Performs a single allocation pass (pre-computes total length).

```js
const chunks = [chunk1, chunk2, chunk3];
const full = ui8.concat(chunks);
// → Uint8Array containing all chunks in order
```

## Examples

### Binary frame assembly

```js
const ui8 = runtime.resolve('ui8');
const hex  = runtime.resolve('hex');

const magic   = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const version = new Uint8Array([0x01, 0x00]);
const payload = hex.toBytes('deadbeef');

const frame = ui8.concat([magic, version, payload]);

// Verify a response
const expected = new Uint8Array([0x00, 0x01]);
const response = new Uint8Array([0x00, 0x01]);
if (ui8.equal(expected, response)) {
    console.log('ACK received');
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const combined = libs.ui8.concat(args.chunks);
        self.postMessage(combined);
    },
    { dependencies: ['ui8'], args: { chunks: [new Uint8Array([1, 2]), new Uint8Array([3, 4])] } }
);
```

## Notes

- `join` and `concat` always allocate a new `Uint8Array` — inputs are not mutated.
- `concat` performs a single allocation by pre-computing the total length (O(n) space, two passes over the data).
- `equal` short-circuits as soon as lengths differ — no byte scan in that case.

## See also

- [buffer](../codec/buffer.md) — structured binary serialization
- [hex](../codec/hex.md) — hexadecimal encoding of Uint8Array
- [bitmap](./bitmap.md) — bits/bytes conversion
