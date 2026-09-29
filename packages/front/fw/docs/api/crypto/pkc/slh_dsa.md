---
module: slh_dsa
category: crypto/pkc
dependencies: [sha3, sha256, sha512, hmac, bitArray, random]
returns: object
worker-safe: true
status: complete
---

# slh_dsa

> SLH-DSA (FIPS 205, August 2024) — SPHINCS+ stateless hash-based signatures, 12 variants.

**Module** `slh_dsa` | **Source** `packages/front/fw/src/crypto/pkc/slh_dsa.js` | **Deps** `sha3`, `sha256`, `sha512`, `hmac`, `bitArray`, `random` | **Worker-safe** yes

Purely hash-based signatures (conservative quantum resistance). 12 variants: 2 hash families (SHA-2 / SHAKE) × 3 security levels (128/192/256) × 2 trade-offs (`f` = fast sign / large sig, `s` = small sig / slow sign).

## Resolve

```js
const slh_dsa = runtime.resolve('slh_dsa');
// Returns: { slh_dsa_sha2_128f, ..., slh_dsa_shake_256s, _internal }
```

## API (12 paramSets)

| Naming | Hash | Security | publicKey | secretKey | signature | sign | verify |
|--------|------|----------|-----------|-----------|-----------|------|--------|
| `slh_dsa_{sha2,shake}_128{f,s}` | SHA-2 / SHAKE | Level 1 | 32 B | 64 B | 17088 B (f) / 7856 B (s) | 10ms / 200ms | 1ms |
| `slh_dsa_{sha2,shake}_192{f,s}` | SHA-2 / SHAKE | Level 3 | 48 B | 96 B | 35664 B (f) / 16224 B (s) | 30ms / 500ms | 2ms |
| `slh_dsa_{sha2,shake}_256{f,s}` | SHA-2 / SHAKE | Level 5 | 64 B | 128 B | 49856 B (f) / 29792 B (s) | 100ms / minutes | 5ms |

| Method | Signature | Returns |
|--------|-----------|---------|
| `slh_dsa_*.keygen(seed?)` | — | `{publicKey, secretKey}` |
| `slh_dsa_*.sign(msg, sk, opts?)` | `(Uint8Array, Uint8Array, {context?, extraEntropy?}) => Uint8Array` | Signature |
| `slh_dsa_*.verify(sig, msg, pk, opts?)` | — | `boolean` |
| `slh_dsa_*.signPh(msg, sk, hashAlg, hashMod, opts?)` | — | HashSLH-DSA (preHash + OID) |
| `slh_dsa_*.verifyPh(sig, msg, pk, hashAlg, hashMod, opts?)` | — | `boolean` |
| `_internal.signInternal(M, sk, opts?)` | — | Raw §6 (no M' wrapper) |
| `_internal.verifyInternal(sig, M, pk)` | — | `boolean` raw |

## Examples

### Sign + verify

```js
const { slh_dsa } = fw.runtime.resolveAll(['slh_dsa']);

// SHAKE-128f : fastest sign, large sig (17 KB)
const { publicKey, secretKey } = slh_dsa.slh_dsa_shake_128f.keygen();
const sig = slh_dsa.slh_dsa_shake_128f.sign(msg, secretKey);
const ok  = slh_dsa.slh_dsa_shake_128f.verify(sig, msg, publicKey);
```

### HashSLH-DSA preHash

```js
const sha256 = fw.runtime.resolve('sha256');
const sig = slh_dsa.slh_dsa_sha2_128f.signPh(msg, secretKey, 'SHA2-256', sha256);
```

## Worker Usage

```js
// SLH-DSA sign 256s = minutes — ALWAYS use a Worker
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.slh_dsa.slh_dsa_sha2_128f.sign(args[0], args[1]));
    },
    { dependencies: ['slh_dsa'], args: [msg, secretKey] }
);
```

## Notes

- **Variant choice**: `f` (fast sign, large sig) for interactive use; `s` (small sig, slow sign) for infrequent long-term artefacts.
- **256s sign costs minutes** — never block the UI.
- **`_internal.*`** test-only — `_internal` convention to bypass the §5.4 wrapper.
- **Full ACVP keyGen + sigVer ext+pure** under `CRYPTO_FULL=1` (~135 s). Full sigGen (624) deliberately not wired (would take hours).

## See also

- [ml_kem](./ml_kem.md), [ml_dsa](./ml_dsa.md) — other PQC modules
- [sha3](../hash/sha3.md), [sha256](../hash/sha256.md), [sha512](../hash/sha512.md), [hmac](../hash/hmac.md) — primitives
- [Conformance slh_dsa.acvp.md](../../../../src/crypto/pkc/slh_dsa.acvp.md)
