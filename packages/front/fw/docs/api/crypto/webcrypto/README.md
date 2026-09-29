# Crypto / WebCrypto

WebCrypto-backed primitive modules wrapping the platform `crypto.subtle`.
They are an **opt-in, async** alternative to the pure-JS crypto suite, which
stays the default. "Choosing pure-JS vs WebCrypto" = which module a consumer
resolves/imports; there is no runtime provider-selector (that orchestration
belongs to consumers, per the fw scope filter).

These modules cover the **subset** of the fw crypto surface that WebCrypto
implements. SHA-3/SHA-224, BLAKE2b, Argon2, ChaCha20-Poly1305, Poly1305, CMAC
and post-quantum (`ml_kem`/`ml_dsa`/`slh_dsa`) have no WebCrypto equivalent and
remain pure-JS only.

**Contract (differs from pure-JS):** every operation is `async` and resolves to
`Promise<Result | false>` over `Uint8Array` / `CryptoKey` (WebCrypto's native
`BufferSource`/`CryptoKey` types — **not** the pure-JS `bitArray`). No exception
is ever thrown: on an unavailable `crypto.subtle`, an invalid argument, or a
rejected `subtle` call, the module logs (`console.error`/`console.warn`) and
resolves `false`. Each module exposes `isAvailable(): boolean`. All factories
are pure and **worker-safe** (`crypto.subtle` is available in Web Workers).

| Module | Returns | Deps | Description |
|--------|---------|------|-------------|
| [digest](./digest.md) | `object` | none | SHA-1/256/384/512 one-shot digest (`crypto.subtle.digest`, FIPS 180-4 subset) |
| [hmac](./hmac.md) | `object` | none | HMAC sign/verify over SHA-256/384/512 (+ SHA-1 legacy), RFC 2104 |
| [pbkdf2](./pbkdf2.md) | `object` | none | PBKDF2 `deriveBits`/`deriveKey`, default 600 000 iterations (SP 800-132) |
| [hkdf](./hkdf.md) | `object` | none | HKDF `deriveBits`/`deriveKey`, combined extract+expand (RFC 5869) |
| [aes](./aes.md) | `object` | none | AES-GCM/CBC/CTR encrypt/decrypt + key generate/import/export (SP 800-38A/D) |
| [aeskw](./aeskw.md) | `object` | none | AES-KW key wrap/unwrap (RFC 3394 / SP 800-38F) |
| [rsa](./rsa.md) | `object` | none | RSA-OAEP / RSA-PSS / RSASSA-PKCS1-v1_5 + keypair generate/import/export |
| [ecc](./ecc.md) | `object` | none | ECDSA + ECDH on P-256/384/521, raw `r\|\|s` signatures + key formats |
| [ed25519](./ed25519.md) | `object` | none | Ed25519 sign/verify + import/export (RFC 8032) |
| [x25519](./x25519.md) | `object` | none | X25519 key agreement + import/export (RFC 7748) |

## Common pattern

```js
const webcryptoDigest = fw.runtime.resolve('webcryptoDigest');
if (webcryptoDigest.isAvailable()) {
    const digest = await webcryptoDigest.sha256(new TextEncoder().encode('hello'));
    // digest is a Uint8Array, or false on failure
}
```

## Notes

- **Newer algorithms**: `Ed25519` and `X25519` are recent WebCrypto additions;
  on older engines the underlying calls reject and the methods resolve `false`.
- **Key formats**: import/export is DER (`spki`/`pkcs8`), `jwk`, or `raw` — for
  PEM, use the pure-JS [`pem`](../utils/pem.md) module.

## See also

- [Hash](../hash/README.md), [Mode](../mode/README.md), [PKC](../pkc/README.md)
  — the pure-JS (default, synchronous, `bitArray`) counterparts.
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
