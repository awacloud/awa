---
module: buffer
category: io/codec
dependencies: [valid, utf8]
returns: object
worker-safe: true
status: complete
---

# buffer

> Binary codec for the "awacloud data stream object notation". Encodes arbitrary JS values (number, string, boolean, array, object, Uint8Array) into self-describing binary.

**Module** `buffer` | **Source** `packages/front/fw/src/io/codec/buffer.js` | **Deps** `valid`, `utf8` | **Worker-safe** yes

## Resolve

```js
const buf = runtime.resolve('buffer');
// Returns: { out, in, consume, clone, concat, const }
```

## Binary format

Each encoded value: `[block][length bytes...][payload]`

- `block` = `((headBytes - 1) << 4) | typeCode`
- Supported types: `number`, `string`, `boolean`, `array`, `object`, `uint8array`, `uint8clampedarray`
- Numbers: smallest exact representation among `uint8/int8/uint16/int16/uint32/int32/float16/float32/float64`

## API

| Method | Signature | Description |
|--------|-----------|-------------|
| `out` | `(value: any) => Uint8Array` | Encodes a JS value to bytes |
| `in` | `(data: Uint8Array) => any` | Decodes the first block of a buffer |
| `consume` | `(data: Uint8Array) => any[]` | Decodes all consecutive blocks |
| `clone` | `(value: any) => any` | Deep clone via `out` + `in` (serializable values only) |
| `concat` | `(len, arr, out?, count?) => Uint8Array` | Concatenates multiple Uint8Arrays |

### `buf.out(value)`

```js
buf.out(42);                           // → Uint8Array (encoded number)
buf.out('hello');                      // → Uint8Array (encoded string)
buf.out([1, 2, 3]);                    // → Uint8Array (encoded array)
buf.out({ x: 10, y: 20 });            // → Uint8Array (encoded object)
buf.out(new Uint8Array([255, 0, 1])); // → Uint8Array (encoded bytes)
buf.out(true);                         // → Uint8Array (encoded boolean)
```

### `buf.in(data)`

```js
const bytes = buf.out(42);
buf.in(bytes); // → 42

const obj = buf.out({ name: 'test', value: 3.14 });
buf.in(obj);   // → { name: 'test', value: 3.14 }
```

### `buf.consume(data)`

Decodes a buffer containing multiple concatenated values:

```js
const a = buf.out(1);
const b = buf.out('hello');
const c = buf.out([1, 2]);

// Concatenate and decode all
const merged = buf.concat(a.length + b.length + c.length, [a, b, c]);
buf.consume(merged); // → [1, 'hello', [1, 2]]
```

### `buf.clone(value)`

```js
const original = { data: new Uint8Array([1, 2, 3]), name: 'test' };
const cloned   = buf.clone(original);
// Deep clone via binary serialisation — no shared references
```

### `buf.concat(len, arr, out?, count?)`

```js
const chunks = [buf.out(1), buf.out(2), buf.out(3)];
const total  = chunks.reduce((s, c) => s + c.length, 0);
const merged = buf.concat(total, chunks);
```

## Examples

```js
const buf  = runtime.resolve('buffer');

// Serialise data for worker transfer
const payload = buf.out({ cmd: 'process', data: new Uint8Array(1000).fill(5) });
worker.postMessage(payload, [payload.buffer]); // Transferable

// Decode on the worker side
// buf.in(receivedData) → { cmd: 'process', data: Uint8Array }
```

```js
// Round-trip complex types
const values = [
    42, -1, 3.14, true, false,
    'texte', [1, 2, 3],
    { nested: { x: 1 } },
    new Uint8Array([0xff, 0x00])
];

for (const v of values) {
    const encoded = buf.out(v);
    const decoded = buf.in(encoded);
    // decoded ≡ v (except float16 → reduced precision)
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const buf = libs.buffer;
        const bytes = buf.out(args.payload);
        self.postMessage(bytes, [bytes.buffer]);
    },
    { dependencies: ['buffer'], args: { payload: { type: 'event', data: [1, 2, 3] } } }
);
```

## Notes

- Numbers: automatically selects the most compact type (uint8 for 0-255, float64 for general cases).
- Float16 implemented in pure JS (IEEE 754 binary16) — ~3 decimal digits of precision.
- Arrays and objects are encoded recursively.
- `clone` is a fast deep-copy for serialisable types (no functions, Dates, etc.).

## See also

- [utf8](./utf8.md) — used internally to encode strings
- [valid](../utils/valid.md) — used for type detection
