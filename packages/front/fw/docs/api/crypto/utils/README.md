# Crypto / Utils

Utilities: DRBG, key generation, algebraic primitives (BN, bitArray), formats (PEM, ASN.1, key formats), high-level wrappers, UUID identifiers.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [random](./random.md) | `{fill, float, int, bytes, words, bits, drbg, health, isReady, selfTest}` | `bitArray`, `aes`, `sha256` | CTR_DRBG-AES-256 (SP 800-90A) + RCT/APT (SP 800-90B); AES-128/192 + df via `internalOf(random).makeDrbg` (internal slot) |
| [rsaKeygen](./rsaKeygen.md) | `{generate, generateProbablePrime}` | `bn`, `random` | RSA 2048+ generation (FIPS 186-5 §A.1.3, probable primes) |
| [bn](./bn.md) | constructor `BN` + statics | `bitArray`, `random` | Big integer (SJCL-derived, BSD-2-Clause; see [provenance](../../../dev/provenance.md)) — ECDSA / RSA arithmetic |
| [bitArray](./bitArray.md) | `{...}` | none | Bit-precise representation (SJCL convention, see [provenance](../../../dev/provenance.md); 32-bit words + partial last word) |
| [pad](./pad.md) | `{pad, strip}` | none | PKCS#7 padding (RFC 5652 §6.3) |
| [pem](./pem.md) | `{encode, decode}` | none | PEM (RFC 7468) — Base64 encoding + BEGIN/END headers |
| [asn1](./asn1.md) | `{TAG, encode*, parseOne, parseChildren, read*}` | none | ASN.1 DER (X.690) — primitive tag serialisation |
| [asn1Oid](./asn1-oid.md) | `{lookup, byName, findByCategory, OID_DATABASE}` | none | ASN.1 OID database — bidirectional name ↔ OID resolution (≥ 180 OIDs, 12 categories) |
| [keyformat](./keyformat.md) | `{encodePkcs8Edwards, decodePkcs8Edwards, encodeSpkiEdwards, decodeSpkiEdwards, encodeSec1, decodeSec1, encodePkcs8Ec, decodePkcs8Ec, encodeSpkiEc, decodeSpkiEc, encodeRsaPublicKey, decodeRsaPublicKey, encodeRsaPrivateKey, decodeRsaPrivateKey, encodeSpkiRsa, decodeSpkiRsa, encodePkcs8Rsa, decodePkcs8Rsa, OID}` | `asn1` | RSA / EC (P-256/384/521) / Ed25519 / X25519 key serialisation — PKCS#8, SPKI, SEC1, PKCS#1 |
| [x509](./x509.md) | `{create, parse, verify, toPem, fromPem}` | `asn1`, `keyformat`, `pem`, `ed25519`, `ecc`, `sha256`, `bitArray` | X.509 v3 certificates (RFC 5280) for Ed25519 / ECDSA P-256 keys — create, parse, verify |
| [jws](./jws.md) | `{sign, verify, signJwt, verifyJwt}` | `bitArray`, `utf8`, `b64`, `hmac`, `sha256`, `sha512`, `ed25519` | JSON Web Signature (RFC 7515) HS*/EdDSA |
| [aes_modes](./aes_modes.md) | `{cbc, ctr, gcm, kw}` | `bitArray`, `aes`, `cbc`, `ctr`, `gcm`, `kw`, `pad` | Uniform Uint8Array wrapper over all AES modes |
| [totp](./totp.md) | `{generate, verify, enroll, uri}` | `hmac`, `random`, `base32` | TOTP RFC 6238 + HOTP RFC 4226 — time-based OTP codes |
| [uuid](./uuid.md) | `{v1, v4}` | `hex` | UUID v1 (time-based) + v4 (random) — RFC 4122 / RFC 9562 |

## Common pattern (explicit DRBG)

```js
const random = fw.runtime.resolve('random');

// Simple path: direct OS RBG
const k = random.bytes(32);

// FIPS 140-3 path: instantiated DRBG + controlled reseed
const drbg = random.drbg({ personalisation: utf8.toBytes('app-id-v1') });
const out  = drbg.generate(64);                  // 512 derived bits
drbg.reseed();                                   // re-pull entropy
```

## See also

- [PKC](../pkc/README.md) — signatures consuming `keyformat` / `bn`
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
