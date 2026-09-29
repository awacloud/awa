---
module: ml_kem
category: crypto/pkc
dependencies: [sha3, bitArray, random]
returns: object
worker-safe: true
status: complete
---

# ml_kem

> ML-KEM (FIPS 203, August 2024) — CRYSTALS-Kyber post-quantum KEM, 3 paramSets.

**Module** `ml_kem` | **Source** `packages/front/fw/src/crypto/pkc/ml_kem.js` | **Deps** `sha3`, `bitArray`, `random` | **Worker-safe** yes

NIST-standardised post-quantum KEM (Key Encapsulation Mechanism). Replaces ECDH in contexts requiring quantum resistance. Hybrid usage (PQ + classical) recommended via [`hkdf`](../hash/hkdf.md) Cr2 (`IKM = Z || T`).

## Resolve

```js
const ml_kem = runtime.resolve('ml_kem');
// Returns: { ml_kem512, ml_kem768, ml_kem1024, _internal }
```

## API

| ParamSet | Security (PQ) | publicKey | secretKey | cipherText | sharedSecret |
|----------|---------------|-----------|-----------|------------|--------------|
| `ml_kem512` | NIST PQC Level 1 (≈ AES-128) | 800 B | 1632 B | 768 B | 32 B |
| `ml_kem768` | NIST PQC Level 3 (≈ AES-192) | 1184 B | 2400 B | 1088 B | 32 B |
| `ml_kem1024` | NIST PQC Level 5 (≈ AES-256) | 1568 B | 3168 B | 1568 B | 32 B |

| Method | Signature | Returns |
|--------|-----------|---------|
| `ml_kem<N>.keygen(seed?)` | `(Uint8Array(64)?) => {publicKey, secretKey}` | Keypair (random if seed absent) |
| `ml_kem<N>.encapsulate(publicKey, m?)` | `(Uint8Array, Uint8Array(32)?) => {cipherText, sharedSecret}` | Encapsulate; m random if absent |
| `ml_kem<N>.decapsulate(cipherText, secretKey)` | `(Uint8Array, Uint8Array) => Uint8Array(32)` | Shared secret (constant-time, implicit reject) |
| `_internal.{ntt, nttInv, isValidEncapsulationKey, isValidDecapsulationKey}` | — | Primitives + key check FIPS 203 §7.2/§7.3 |

## Examples

### KEM end-to-end

```js
const { ml_kem } = fw.runtime.resolveAll(['ml_kem']);

// Receiver
const { publicKey, secretKey } = ml_kem.ml_kem768.keygen();

// Sender (receives publicKey)
const { cipherText, sharedSecret } = ml_kem.ml_kem768.encapsulate(publicKey);

// Receiver (receives cipherText)
const sharedSecret2 = ml_kem.ml_kem768.decapsulate(cipherText, secretKey);
// sharedSecret === sharedSecret2 (32 bytes)
```

### Hybrid PQ + classical (TLS-style)

```js
const Z = ml_kem.ml_kem768.decapsulate(...);   // post-quantum
const T = ecdh.derive(...);                    // classical ECDH
const ikm = bitArray.concat(Z, T);             // SP 800-56C Cr2 §5.8.2
const okm = hkdf.derive(salt, ikm, info, 256);
```

## Worker Usage

```js
// keygen ML-KEM-768 ≈ 5ms ; encapsulate ≈ 5ms ; decapsulate ≈ 5ms
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.ml_kem.ml_kem768.encapsulate(args[0]));
    },
    { dependencies: ['ml_kem'], args: [publicKey] }
);
```

## Notes

- **Implicit reject** on invalid ciphertext: `decapsulate` returns a pseudo-random sharedSecret (not `false`) per FIPS 203 §6.3 — the caller must NOT distinguish.
- **Constant-time**: final Khat/Kbar selection by mask, no short-circuit.
- **Key check** opt-in: `_internal.isValidEncapsulationKey(ek)` (modulus q check) + `isValidDecapsulationKey(dk)` (hash consistency).

## See also

- [ml_dsa](./ml_dsa.md), [slh_dsa](./slh_dsa.md) — PQC signatures
- [sha3](../hash/sha3.md), [random](../utils/random.md) — primitives
- [hkdf](../hash/hkdf.md) — recommended Cr2 hybrid KDF
- [Conformance ml_kem.acvp.md](../../../../src/crypto/pkc/ml_kem.acvp.md)
