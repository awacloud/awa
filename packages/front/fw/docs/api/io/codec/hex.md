---
module: hex
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# hex

> Hexadecimal encoding/decoding. Converts between `Uint8Array` and lowercase hex strings.

**Module** `hex` | **Source** `packages/front/fw/src/io/codec/hex.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const hex = runtime.resolve('hex');
// Returns: { toBytes, fromBytes }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `fromBytes` | `(bytes: Uint8Array\|number[]) => string` | Lowercase hex string |
| `toBytes` | `(text: string) => Uint8Array` | Byte array |

### `hex.fromBytes(bytes)`

```js
hex.fromBytes(new Uint8Array([255, 0, 171])); // "ff00ab"
hex.fromBytes([16, 32, 48]);                  // "102030"
```

### `hex.toBytes(text)`

```js
hex.toBytes('ff00ab'); // Uint8Array [255, 0, 171]
hex.toBytes('FF00AB'); // Uint8Array [255, 0, 171] — case insensitive
```

## Examples

```js
const hex = runtime.resolve('hex');

// Round-trip
const original = new Uint8Array([1, 127, 255]);
const encoded  = hex.fromBytes(original);   // "017fff"
const decoded  = hex.toBytes(encoded);      // Uint8Array [1, 127, 255]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function({ libs }) {
        const result = libs.hex.fromBytes(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
        self.postMessage(result); // "deadbeef"
    },
    { dependencies: ['hex'] }
);
```

## Notes

- Output is always **lowercase** (`0-9a-f`).
- `toBytes`: hex input parsed 2 characters at a time. Odd length → last character ignored.
- No validation: invalid hex characters produce `NaN` bytes silently.

## See also

- [b64](./b64.md), [utf8](./utf8.md), [buffer](./buffer.md)
