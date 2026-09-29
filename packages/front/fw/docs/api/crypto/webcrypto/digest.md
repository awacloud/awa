---
module: webcryptoDigest
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoDigest

> WebCrypto-backed async digest: SHA-1/256/384/512 via `crypto.subtle`.

**Module** `webcryptoDigest` | **Source** `packages/front/fw/src/crypto/webcrypto/digest.js` | **Deps** none | **Worker-safe** yes

Opt-in alternative to the pure-JS hash modules. Async, `Uint8Array` in / `Uint8Array` out. Every method resolves to `Uint8Array | false` — never rejects. For SHA-224, SHA-3, or BLAKE2b use the pure-JS modules; WebCrypto does not support them.

## Resolve

```js
const webcryptoDigest = runtime.resolve('webcryptoDigest');
// Returns: { isAvailable, digest, sha256, sha384, sha512, sha1 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `digest` | `(algorithm: 'SHA-1'\|'SHA-256'\|'SHA-384'\|'SHA-512', data: Uint8Array) => Promise<Uint8Array\|false>` | Hash result or `false` on error |
| `sha256` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | SHA-256 shorthand |
| `sha384` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | SHA-384 shorthand |
| `sha512` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | SHA-512 shorthand |
| `sha1` | `(data: Uint8Array) => Promise<Uint8Array\|false>` | SHA-1 shorthand — emits deprecation warning |

`digest` resolves `false` when:
- `crypto.subtle` is unavailable (`[crypto] NOT READY` logged)
- `algorithm` is not one of the four supported names (`[crypto] INVALID` logged)
- `data` is not a `Uint8Array` (`[crypto] INVALID` logged)
- `crypto.subtle.digest` rejects (`[crypto] FAIL` logged)

## Examples

### One-shot SHA-256

```js
const enc = (s) => new TextEncoder().encode(s);

const hash = await webcryptoDigest.sha256(enc('hello world'));
// hash is a Uint8Array (32 bytes)
```

### Generic digest call

```js
const result = await webcryptoDigest.digest('SHA-512', myUint8Array);
if (result === false) {
    // crypto.subtle unavailable, bad input, or subtle threw
}
```

### Availability guard

```js
if (!webcryptoDigest.isAvailable()) {
    // Fall back to pure-JS sha256 module
}
```

### SHA-1 (legacy interop only)

```js
// Emits: [crypto] DEPRECATED: SHA-1 is broken; use SHA-256+
const digest = await webcryptoDigest.sha1(legacyBytes);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const enc = (s) => new TextEncoder().encode(s);
        libs.webcryptoDigest.sha256(enc(args[0])).then(self.postMessage);
    },
    { dependencies: ['webcryptoDigest'], args: ['hello'] }
);
```

## Notes

- **Supported algorithms**: WebCrypto mandates exactly SHA-1, SHA-256, SHA-384, SHA-512 (FIPS 180-4). SHA-224, SHA-512/224, SHA-512/256, SHA-3, and BLAKE2b are **not** supported by the WebCrypto spec — use the pure-JS modules for those.
- **No-throw contract**: all methods are `async` and resolve to `Uint8Array | false`. `crypto.subtle` rejections are caught and logged; they never propagate.
- **Input type**: `data` must be a `Uint8Array`. Strings, `ArrayBuffer`, and `number[]` are rejected with `false`. Encode strings first with `TextEncoder` or `@awacloud/fw`'s `utf8` codec.
- **SHA-1 deprecation**: SHA-1 is cryptographically broken. `sha1()` is provided for legacy interoperability only and always emits `console.warn('[crypto] DEPRECATED: SHA-1 is broken; use SHA-256+')`.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; this module has no DOM dependency and no main-thread closures.

## See also

- [sha256](../hash/sha256.md) — pure-JS SHA-256, the default (synchronous, bitArray in/out)
- [sha384](../hash/sha384.md) — pure-JS SHA-384
- [sha512](../hash/sha512.md) — pure-JS SHA-512
- [sha224](../hash/sha224.md) — pure-JS SHA-224 (not available via WebCrypto)
- [sha3](../hash/sha3.md) — pure-JS SHA-3/SHAKE (not available via WebCrypto)
