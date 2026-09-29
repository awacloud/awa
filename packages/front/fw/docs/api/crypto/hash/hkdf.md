---
module: hkdf
category: crypto/hash
dependencies: [bitArray, utf8, hmac]
returns: object
worker-safe: true
status: complete
---

# hkdf

> HKDF (RFC 5869 / SP 800-56C Rev. 2) — extract-then-expand KDF based on HMAC.

**Module** `hkdf` | **Source** `packages/front/fw/src/crypto/hash/hkdf.js` | **Deps** `bitArray`, `utf8`, `hmac` | **Worker-safe** yes

Polymorphic on HMAC: default = HMAC-SHA-256; pass an `hmac` instance built over another hash for other families.

## Resolve

```js
const hkdf = runtime.resolve('hkdf');
// Returns: { extract, expand, derive }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `extract` | `(salt, ikm, Prff?) => bitArray` | PRK = HMAC-Hash(salt, IKM) |
| `expand` | `(prk, info, lengthBits, Prff?) => bitArray \| false` | OKM truncated to `lengthBits` |
| `derive` | `(salt, ikm, info, lengthBits, Prff?) => bitArray \| false` | One-shot extract + expand |

`Prff` is an `hmac` module instance (default = HMAC-SHA-256). For HMAC-SHA-512: `hmac.factory(bitArray, utf8, sha512)`.

## Examples

### One-shot

```js
const { hkdf } = fw.runtime.resolveAll(['hkdf']);

const okm = hkdf.derive(
    bitArray.ui8_to_ba(salt),
    bitArray.ui8_to_ba(ikm),
    bitArray.ui8_to_ba(new TextEncoder().encode('app-context-v1')),
    256                                          // bits requested
);
```

### Cr2 hybrid (post-quantum)

```js
// SP 800-56C Rev. 2 §5.8.2: IKM = Z || T (classical || PQ)
const Z = ml_kem768.decapsulate(...);            // 32 bytes
const T = ecdh_p256.derive(...);                 // 32 bytes
const ikm = bitArray.concat(Z, T);
const okm = hkdf.derive(salt, ikm, info, 256);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const okm = libs.hkdf.derive(args[0], args[1], args[2], 256);
        self.postMessage(okm);
    },
    { dependencies: ['hkdf'], args: [salt, ikm, info] }
);
```

## Notes

- **OKM limit**: `lengthBits / hashBits ≤ 255` (RFC 5869 §2.3). Otherwise `false` + `console.warn('INVALID')`.
- **Empty salt** = treated as `HashLen` zero bytes (RFC 5869 §2.2).
- **Cr2 hybrid + multi-expand**: Cr2 single = `extract(Z||T)`; multi-expand = 1 shared PRK + N distinct expand iterations (TLS-style multi-key derivation).

## See also

- [hmac](./hmac.md), [sha256](./sha256.md), [sha512](./sha512.md), [sha3](./sha3.md)
- [pbkdf2](./pbkdf2.md) — password-based alternative
- [Conformance hkdf.acvp.md](../../../../src/crypto/hash/hkdf.acvp.md)
