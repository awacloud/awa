---
module: blake2b
category: crypto/hash
dependencies: []
returns: object
worker-safe: true
status: complete
---

# blake2b

> BLAKE2b (RFC 7693) — hash 1-512 bits, keyed-mode + salt + person support.

**Module** `blake2b` | **Source** `packages/front/fw/src/crypto/hash/blake2b.js` | **Deps** none | **Worker-safe** yes

Extremely fast hash (1× faster than MD5, ~2× SHA-256) with security margins ≥ SHA-2. Outside NIST but used by Argon2 and widely adopted (libsodium, IPFS).

## Resolve

```js
const blake2b = runtime.resolve('blake2b');
// Returns: { hash, fn }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `hash(msg, outLen=64, opts?)` | `(Uint8Array, number, {key?, salt?, person?}) => Uint8Array` | One-shot digest, outLen ∈ [1, 64] bytes |
| `fn(outLen?, opts?)` | constructor | Streaming `update`/`finalize` |
| `fn.prototype.update(data)` | `(Uint8Array) => this` | Absorbs input |
| `fn.prototype.finalize()` | `() => Uint8Array` | Emits the digest |

### Options

| Option | Type | Description |
|--------|------|-------------|
| `key` | `Uint8Array(0..64)` | Keyed mode (HMAC alternative, faster) |
| `salt` | `Uint8Array(16)` | Per-instance domain separation |
| `person` | `Uint8Array(16)` | Per-application domain separation |

## Examples

```js
const { blake2b, hex } = fw.runtime.resolveAll(['blake2b', 'hex']);

// One-shot 256-bit
const out = blake2b.hash(new TextEncoder().encode('abc'), 32);
hex.fromBytes(out);
```

### Keyed (HMAC alternative)

```js
const tag = blake2b.hash(msg, 32, { key: secretKey });
```

### Streaming

```js
const h = new blake2b.fn(64);
h.update(chunk1);
h.update(chunk2);
const out = h.finalize();
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.blake2b.hash(args[0], 32));
    },
    { dependencies: ['blake2b'], args: [msgBytes] }
);
```

## Notes

- **outLen**: 1 to 64 bytes; `outLen=64` = SHA-512 strength.
- **outLen ≠ truncate**: `hash(msg, 32) !== hash(msg, 64).slice(0, 32)` (outLen is bound into the IV).
- **Outside NIST**: no FIPS / SP 800. Validation = RFC 7693 + self-test §E (48 sub-tests byte-exact).

## See also

- [argon2](./argon2.md) — uses `blake2b` internally
- [poly1305](./poly1305.md), [hmac](./hmac.md) — keyed alternatives
- [Conformance blake2b.acvp.md](../../../../src/crypto/hash/blake2b.acvp.md)
