---
module: cbor
category: io/codec
dependencies: [utf8]
returns: object
worker-safe: true
status: complete
---

# cbor

> CBOR encoder/decoder (RFC 8949) — full conformance. Standard interoperable alternative to the internal [buffer](./buffer.md) codec.

**Module** `cbor` | **Source** `packages/front/fw/src/io/codec/cbor.js` | **Deps** `utf8` | **Worker-safe** yes

**Conformance level**:
- §3 — Basic Generic Encoder/Decoder ✅
- §4.1 — Preferred Serialization ✅ (always)
- §4.2 — Core Deterministic Encoding ✅ (option `{ deterministic: true }`)

Usable in COSE, WebAuthn, dag-cbor, CTAP2 contexts — where a signature or hash is applied over the encoding and thus requires bytewise determinism.

## Resolve

```js
const cbor = runtime.resolve('cbor');
// Returns: { encode, decode, Tagged, Simple }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `encode` | `(value: any, options?: {deterministic?: boolean}) => Uint8Array` | CBOR representation |
| `decode` | `(bytes: Uint8Array, options?: {useMap?: boolean}) => any` | Reconstructed JS value |
| `Tagged` | `class Tagged(tag, value)` | CBOR tag wrapper (major type 6) |
| `Simple` | `class Simple(value)` | CBOR simple value (major type 7, 0..255 excluding 20..23 which alias primitives and 24..31 reserved) |

## JS ↔ CBOR mapping

| JS value | CBOR encoding |
|----------|---------------|
| `null` | `0xf6` |
| `undefined` | `0xf7` |
| `false` / `true` | `0xf4` / `0xf5` |
| `Number` integer in `[-2^32, 2^32-1]` | major 0 / 1 (shortest form) |
| `Number` fractional or out of range | float16 / float32 / float64 (shortest exact) |
| `BigInt` 0..2^64-1 | major 0 |
| `BigInt` -2^64..-1 | major 1 |
| `BigInt` beyond | tag 2 / 3 + byte string |
| `String` | major 3 (UTF-8) |
| `Uint8Array` | major 2 |
| `Array` | major 4 |
| `Map` | major 5 (order preserved) |
| `Object` (plain) | major 5 (via `Object.keys`) |
| `Tagged` | major 6 (passthrough) |
| `Simple` | major 7 (simple value 0..19 or 32..255) |
| `-0` | preserved as float16 (`0xf98000`) |
| `NaN` | canonical NaN (`0xf97e00`) |

## Examples

### Basic

```js
const cbor = runtime.resolve('cbor');

const bytes = cbor.encode({ name: 'Alice', age: 30, tags: ['admin', 'user'] });
// Uint8Array<0xa3 0x64 0x6e 0x61 0x6d 0x65 ...>

const back = cbor.decode(bytes);
// { name: 'Alice', age: 30, tags: ['admin', 'user'] }
```

### Binary data + BigInt

```js
const payload = cbor.encode({
    blob: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    id:   2n ** 80n      // will be encoded as tag 2 (positive bignum)
});
const { blob, id } = cbor.decode(payload);
// blob : Uint8Array, id : 1208925819614629174706176n
```

### Custom tags (passthrough)

```js
const { Tagged } = cbor;

// Tag 1 (RFC 8949 §3.4.2) : date/time in seconds since epoch
const encoded = cbor.encode(new Tagged(1, Date.now() / 1000));
const decoded = cbor.decode(encoded);
// decoded instanceof Tagged → true
// decoded.tag === 1, decoded.value === timestamp
```

### Deterministic encoding (§4.2)

```js
// Without option: insertion order preserved
cbor.encode({ b: 2, a: 1 });
// → a2 61 62 02 61 61 01   (b first)

// With deterministic: bytewise lex sort of encoded keys
cbor.encode({ b: 2, a: 1 }, { deterministic: true });
// → a2 61 61 01 61 62 02   (a first)
```

Applied rules (all §4.2 requirements):
- integers in shortest form;
- floats reduced to shortest exact (f16 → f32 → f64);
- canonical `NaN` (`f97e00`);
- `-0` preserved as f16;
- map keys sorted **recursively** in bytewise lexicographic order of their encoded form (includes nested maps);
- definite lengths only.

**Use for**: COSE_Sign / COSE_Mac (RFC 9052), dag-cbor CIDs (IPLD), WebAuthn attestation, CTAP2.

### Preserving Map type on decode

```js
// Default: CBOR map → JS Object (keys coerced to string)
cbor.decode(bytes);
// { '1': 'one', '2': 'two' }

// useMap: true → Map with original keys and order preserved
cbor.decode(bytes, { useMap: true });
// Map { 1 => 'one', 2 => 'two' }
```

Required when keys are numeric, binary, or non-string, or when iteration order matters.

### Simple values

```js
const { Simple } = cbor;

cbor.encode(new Simple(0));     // e0
cbor.encode(new Simple(16));    // f0
cbor.encode(new Simple(255));   // f8 ff

// Rejected by the encoder (reserved):
// cbor.encode(new Simple(24));  → throw
// cbor.encode(new Simple(31));  → throw
```

Simple values (20..23) are aliases for `false`/`true`/`null`/`undefined` — use JS primitives directly.

### Decoding indefinite lengths

The decoder accepts indefinite-length containers produced by other implementations (`0x5f`, `0x7f`, `0x9f`, `0xbf`) — the encoder always uses definite lengths (preferred deterministic form).

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [bytes] = args;
        const value = libs.cbor.decode(new Uint8Array(bytes));
        self.postMessage(value);
    },
    { dependencies: ['cbor'], args: [Array.from(cborBytes)] }
);
```

## Notes

- `Number.isInteger(x)` triggers integer encoding even for `1.0`, `0.0` (identical in JS). To force a float, use an explicit fractional value.
- Unsupported JS types: `Symbol`, `Function`, `Promise`, `Date` — no implicit conversion. For dates, wrap via `Tagged(0, iso)` (tag 0, RFC 8949 §3.4.1) or `Tagged(1, epoch)` (tag 1, §3.4.2) depending on the intended semantics.
- `Map` → CBOR map (order preserved). To retrieve a `Map` on decode, use `{ useMap: true }`.
- Duplicate keys on input: the decoder takes the last occurrence (RFC §5.6 classifies this as "well-formed but invalid" — the emitter's responsibility).
- Comparison with [buffer](./buffer.md): `buffer` is more compact for small integers and uses a typed header; `cbor` is standard and interoperates with COSE, WebAuthn, IPLD, CTAP.

## See also

- [msgpack](./msgpack.md) — more compact non-IETF alternative
- [buffer](./buffer.md) — awa internal binary format
- [utf8](./utf8.md) — dependency
