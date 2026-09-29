---
module: webcryptoHkdf
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoHkdf

> WebCrypto-backed HKDF deriveBits/deriveKey wrapping crypto.subtle (RFC 5869).

**Module** `webcryptoHkdf` | **Source** `packages/front/fw/src/crypto/webcrypto/hkdf.js` | **Deps** none | **Worker-safe** yes

Performs HKDF key derivation (RFC 5869) via `crypto.subtle`: imports the IKM
as an HKDF base key, then calls `deriveBits` or `deriveKey`. Combined
extract+expand only — WebCrypto does not expose the separate HKDF-Extract and
HKDF-Expand primitives. Opt-in alternative to the pure-JS `hkdf` module.

Supported hashes: `'SHA-1'`, `'SHA-256'` (default), `'SHA-384'`, `'SHA-512'`.
SHA-3 and other hashes are not supported by the WebCrypto API.

## Resolve

```js
const h = runtime.resolve('webcryptoHkdf');
// Returns: { isAvailable, deriveBits, deriveKey }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present. |
| `deriveBits` | `(ikm, salt, info, lengthBits, hash?) => Promise<Uint8Array\|false>` | Derived key material as bytes, or `false` on error. |
| `deriveKey` | `(ikm, salt, info, derivedKeyAlg, usages, hash?, extractable?) => Promise<CryptoKey\|false>` | A `CryptoKey` ready to use, or `false` on error. |

### Parameters

**`deriveBits(ikm, salt, info, lengthBits, hash?)`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ikm` | `Uint8Array` | Input keying material. |
| `salt` | `Uint8Array` | Salt value. Empty `Uint8Array` is valid (RFC 5869 §2.2 treats it as a block of zeros). |
| `info` | `Uint8Array` | Context / application-specific information. May be empty. |
| `lengthBits` | `number` | Number of bits to derive. Must be a positive multiple of 8. |
| `hash` | `HashName?` | Hash algorithm. Default: `'SHA-256'`. |

**`deriveKey(ikm, salt, info, derivedKeyAlg, usages, hash?, extractable?)`**

| Parameter | Type | Description |
|-----------|------|-------------|
| `ikm` | `Uint8Array` | Input keying material. |
| `salt` | `Uint8Array` | Salt value. |
| `info` | `Uint8Array` | Context information. |
| `derivedKeyAlg` | `object` | WebCrypto key-algorithm descriptor (e.g. `{name:'AES-GCM',length:256}`). |
| `usages` | `KeyUsage[]` | Key usage array (e.g. `['encrypt','decrypt']`). |
| `hash` | `HashName?` | Hash algorithm. Default: `'SHA-256'`. |
| `extractable` | `boolean?` | Whether the derived key is extractable. Default: `false`. |

### Error behavior (no-throw contract)

All methods resolve to `false` (never reject) when:
- `crypto.subtle` is unavailable — logs `[crypto] NOT READY`.
- `hash` is not in the supported set — logs `[crypto] INVALID`.
- `lengthBits` is not a positive multiple of 8 — logs `[crypto] INVALID`.
- `crypto.subtle` rejects — logs `[crypto] FAIL`.

## Examples

### Derive raw key material (RFC 5869 Test Case 1)

```js
const h = runtime.resolve('webcryptoHkdf');

const ikm  = new Uint8Array([0x0b, 0x0b, /* … 22 bytes */]);
const salt = new Uint8Array([0x00, 0x01, 0x02, /* … */]);
const info = new Uint8Array([0xf0, 0xf1, /* … */]);

const okm = await h.deriveBits(ikm, salt, info, 336); // 42 bytes
// okm: Uint8Array(42) — matches RFC 5869 A.1 expected OKM
```

### Derive an AES-GCM key

```js
const aesKey = await h.deriveKey(
    ikm, salt, info,
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    'SHA-256'
);
// aesKey: CryptoKey { type: 'secret', algorithm: { name: 'AES-GCM', … } }
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
```

### Derive with empty salt and info

```js
// RFC 5869 §2.2: empty salt is treated as HashLen zeros internally
const okm = await h.deriveBits(ikm, new Uint8Array(0), new Uint8Array(0), 336);
```

### Worker usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const okm = await libs.webcryptoHkdf.deriveBits(
            args.ikm, args.salt, args.info, 256
        );
        self.postMessage(okm);
    },
    { dependencies: ['webcryptoHkdf'], args: { ikm, salt, info } }
);
```

## Notes

- **Combined extract+expand only**: WebCrypto HKDF does not expose the extract
  and expand stages separately. Use the pure-JS `hkdf` module when you need
  access to the intermediate PRK or per-component operations.
- **SHA-3 not supported**: WebCrypto mandates SHA-1/256/384/512 only.
  For HMAC-SHA-3 or BLAKE2b-based HKDF, use the pure-JS `hkdf` module.
- **Zero-length salt**: RFC 5869 §2.2 specifies that a missing/empty salt is
  treated as a string of HashLen zero bytes. `crypto.subtle` implements this
  correctly — pass `new Uint8Array(0)`.
- **OKM length limit**: RFC 5869 §2.3 limits output to `255 × HashLen` bytes.
  Violations are rejected by `crypto.subtle` (resolves to `false`).
- **Availability**: call `isAvailable()` before use in environments where
  `crypto.subtle` may be absent (e.g. `http:` pages, older Node.js without
  the `webcrypto` flag).

## See also

- [hkdf](../hash/hkdf.md) — pure-JS HKDF (extract+expand separately, bitArray I/O)
- [webcryptoPbkdf2](./pbkdf2.md) — WebCrypto PBKDF2 (password-based KDF)
- [webcryptoHmac](./hmac.md) — WebCrypto HMAC
- [webcryptoDigest](./digest.md) — WebCrypto SHA-256/384/512/1 digests
