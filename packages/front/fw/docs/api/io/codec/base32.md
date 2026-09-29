---
module: base32
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# base32

> Base32 encoding/decoding (RFC 4648) with `=` padding. Uppercase alphabet `A–Z 2–7`.

**Module** `base32` | **Source** `packages/front/fw/src/io/codec/base32.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const base32 = runtime.resolve('base32');
// Returns: { fromBytes, toBytes, test }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `fromBytes` | `(bytes: Uint8Array\|number[]) => string` | Uppercase Base32 string with `=` padding |
| `toBytes` | `(str: string) => Uint8Array` | Byte array (accepts uppercase or lowercase) |
| `test` | `(str: string) => boolean` | `true` if valid Base32 (uppercase, RFC padding) |

### `base32.fromBytes(bytes)`

Output is always in 8-character blocks, padded with `=`.

```js
base32.fromBytes(new Uint8Array([0x66]));                   // "MY======"
base32.fromBytes(new Uint8Array([0x66, 0x6f, 0x6f]));       // "MZXW6==="
base32.fromBytes(new Uint8Array([72, 101, 108, 108, 111])); // "JBSWY3DP"
```

### `base32.toBytes(str)`

Tolerant: accepts lowercase and optional padding.

```js
base32.toBytes('JBSWY3DP');  // Uint8Array [72, 101, 108, 108, 111]
base32.toBytes('MZXW6===');  // Uint8Array [0x66, 0x6f, 0x6f]
base32.toBytes('mzxw6');     // same (lowercase + no padding)
```

### `base32.test(str)`

Strict: requires uppercase, length multiple of 8, valid RFC 4648 padding (0, 1, 3, 4 or 6 `=`).

```js
base32.test('JBSWY3DP');        // true
base32.test('MZXW6===');        // true
base32.test('mzxw6===');        // false — lowercase
base32.test('MZXWYZ==');        // false — padding of 2 not allowed
base32.test('MZXW6');           // false — length not a multiple of 8
```

## Examples

```js
const { base32, utf8 } = runtime.resolveAll(['base32', 'utf8']);

const bytes   = utf8.toBytes('foobar');
const encoded = base32.fromBytes(bytes); // "MZXW6YTBOI======"

if (base32.test(encoded)) {
    const decoded = base32.toBytes(encoded);
    console.log(utf8.fromBytes(decoded)); // "foobar"
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [raw] = args;
        self.postMessage(libs.base32.fromBytes(new Uint8Array(raw)));
    },
    { dependencies: ['base32'], args: [[0x66, 0x6f, 0x6f]] }
);
```

## Notes

- RFC 4648 standard: alphabet `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567`.
- `fromBytes`: 5 bits per character, output padded in blocks of 8 (valid paddings: 0, 1, 3, 4, 6 `=`).
- `toBytes`: silently normalises case and ignores characters outside the alphabet.
- Typical use: TOTP/HOTP (shared secrets), case-insensitive identifiers.

## See also

- [b64](./b64.md), [base58](./base58.md), [hex](./hex.md)
