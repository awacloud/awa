# Crypto / PKC — Public Key Cryptography

Asymmetric cryptography: signatures, key exchange, KEM. Four families:

- **Classic (FIPS 186-5)** — `rsa`, `ecc` (ECDSA P-{224,256,384,521}+K-curves), `ed25519` (EdDSA), `x25519` (DH).
- **Post-Quantum (FIPS 203/204/205, August 2024)** — `ml_kem` (CRYSTALS-Kyber), `ml_dsa` (Dilithium), `slh_dsa` (SPHINCS+).
- **Hybrid / PQC combiners** — `hybridKem` (X-Wing: X25519+ML-KEM-768), `hybridSign` (composite MLDSA65-Ed25519 / MLDSA65-ECDSA-P256, AND-verify). Compose vetted primitives; correctness anchored to official IETF X-Wing / LAMPS vectors.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [rsa](./rsa.md) | `{oaepEncrypt, oaepDecrypt, pssSign, pssVerify, pkcs1v15*, _internal}` | `sha256`, `bitArray`, `utf8`, `hex` | RSA-OAEP + RSA-PSS (FIPS 186-5 §5.4 / RFC 8017); v1.5 explicit reject |
| [ecc](./ecc.md) | `{curves, publicKey, secretKey, sign, verify, deserialize, _internal}` | `bitArray`, `hex`, `bn`, `sha256`, `sha384`, `sha512`, `hmac` | ECDSA FIPS 186-5 + RFC 6979 + subgroup check |
| [ed25519](./ed25519.md) | `{keyPair, sign, verify, signPh, verifyPh, signCtx, verifyCtx, ed448}` | `sha512`, `bitArray` | Ed25519 PureEdDSA + ph + ctx (RFC 8032 / FIPS 186-5 §7.6) |
| [x25519](./x25519.md) | `{scalarMult, scalarMultBase, isLowOrderPoint, _internal}` | none | X25519 DH (RFC 7748) — TweetNaCl-derived (public domain; see [provenance](../../../dev/provenance.md)) |
| [ml_kem](./ml_kem.md) | `{ml_kem512, ml_kem768, ml_kem1024, _internal}` | `sha3`, `bitArray`, `random` | ML-KEM CRYSTALS-Kyber (FIPS 203, August 2024) |
| [ml_dsa](./ml_dsa.md) | `{ml_dsa44, ml_dsa65, ml_dsa87, _internal}` | `sha3`, `bitArray`, `random`, `sha256`, `sha384`, ... | ML-DSA Dilithium + HashML-DSA (FIPS 204) |
| [slh_dsa](./slh_dsa.md) | `{slh_dsa_*_*, _internal}` | `sha3`, `sha256`, `sha512`, `hmac`, `bitArray`, `random` | SLH-DSA SPHINCS+ + HashSLH-DSA (FIPS 205, 12 variants) |
| [hybridKem](./hybridKem.md) | `{xwing}` | `x25519`, `ml_kem`, `sha3` | X-Wing hybrid KEM (X25519+ML-KEM-768, draft-connolly-cfrg-xwing-kem -06; official IETF KAT) |
| [hybridSign](./hybridSign.md) | `{mldsa65_ed25519, mldsa65_ecdsaP256}` | `ml_dsa`, `ed25519`, `ecc`, `sha512`, `sha256`, `random`, `utf8` | Composite signatures (draft-ietf-lamps-pq-composite-sigs, AND-verify): MLDSA65-Ed25519 + MLDSA65-ECDSA-P256 |

## Common pattern (signature)

```js
const { ed25519, random } = fw.runtime.resolveAll(['ed25519', 'random']);
const { privateKey, publicKey } = ed25519.keyPair(random.bytes(32));
const sig = ed25519.sign(privateKey, msg);
const ok  = ed25519.verify(publicKey, msg, sig);  // true / false
```

## Common pattern (PQC KEM)

```js
const ml_kem = fw.runtime.resolve('ml_kem');
const { publicKey, secretKey } = ml_kem.ml_kem768.keygen();
// Sender side
const { cipherText, sharedSecret } = ml_kem.ml_kem768.encapsulate(publicKey);
// Receiver side
const sharedSecret2 = ml_kem.ml_kem768.decapsulate(cipherText, secretKey);
// sharedSecret == sharedSecret2 (32 bytes)
```

## See also

- [Hash](../hash/README.md) — underlying hash functions
- [Utils / random](../utils/random.md) — SP 800-90A DRBG for key generation
- [Utils / rsaKeygen](../utils/rsaKeygen.md) — FIPS 186-5 RSA key generation
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
- [PQC-hybrid evidence dossier](../../../evidence/pqc-hybrid-evidence.md) — evaluation-evidence for `hybridKem` / `hybridSign` (constructions, vectors, supply chain, limits)
