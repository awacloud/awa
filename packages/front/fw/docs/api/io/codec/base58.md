---
module: base58
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# base58

> Base58 encoding/decoding with the Bitcoin/IPFS alphabet (without `0`, `O`, `I`, `l`). No padding. Leading zero bytes are preserved as leading `1` characters.

**Module** `base58` | **Source** `packages/front/fw/src/io/codec/base58.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const base58 = runtime.resolve('base58');
// Returns: { fromBytes, toBytes, test }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `fromBytes` | `(bytes: Uint8Array\|number[]) => string` | Base58 string (variable length, no padding) |
| `toBytes` | `(str: string) => Uint8Array` | Byte array — **throws** on invalid character |
| `test` | `(str: string) => boolean` | `true` if all characters are in the alphabet |

### `base58.fromBytes(bytes)`

Long-division algorithm base-256 → base-58. Each leading `0x00` byte becomes a leading `'1'`.

```js
base58.fromBytes(new Uint8Array([0x61]));              // "2g"
base58.fromBytes(new Uint8Array([0, 0, 0x61]));        // "112g"  ← leading zeros preserved
base58.fromBytes(new Uint8Array([
    0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20,
    0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21
]));                                                    // "2NEpo7TZRRrLZSi2U"
```

### `base58.toBytes(str)`

Throws an error if a character outside the alphabet is encountered.

```js
base58.toBytes('2g');               // Uint8Array [0x61]
base58.toBytes('112g');             // Uint8Array [0, 0, 0x61]
base58.toBytes('2NEpo7TZRRrLZSi2U');// Uint8Array [...] ("Hello World!")
base58.toBytes('Hello0');           // throw — '0' outside alphabet
```

### `base58.test(str)`

```js
base58.test('2NEpo7TZRRrLZSi2U'); // true
base58.test('');                   // true — empty string accepted
base58.test('0OIl');               // false — excluded characters
base58.test('Hello!');             // false — '!' outside alphabet
```

## Examples

```js
const base58 = runtime.resolve('base58');

// Bitcoin-like address: 1 version + 20 hash + 4 checksum
const payload = new Uint8Array(25);
payload[0] = 0x00; // mainnet → leading '1'
for (let i = 1; i < 25; i++) payload[i] = (i * 7) & 0xff;

const address = base58.fromBytes(payload);
console.log(address.startsWith('1')); // true

const back = base58.toBytes(address);
// back is equivalent to payload (leading zeros preserved)
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [raw] = args;
        self.postMessage(libs.base58.fromBytes(new Uint8Array(raw)));
    },
    { dependencies: ['base58'], args: [[0x61, 0x62, 0x63]] }
);
```

## Notes

- Alphabet: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz` (58 characters, without `0`, `O`, `I`, `l`).
- No padding — output length depends on the numeric value of the input (≈ `1.366 × len` characters on average).
- Leading `0x00` bytes are encoded as the same number of leading `'1'` characters (and vice versa).
- `toBytes` **throws** on invalid character (unlike `base32` which ignores them).
- O(n²) complexity due to long-division — suitable for addresses/keys (~32–64 bytes), avoid for large volumes.
- Typical use: Bitcoin addresses, WIF keys, IPFS CIDs (v0), compact human-readable identifiers.

## See also

- [b64](./b64.md), [base32](./base32.md), [hex](./hex.md)
