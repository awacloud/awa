---
module: webcryptoAesKw
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoAesKw

> WebCrypto AES-KW key wrap/unwrap (RFC 3394) over `crypto.subtle`.

**Module** `webcryptoAesKw` | **Source** `packages/front/fw/src/crypto/webcrypto/aeskw.js` | **Deps** none | **Worker-safe** yes

Async, `CryptoKey` / `Uint8Array`. Wraps `crypto.subtle.wrapKey` / `unwrapKey` with the `AES-KW` algorithm (RFC 3394 / SP 800-38F §6.2). Supports 128, 192, and 256-bit key-encryption keys (KEKs). Opt-in alternative to the pure-JS `mode/kw` module. Every method resolves to a result or `false` — never rejects.

## Resolve

```js
const webcryptoAesKw = runtime.resolve('webcryptoAesKw');
// Returns: { isAvailable, generateKek, importKek, wrapKey, unwrapKey }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `generateKek` | `(lengthBits?: 128\|192\|256, extractable?: boolean) => Promise<CryptoKey\|false>` | New AES-KW KEK; default 256-bit, extractable |
| `importKek` | `(raw: Uint8Array, extractable?: boolean) => Promise<CryptoKey\|false>` | Import raw bytes as AES-KW KEK; default non-extractable |
| `wrapKey` | `(kek: CryptoKey, keyToWrap: CryptoKey) => Promise<Uint8Array\|false>` | Wrapped key bytes or `false` on error |
| `unwrapKey` | `(kek: CryptoKey, wrapped: Uint8Array, unwrappedKeyAlg: object, usages: KeyUsage[], extractable?: boolean) => Promise<CryptoKey\|false>` | Unwrapped CryptoKey or `false` on integrity failure |

**`importKek`**: `raw.length` must be 16 (128-bit), 24 (192-bit), or 32 (256-bit) bytes; other lengths resolve `false`.

**`wrapKey`**: the key being wrapped must be `extractable`; WebCrypto enforces this at the platform level.

**`unwrapKey`**: `unwrappedKeyAlg` is the algorithm dict of the wrapped key (e.g. `{ name: 'AES-GCM', length: 256 }`). An integrity failure (wrong KEK, tampered bytes) causes `crypto.subtle` to reject — the rejection is caught and `false` is returned.

## Examples

### Generate a KEK and wrap an inner key

```js
const webcryptoAesKw = runtime.resolve('webcryptoAesKw');

if (!webcryptoAesKw.isAvailable()) {
    // Fall back to the pure-JS kw module
}

// Generate a 256-bit KEK (non-extractable by default in importKek; extractable here)
const kek = await webcryptoAesKw.generateKek(256, false);

// The inner key must be extractable for wrapKey to succeed
const innerKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
);

const wrapped = await webcryptoAesKw.wrapKey(kek, innerKey);
// wrapped is a Uint8Array of length 40 (32 inner + 8 AES-KW IV)
```

### Import a KEK from raw bytes and unwrap

```js
const rawKek = new Uint8Array(32); // 256-bit key material
const kek = await webcryptoAesKw.importKek(rawKek, false);

const recovered = await webcryptoAesKw.unwrapKey(
    kek,
    wrapped,
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    false  // non-extractable
);

if (recovered === false) {
    // Integrity failure, wrong KEK, or crypto.subtle unavailable
}
```

### Availability guard

```js
if (!webcryptoAesKw.isAvailable()) {
    // Use pure-JS kw module as fallback
    const kw = runtime.resolve('kw');
    // kw.wrap(prf, plaintext)
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const kek = await libs.webcryptoAesKw.importKek(args.kekBytes, false);
        const recovered = await libs.webcryptoAesKw.unwrapKey(
            kek, args.wrapped, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']
        );
        self.postMessage(recovered !== false ? 'ok' : 'fail');
    },
    { dependencies: ['webcryptoAesKw'], args: { kekBytes, wrapped } }
);
```

## Notes

- **RFC 3394 AES-KW**: WebCrypto exposes AES-KW only — KWP (with-pad, RFC 5649) is not available via `crypto.subtle`. Use the pure-JS `kw` module for KWP or for environments without `crypto.subtle`.
- **Extractable inner key**: the key passed to `wrapKey` must be `extractable: true`; WebCrypto enforces this contract and rejects non-extractable keys — `wrapKey` returns `false` in that case.
- **No-throw contract**: all methods are `async` and resolve to a value or `false`. `crypto.subtle` rejections (integrity failure, invalid parameters) are caught and logged via `console.error('[crypto] FAIL: webcryptoAesKw.<method>: …')`. They never propagate.
- **KEK sizes**: AES-KW supports 128, 192, and 256-bit KEKs. `importKek` validates `raw.length ∈ {16, 24, 32}` and returns `false` for other sizes.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; this module has no DOM dependency and no main-thread closures.

## See also

- [kw](../mode/kw.md) — pure-JS AES-KW and KWP (RFC 3394 / RFC 5649); synchronous, bitArray in/out; default choice
- [aes](./aes.md) — WebCrypto AES-GCM/CBC bulk encryption (`crypto.subtle`)
- [webcryptoDigest](./digest.md) — WebCrypto SHA hash module
