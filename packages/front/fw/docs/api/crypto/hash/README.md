# Crypto / Hash

Hashes, MAC, KDF (RFC + FIPS / SP NIST). Four families:

- **SHA-2** (FIPS 180-4) — `sha224`, `sha256`, `sha384`, `sha512`, `sha512_224`, `sha512_256`.
- **SHA-3 / SHAKE** (FIPS 202) — `sha3` (1 module exposing all 6 variants).
- **MAC + KDF** (FIPS 198-1, SP 800-56C, SP 800-132) — `hmac`, `hkdf`, `pbkdf2`.
- **Non-NIST (RFC interop)** — `blake2b` (RFC 7693), `poly1305` (RFC 8439), `argon2` (RFC 9106), `adf` (KeePass interop).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [sha224](./sha224.md) | `{fn, hash}` | `sha256` | SHA-224 (FIPS 180-4 §6.3) — sha256 wrapper |
| [sha256](./sha256.md) | `{fn, hash, _internal}` | `bitArray`, `utf8` | SHA-256 (FIPS 180-4 §6.2) |
| [sha384](./sha384.md) | `{fn, hash}` | `sha512` | SHA-384 (FIPS 180-4 §6.5) — sha512 wrapper |
| [sha512](./sha512.md) | `{fn, hash, _internal}` | `bitArray`, `utf8` | SHA-512 (FIPS 180-4 §6.4) + parametric builder |
| [sha512_224](./sha512_224.md) | `{fn, hash}` | `sha512` | SHA-512/224 (FIPS 180-4 §5.3.6.1) |
| [sha512_256](./sha512_256.md) | `{fn, hash}` | `sha512` | SHA-512/256 (FIPS 180-4 §5.3.6.2) |
| [sha3](./sha3.md) | `{sha3_*, shake*, sha3_*_hash}` | `bitArray`, `utf8` | SHA-3 + SHAKE (FIPS 202) one-shot + streaming |
| [hmac](./hmac.md) | `{fn, verify}` | `bitArray`, `utf8`, `sha256` | Polymorphic HMAC (RFC 2104 / FIPS 198-1) over any hash |
| [hkdf](./hkdf.md) | `{extract, expand, derive}` | `bitArray`, `utf8`, `hmac` | HKDF (RFC 5869 / SP 800-56C Rev. 2) |
| [pbkdf2](./pbkdf2.md) | callable + `.derive`, `.MIN_RECOMMENDED_COUNT` | `bitArray`, `utf8`, `hmac` | PBKDF2 (RFC 2898 / SP 800-132), default 600,000 iter |
| [blake2b](./blake2b.md) | `{hash, fn}` | none | BLAKE2b (RFC 7693); salt/person; keyed mode |
| [poly1305](./poly1305.md) | `{mac, verify}` | none | Poly1305 (RFC 8439 §2.5) — 128-bit one-shot MAC |
| [argon2](./argon2.md) | `{hash, hashD, hashI, _internal}` | `blake2b` | Argon2id (RFC 9106); Argon2d/i explicit reject |
| [adf](./adf.md) | `{transform}` | `aes`, `sha256` | KeePass AES-DF (KDBX 3.x) — legacy interop |

## Common pattern (one-shot)

```js
const sha256 = fw.runtime.resolve('sha256');
const digestBa = sha256.hash('hello');               // bitArray (8 words × 32 bits)
const hex = fw.runtime.resolve('hex');
console.log(hex.fromBytes(bitArray.ba_to_ui8(digestBa)));
```

## Streaming pattern

```js
const sha512 = fw.runtime.resolve('sha512');
const h = new sha512.fn();
h.update(chunk1).update(chunk2);
const digestBa = h.finalize();
```

## See also

- [Mode](../mode/README.md) — AEAD / encryption modes
- [PKC](../pkc/README.md) — hash-based signatures
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
