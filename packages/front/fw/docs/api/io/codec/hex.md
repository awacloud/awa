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
- `toBytes` is strict: an odd-length input throws `hex: odd-length input`,
  a character outside `0-9a-fA-F` throws `hex: invalid character at index N`.
- `fromBytes` on a `Uint8Array` uses the platform's
  `Uint8Array.prototype.toHex` where the realm has it (JavaScriptCore —
  Safari, Bun — and Firefox); elsewhere (V8: Chrome, Node) a JS path writes
  the digit pairs into a buffer and decodes it with `TextDecoder`
  (`String.fromCharCode` in a realm without one). Same string either way;
  1 MiB encodes in about 0.6 ms (Bun) / 1.2 ms (Node).
- An array of numbers encodes each element's low 8 bits (`NaN` and holes
  as `00`).

## See also

- [b64](./b64.md), [utf8](./utf8.md), [buffer](./buffer.md)
