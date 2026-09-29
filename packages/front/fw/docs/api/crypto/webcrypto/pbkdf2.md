---
module: webcryptoPbkdf2
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoPbkdf2

> Async PBKDF2 key derivation via `crypto.subtle` — SHA-1/256/384/512 PRFs, zero dependencies.

**Module** `webcryptoPbkdf2` | **Source** `packages/front/fw/src/crypto/webcrypto/pbkdf2.js` | **Deps** none | **Worker-safe** yes

The factory returns an object with `isAvailable`, `deriveBits`, and `deriveKey`. Wraps
`crypto.subtle.importKey` + `deriveBits` / `deriveKey`. Default iteration count is
600 000 (OWASP 2023). All methods are `async` and resolve to `false` on any error —
they never throw or reject.

## Resolve

```js
import { webcryptoPbkdf2 } from '@awacloud/fw/crypto/webcrypto/pbkdf2';
const wc = webcryptoPbkdf2.factory();

if (!wc.isAvailable()) {
    // Fall back to pure-JS pbkdf2 module
}
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `deriveBits` | `(password, salt, lengthBits, iterations?, hash?) => Promise<Uint8Array\|false>` | Derived key bytes, or `false` on error |
| `deriveKey` | `(password, salt, derivedKeyAlg, usages, iterations?, hash?, extractable?) => Promise<CryptoKey\|false>` | Derived `CryptoKey`, or `false` on error |

### Parameters

**`deriveBits`**

| Parameter | Type | Default | Constraint |
|-----------|------|---------|------------|
| `password` | `Uint8Array` | — | required |
| `salt` | `Uint8Array` | — | required |
| `lengthBits` | `number` | — | positive multiple of 8 |
| `iterations` | `number` | `600000` | positive integer ≥ 1 |
| `hash` | `HashName` | `'SHA-256'` | one of `SHA-1`, `SHA-256`, `SHA-384`, `SHA-512` |

**`deriveKey`**

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `password` | `Uint8Array` | — | required |
| `salt` | `Uint8Array` | — | required |
| `derivedKeyAlg` | `object` | — | WebCrypto key-algorithm dict, e.g. `{name:'AES-GCM', length:256}` |
| `usages` | `KeyUsage[]` | — | e.g. `['encrypt', 'decrypt']` |
| `iterations` | `number` | `600000` | positive integer ≥ 1 |
| `hash` | `HashName` | `'SHA-256'` | one of `SHA-1`, `SHA-256`, `SHA-384`, `SHA-512` |
| `extractable` | `boolean` | `false` | whether the key material can be exported |

## Examples

### Derive raw key bytes (AES-256)

```js
const enc = new TextEncoder();
const wc = webcryptoPbkdf2.factory();

const dk = await wc.deriveBits(
    enc.encode('correct horse battery staple'),
    enc.encode('unique-per-user-salt'),
    256,       // bits — 32 bytes
    600000,    // OWASP 2023
    'SHA-256'
);
// dk: Uint8Array(32)
```

### Derive a CryptoKey for AES-GCM

```js
const key = await wc.deriveKey(
    enc.encode('passphrase'),
    enc.encode('salt'),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    600000,
    'SHA-256'
);
if (key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
}
```

### Worker-offload (recommended for high iteration counts)

PBKDF2 at 600 000 iterations takes ~300–800 ms. Delegate to a Worker to keep the UI responsive:

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const wc = libs.webcryptoPbkdf2.factory();
        wc.deriveBits(args[0], args[1], 256, 600000).then(dk => self.postMessage(dk));
    },
    { dependencies: ['webcryptoPbkdf2'], args: [password, salt] }
);
```

### Check availability and fall back

```js
const wc = webcryptoPbkdf2.factory();
if (wc.isAvailable()) {
    return await wc.deriveBits(password, salt, 256, 600000);
} else {
    // Fall back to pure-JS pbkdf2 module
    return pbkdf2(password, salt, 600000, 256);
}
```

## Notes

- **Default 600 000 iterations** matches OWASP 2023 for PBKDF2-HMAC-SHA-256 password storage.
- **Supported PRFs**: SHA-1, SHA-256, SHA-384, SHA-512 only — the WebCrypto specification
  restricts PBKDF2 to the SHA-1/2 family. For SHA-3 PRFs use the pure-JS `pbkdf2` module.
- **Validation**: invalid `iterations` (< 1 or non-integer), `lengthBits` (≤ 0 or not a multiple
  of 8), or unsupported `hash` resolve to `false` with a `[crypto] INVALID` console error.
- **No throw contract**: every failure path catches internally and resolves `false`.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; the factory captures no
  main-thread references.

## See also

- [`../hash/pbkdf2.md`](../hash/pbkdf2.md) — pure-JS PBKDF2 (SHA-1/2 and SHA-3 PRFs, bitArray I/O)
- [`./hkdf.md`](./hkdf.md) — WebCrypto HKDF (non-password KDF)
- [`./digest.md`](./digest.md) — WebCrypto digest (SHA-1/256/384/512)
