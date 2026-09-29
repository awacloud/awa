---
module: ml_dsa
category: crypto/pkc
dependencies: [sha3, bitArray, random, sha256, sha384, sha512, sha512_224, sha512_256]
returns: object
worker-safe: true
status: complete
---

# ml_dsa

> ML-DSA (FIPS 204, August 2024) — CRYSTALS-Dilithium post-quantum signatures + HashML-DSA + internal interface.

**Module** `ml_dsa` | **Source** `packages/front/fw/src/crypto/pkc/ml_dsa.js` | **Deps** `sha3`, `bitArray`, `random`, `sha256`, `sha384`, `sha512`, `sha512_224`, `sha512_256` | **Worker-safe** yes

NIST post-quantum signatures. 3 paramSets. Variants: pure (default), preHash (HashML-DSA, FIPS 204 §5.4), internal (raw §6.2), externalMu (pre-computed mu).

## Resolve

```js
const ml_dsa = runtime.resolve('ml_dsa');
// Returns: { ml_dsa44, ml_dsa65, ml_dsa87, _internal }
```

## API

| ParamSet | Security | publicKey | secretKey | signature |
|----------|----------|-----------|-----------|-----------|
| `ml_dsa44` | NIST PQC Level 2 | 1312 B | 2560 B | 2420 B |
| `ml_dsa65` | NIST PQC Level 3 | 1952 B | 4032 B | 3309 B |
| `ml_dsa87` | NIST PQC Level 5 | 2592 B | 4896 B | 4627 B |

| Method | Signature | Returns |
|--------|-----------|---------|
| `ml_dsa<N>.keygen(seed?)` | `(Uint8Array(32)?) => {publicKey, secretKey}` | Keypair |
| `ml_dsa<N>.sign(msg, sk, ctx?, rnd?)` | `(Uint8Array, Uint8Array, Uint8Array?, Uint8Array(32)?) => Uint8Array` | Sign external+pure |
| `ml_dsa<N>.verify(sig, msg, pk, ctx?)` | — | `boolean` |
| `ml_dsa<N>.signPh(msg, sk, hashAlg, hashMod, ctx?, rnd?)` | — | HashML-DSA (preHash + OID) |
| `ml_dsa<N>.verifyPh(sig, msg, pk, hashAlg, hashMod, ctx?)` | — | `boolean` |
| `_internal.signInternal(M, sk, rnd?)` | — | Raw §6.2 (no M' wrapper) |
| `_internal.verifyInternal(sig, M, pk)` | — | `boolean` raw |
| `_internal.signWithMu(mu, sk, rnd?)` | — | externalMu (pre-computed mu) |
| `_internal.verifyWithMu(sig, mu, pk)` | — | `boolean` |

### Supported `hashAlg` values (HashML-DSA)

12 OIDs: SHA2-{224,256,384,512,512/224,512/256}, SHA3-{224,256,384,512}, SHAKE-128, SHAKE-256.

## Examples

### Sign + verify (pure, default)

```js
const { ml_dsa } = fw.runtime.resolveAll(['ml_dsa']);
const { publicKey, secretKey } = ml_dsa.ml_dsa65.keygen();

const msg = new TextEncoder().encode('Hello, ML-DSA!');
const sig = ml_dsa.ml_dsa65.sign(msg, secretKey);    // deterministic per default
const ok  = ml_dsa.ml_dsa65.verify(sig, msg, publicKey);   // true
```

### HashML-DSA (preHash variant)

```js
const sha256 = fw.runtime.resolve('sha256');
const sig = ml_dsa.ml_dsa65.signPh(msg, secretKey, 'SHA2-256', sha256, ctx);
const ok  = ml_dsa.ml_dsa65.verifyPh(sig, msg, publicKey, 'SHA2-256', sha256, ctx);
```

### Internal interface (raw §6.2)

```js
const sig = ml_dsa.ml_dsa65._internal.signInternal(M, secretKey);   // no M' wrapper
```

## Worker Usage

```js
// ml_dsa65 sign ≈ 30-100ms ; verify ≈ 5-15ms — delegate sign to a Worker
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.ml_dsa.ml_dsa65.sign(args[0], args[1]));
    },
    { dependencies: ['ml_dsa'], args: [msg, secretKey] }
);
```

## Notes

- **Deterministic by default**: `rnd=null` → byte-exact reproducible signature.
- **HashML-DSA OID**: DER prefix embedded in the M' wrapper (FIPS 204 Algorithm 4).
- **`_internal.*`** test-only — bypasses §5.4 wrappers; do NOT expose to end users (risk of secret sk leakage).
- **Full ACVP** under `CRYPTO_FULL=1`: 75 keyGen + 45 sigVer + 90 sigGen ext+pure.

## See also

- [ml_kem](./ml_kem.md), [slh_dsa](./slh_dsa.md) — other PQC modules
- [sha3](../hash/sha3.md) — mandatory primitive (SHAKE)
- [Conformance ml_dsa.acvp.md](../../../../src/crypto/pkc/ml_dsa.acvp.md)
