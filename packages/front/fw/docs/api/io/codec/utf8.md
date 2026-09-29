---
module: utf8
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# utf8

> UTF-8 encoding/decoding. Supports ASCII, 2-byte and 3-byte sequences (full BMP Unicode).

**Module** `utf8` | **Source** `packages/front/fw/src/io/codec/utf8.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const utf8 = runtime.resolve('utf8');
// Returns: { toBytes, fromBytes }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `toBytes` | `(text: string) => Uint8Array` | UTF-8 bytes |
| `fromBytes` | `(bytes: Uint8Array\|number[]) => string` | JS string |

### `utf8.toBytes(text)`

```js
utf8.toBytes('Hello');    // Uint8Array [72, 101, 108, 108, 111]
utf8.toBytes('世界');     // Uint8Array [228, 184, 150, 231, 149, 140]
utf8.toBytes('é');        // Uint8Array [195, 169]
```

### `utf8.fromBytes(bytes)`

```js
utf8.fromBytes(new Uint8Array([72, 101, 108, 108, 111]));        // "Hello"
utf8.fromBytes(new Uint8Array([228, 184, 150, 231, 149, 140]));  // "世界"
```

## Examples

```js
const { utf8, b64, hex } = runtime.resolveAll(['utf8', 'b64', 'hex']);

// Encode text → bytes → base64
const bytes   = utf8.toBytes('Bonjour le monde');
const encoded = b64.fromBytes(bytes);
console.log(encoded); // "Qm9uam91ciBsZSBtb25kZQ=="

// Decode base64 → bytes → text
const decoded = utf8.fromBytes(b64.toBytes(encoded));
console.log(decoded); // "Bonjour le monde"

// View the hex representation
console.log(hex.fromBytes(utf8.toBytes('AB'))); // "4142"
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const utf8 = libs.utf8;
        const bytes = utf8.toBytes(args.text);
        self.postMessage(bytes);
    },
    { dependencies: ['utf8'], args: { text: 'Hello World' } }
);
```

## Notes

- Implemented via `encodeURI` (encoding) and manual decoding (decoding).
- Supports 1, 2 and 3-byte sequences — covers the Unicode BMP (U+0000 to U+FFFF).
- Non-BMP characters (emoji, etc.): represented as surrogate pairs via `encodeURI`.

## See also

- [hex](./hex.md), [b64](./b64.md), [buffer](./buffer.md)
