---
module: ml_dsa
category: crypto/pkc
dependencies: [sha3, bitArray, random]
returns: object
worker-safe: true
status: complete
---

# ml_dsa

> ML-DSA (FIPS 204, August 2024) — CRYSTALS-Dilithium post-quantum signatures + HashML-DSA + internal interface.

**Module** `ml_dsa` | **Source** `packages/front/fw/src/crypto/pkc/ml_dsa.js` | **Deps** `sha3`, `bitArray`, `random` | **Worker-safe** yes

NIST post-quantum signatures. 3 paramSets. Variants: pure (default), preHash (HashML-DSA, FIPS 204 §5.4), internal (raw §6.2), externalMu (pre-computed mu).

## Resolve

```js
const ml_dsa = runtime.resolve('ml_dsa');
// Returns: { ml_dsa44, ml_dsa65, ml_dsa87 }
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
| `ml_dsa<N>.sign(sk, msg, ctx?, rnd?)` | `(Uint8Array, Uint8Array, Uint8Array?, Uint8Array(32)?) => Uint8Array` | Sign external+pure |
| `ml_dsa<N>.verify(pk, sig, msg, ctx?)` | — | `boolean` |
| `ml_dsa<N>.signPh(sk, msg, hashAlg, hashMod, ctx?, rnd?)` | — | HashML-DSA (preHash + OID) |
| `ml_dsa<N>.verifyPh(pk, sig, msg, hashAlg, hashMod, ctx?)` | — | `boolean` |
| `internalOf(ml_dsa).signInternal(M, sk, rnd?)` | — | Raw §6.2 (no M' wrapper) |
| `internalOf(ml_dsa).verifyInternal(sig, M, pk)` | — | `boolean` raw |
| `internalOf(ml_dsa).signWithMu(mu, sk, rnd?)` | — | externalMu (pre-computed mu) |
| `internalOf(ml_dsa).verifyWithMu(sig, mu, pk)` | — | `boolean` |

### Supported `hashAlg` values (HashML-DSA)

12 OIDs: SHA2-{224,256,384,512,512/224,512/256}, SHA3-{224,256,384,512}, SHAKE-128, SHAKE-256.

## Examples

### Sign + verify (pure, default)

```js
const { ml_dsa } = fw.runtime.resolveAll(['ml_dsa']);
const { publicKey, secretKey } = ml_dsa.ml_dsa65.keygen();

const msg = new TextEncoder().encode('Hello, ML-DSA!');
const sig = ml_dsa.ml_dsa65.sign(secretKey, msg);    // hedged: 32 fresh random bytes
const ok  = ml_dsa.ml_dsa65.verify(publicKey, sig, msg);   // true
```

### HashML-DSA (preHash variant)

```js
const sha256 = fw.runtime.resolve('sha256');
const sig = ml_dsa.ml_dsa65.signPh(secretKey, msg, 'SHA2-256', sha256, ctx);
const ok  = ml_dsa.ml_dsa65.verifyPh(publicKey, sig, msg, 'SHA2-256', sha256, ctx);
```

### Internal interface (raw §6.2)

```js
const sig = internalOf(ml_dsa.ml_dsa65).signInternal(M, secretKey);   // no M' wrapper
```

## Worker Usage

```js
// ml_dsa65 sign ≈ 30-100ms ; verify ≈ 5-15ms — delegate sign to a Worker
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.ml_dsa.ml_dsa65.sign(args[0], args[1]));
    },
    { dependencies: ['ml_dsa'], args: [secretKey, msg] }
);
```

## Notes

- **Argument order**: `sign(sk, msg, …)`, `verify(pk, sig, msg, …)`, as the wasm and WebCrypto tiers. The fw order for every signature scheme and tier: `sign(key, message, …)`, `verify(key, signature, message, …)`.
- **Hedged by default** (FIPS 204 §3.4): without `rnd`, `sign` draws 32 random bytes, so two signatures of one message differ. Pass `new Uint8Array(32)` as `rnd` for the deterministic mode (KAT vectors, reproducible signatures).
- **HashML-DSA OID**: DER prefix embedded in the M' wrapper (FIPS 204 Algorithm 4).
- **`internalOf(ml_dsa).*`** test-only — bypasses §5.4 wrappers; do NOT expose to end users (risk of secret sk leakage).
- **Full ACVP** under `CRYPTO_FULL=1`: 75 keyGen + 45 sigVer + 90 sigGen ext+pure.

## See also

- [ml_kem](./ml_kem.md), [slh_dsa](./slh_dsa.md) — other PQC modules
- [sha3](../hash/sha3.md) — mandatory primitive (SHAKE)
- [Conformance ml_dsa.acvp.md](../../../../src/crypto/pkc/ml_dsa.acvp.md)
