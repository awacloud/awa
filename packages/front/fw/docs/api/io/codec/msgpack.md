---
module: msgpack
category: io/codec
dependencies: [utf8]
returns: object
worker-safe: true
status: complete
---

# msgpack

> MessagePack encoder/decoder (full official spec, including the timestamp extension type -1). Compact binary format, denser alternative to JSON.

**Module** `msgpack` | **Source** `packages/front/fw/src/io/codec/msgpack.js` | **Deps** `utf8` | **Worker-safe** yes

**Conformance level**: full MessagePack spec — all formats (nil, bool, int, float32/64, str, bin, array, map, ext) **including the standard timestamp extension (-1)**. Encoded in shortest form (float32 if exact, otherwise float64; fixint before int8/16/32; fixstr before str8/16/32; etc.).

## Resolve

```js
const msgpack = runtime.resolve('msgpack');
// Returns: { encode, decode, Ext }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `encode` | `(value: any) => Uint8Array` | MessagePack representation |
| `decode` | `(bytes: Uint8Array, options?: {useMap?: boolean}) => any` | Reconstructed JS value |
| `Ext` | `class Ext(type, data)` | Ext wrapper (type ∈ [-128, 127], data: `Uint8Array`). Type -1 reserved for the standard timestamp (handled automatically via `Date`) |

## JS ↔ MessagePack mapping

| JS value | Encoding |
|----------|----------|
| `null`, `undefined` | `0xc0` (nil) |
| `false`, `true` | `0xc2` / `0xc3` |
| `Number` integer in `[-2^31, 2^32-1]` | (neg)fixint / uint / int 8/16/32 (shortest) |
| `Number` fractional or out of range | `float64` (`0xcb`) |
| `BigInt` `[0, 2^64-1]` | `uint64` (`0xcf`) |
| `BigInt` `[-2^63, 0)` | `int64` (`0xd3`) |
| `String` | fixstr / str8 / str16 / str32 (UTF-8) |
| `Uint8Array` | bin8 / bin16 / bin32 |
| `Array` | fixarray / array16 / array32 |
| `Map` | fixmap / map16 / map32 (order preserved) |
| `Object` (plain) | fixmap / map16 / map32 |
| `Date` | timestamp 32 / 64 / 96 (fixext4 / fixext8 / ext8) |
| `Ext` | fixext 1/2/4/8/16 or ext8/16/32 |
| `-0` | preserved as float32 (`0xca 80 00 00 00`) |

## Examples

### Basic

```js
const msgpack = runtime.resolve('msgpack');

const bytes = msgpack.encode({ name: 'Alice', age: 30, tags: ['admin', 'user'] });
const back  = msgpack.decode(bytes);
// { name: 'Alice', age: 30, tags: ['admin', 'user'] }
```

### Extensions (passthrough)

```js
const { Ext } = msgpack;

// Type 1: application-defined (e.g. custom 64-bit timestamp)
const encoded = msgpack.encode(new Ext(1, new Uint8Array([0, 1, 2, 3])));
const decoded = msgpack.decode(encoded);
// decoded instanceof Ext → true
// decoded.type === 1, decoded.data : Uint8Array([0, 1, 2, 3])
```

### BigInt

```js
msgpack.encode(0xffffffffffffffffn);     // cfffffffffffffffff  (uint64)
msgpack.encode(-0x8000000000000000n);    // d38000000000000000  (int64)
// Beyond 64 bits: throw
```

### Dates (timestamp extension standard)

`Date` is auto-encoded using the official type -1 extension and decoded back to `Date`:

```js
const now = new Date();
msgpack.encode(now);               // d6 ff xxxxxxxx (timestamp 32) or d7 ff ... (64) or c7 0c ff ... (96)
msgpack.decode(encoded);           // Date

// Dates before 1970 or far in the future → timestamp 96 (12 bytes)
msgpack.encode(new Date('1900-01-01T00:00:00.500Z'));
```

Variant chosen automatically:
- **timestamp 32** (6 bytes): whole second, 1970 ≤ year ≤ 2106.
- **timestamp 64** (10 bytes): nanosecond precision, 1970 ≤ year ≤ ~2514.
- **timestamp 96** (15 bytes): otherwise (before 1970 or far in the future).

### Preserving Map type on decode

```js
// Default: msgpack map → JS Object (keys coerced to string)
msgpack.decode(bytes);

// useMap: true → Map with original keys and order preserved
msgpack.decode(bytes, { useMap: true });
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [bytes] = args;
        const value = libs.msgpack.decode(new Uint8Array(bytes));
        self.postMessage(value);
    },
    { dependencies: ['msgpack'], args: [Array.from(msgpackBytes)] }
);
```

## Notes

- Integers and strings encoded in shortest form (fixint before int8/16/32, fixstr before str8/16/32, etc.).
- Floats are emitted as `float32` if the value is exactly representable, otherwise `float64` — symmetric interop with msgpack-c, msgpack-python, msgpack-go.
- `undefined` is encoded as `nil` (`0xc0`) and read back as `null` (information loss, consistent with reference implementations).
- `Map` input → msgpack map. To retrieve a `Map` on output, use `{ useMap: true }`.
- BigInt outside the 64-bit range → **throw** (MessagePack has no standard "bignum" extension; use a custom `Ext` or switch to [cbor](./cbor.md) which handles bignums via tags 2/3).
- Directly unsupported JS types: `Symbol`, `Function`, `Promise`.
- Comparison:
  - [cbor](./cbor.md): richer (float16, typed tags, bignum, deterministic encoding for crypto), IETF standard.
  - [buffer](./buffer.md): awa internal format, most compact for small integers, non-interop.
  - `msgpack`: most widely used in the Redis / MongoDB / ZeroMQ / Fluentd ecosystem.

## See also

- [cbor](./cbor.md) — IETF standard alternative
- [buffer](./buffer.md) — awa internal binary format
- [utf8](./utf8.md) — dependency
