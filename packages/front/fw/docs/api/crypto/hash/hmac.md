---
module: hmac
category: crypto/hash
dependencies: [bitArray, utf8, sha256]
returns: object
worker-safe: true
status: complete
---

# hmac

> HMAC (RFC 2104 / FIPS 198-1) — keyed-hash construction polymorphic over any hash module.

**Module** `hmac` | **Source** `packages/front/fw/src/crypto/hash/hmac.js` | **Deps** `bitArray`, `utf8`, `sha256` | **Worker-safe** yes

Default = HMAC-SHA-256. Pass any hash module as the 2nd argument for HMAC-SHA-512, HMAC-SHA-3-256, etc.

## Resolve

```js
const hmac = runtime.resolve('hmac');
// Returns: { fn, verify }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `fn` | `constructor(key, Hash?)` | Streaming + one-shot instance |
| `fn.prototype.encrypt` | `(data) => bitArray` | Alias for `mac`; full tag |
| `fn.prototype.mac` | `(data) => bitArray` | Same as encrypt |
| `fn.prototype.update` | `(data) => this` | Streaming chainable |
| `fn.prototype.digest` | `() => bitArray` | Emits the tag, resets |
| `verify` | `(key, data, tag, Hash?) => boolean` | Constant-time comparison |

## Examples

### HMAC-SHA-256 (default)

```js
const { hmac, hex, bitArray } = fw.runtime.resolveAll(['hmac', 'hex', 'bitArray']);
const key = bitArray.ui8_to_ba(new TextEncoder().encode('secret'));
const tag = new hmac.fn(key).encrypt('message');
hex.fromBytes(bitArray.ba_to_ui8(tag));
```

### HMAC-SHA-512

```js
const { hmac, sha512 } = fw.runtime.resolveAll(['hmac', 'sha512']);
const tag = new hmac.fn(key, sha512).encrypt('message');
```

### HMAC-SHA-3-256

```js
const { hmac, sha3 } = fw.runtime.resolveAll(['hmac', 'sha3']);
const tag = new hmac.fn(key, sha3.sha3_256_hash).encrypt('message');
```

### Constant-time verification

```js
const ok = hmac.verify(key, 'message', expectedTag);   // true / false
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const tag = new libs.hmac.fn(args[0]).encrypt(args[1]);
        self.postMessage(tag);
    },
    { dependencies: ['hmac'], args: [keyBa, 'message'] }
);
```

## Notes

- **Polymorphic**: any `Hash` that exposes `{fn, hash, fn.prototype.blockSize}` is accepted — SHA-2, SHA-3, SHA-512/224, SHA-512/256.
- **`verify` constant-time** via `bitArray.equal` (XOR-accumulated, no early-exit).
- **HMAC-SHA-1 not exposed** — deprecated SP 800-131A §5; no `sha1` factory registered.
- **`encrypt` after update**: `console.warn('INVALID')` + `false` if the instance has already been updated.

## See also

- [sha256](./sha256.md), [sha512](./sha512.md), [sha3](./sha3.md), [sha512_224](./sha512_224.md), [sha512_256](./sha512_256.md) — injectable hashes
- [hkdf](./hkdf.md), [pbkdf2](./pbkdf2.md) — HMAC-based KDFs
- [Conformance hmac.acvp.md](../../../../src/crypto/hash/hmac.acvp.md)
