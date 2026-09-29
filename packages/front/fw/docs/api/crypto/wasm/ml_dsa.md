---
module: wasmMlDsa
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmMlDsa

> WASM-loaded ML-DSA (FIPS 204): post-quantum lattice signatures (44/65/87). Async, `Uint8Array`, no-throw.

**Module** `wasmMlDsa` | **Source** `packages/front/fw/src/crypto/wasm/ml_dsa.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

ML-DSA (Module-Lattice-based Digital Signature Algorithm, a.k.a. CRYSTALS-Dilithium) is the NIST FIPS 204 post-quantum signature scheme. It is **not** in WebCrypto, so this WASM tier — or the pure-JS [`ml_dsa`](../pkc/ml_dsa.md) — is the only path. This module loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `ml_dsa` binary (PQClean ml-dsa-{44,65,87}) through [`wasmRuntime`](./runtime.md) and exposes an async surface that mirrors the pure-JS module's pure-ML-DSA keygen/sign/verify, faster.

Three parameter sets are exposed via a `paramSet` argument: **44** (NIST level 2), **65** (level 3, the default), **87** (level 5). Only the **pure** FIPS-204 interface (external, no pre-hash) is exposed — HashML-DSA (pre-hash) and the internal/externalMu interfaces are out of scope (the pure-JS module covers them). Keygen and signing draw their FIPS-204 randomness from `crypto.getRandomValues`; signing is **hedged** (a fresh 32-byte `rnd` per call).

## Resolve

```js
const wasmMlDsa = runtime.resolve('wasmMlDsa');
// Returns: { isAvailable, keygen, sign, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `keygen` | `(paramSet?: 44\|65\|87) => Promise<{publicKey: Uint8Array, secretKey: Uint8Array}\|false>` | A fresh random key pair, or `false` |
| `sign` | `(secretKey: Uint8Array, message: Uint8Array, ctx?: Uint8Array, paramSet?: 44\|65\|87) => Promise<Uint8Array\|false>` | The signature (hedged), or `false` |
| `verify` | `(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array, ctx?: Uint8Array, paramSet?: 44\|65\|87) => Promise<boolean>` | `true` iff the signature is valid |

### Sizes per parameter set (bytes)

| `paramSet` | publicKey | secretKey | signature |
|-----------|-----------|-----------|-----------|
| `44` | 1312 | 2560 | 2420 |
| `65` (default) | 1952 | 4032 | 3309 |
| `87` | 2592 | 4896 | 4627 |

`keygen`/`sign` resolve `false` (never throw) when:

- `paramSet ∉ {44, 65, 87}` (`[crypto] INVALID: …` logged);
- `secretKey` is not a `Uint8Array` of the parameter set's length, `message` is not a `Uint8Array`, or `ctx` is not a `Uint8Array` ≤ 255 bytes;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch (`[crypto] FAIL: …` logged by `wasmRuntime.load`);
- the WASM call returns a non-zero status.

`verify` resolves `false` on the same invalid-input conditions and whenever the signature does not validate (tampered signature, tampered message, wrong `ctx`, or wrong key).

## Examples

### Generate a key pair, sign, verify

```js
const enc = new TextEncoder();
const kp = await wasmMlDsa.keygen(65);          // default level 3
if (kp === false) { /* WASM unavailable — fall back to pure-JS ml_dsa */ }

const msg = enc.encode('hello post-quantum');
const sig = await wasmMlDsa.sign(kp.secretKey, msg);          // hedged
const ok = await wasmMlDsa.verify(kp.publicKey, sig, msg);    // → true
```

### Domain-separate with a context string

```js
const ctx = enc.encode('my-app:v1');
const sig = await wasmMlDsa.sign(kp.secretKey, msg, ctx, 87); // level 5
// Verification must supply the SAME ctx, or it returns false.
const ok = await wasmMlDsa.verify(kp.publicKey, sig, msg, ctx, 87);
```

### Tamper detection

```js
const bad = Uint8Array.from(sig);
bad[0] ^= 0xff;
await wasmMlDsa.verify(kp.publicKey, bad, msg);  // → false
```

## Notes

- **FIPS 204 (August 2024).** Implements pure ML-DSA (external interface, no pre-hash). The byte-for-byte FIPS-204 ACVP / Wycheproof KAT (ML-DSA-65, deterministic) is verified in the test suite against the delivered binary.
- **Not in WebCrypto.** `crypto.subtle` has no ML-DSA; this WASM tier or the pure-JS [`ml_dsa`](../pkc/ml_dsa.md) is the only path. Parity: both reproduce the same FIPS-204 KAT signature.
- **Hedged signing.** Each `sign` call stages a fresh 32-byte `rnd` from `crypto.getRandomValues`, so signatures are non-deterministic by design (FIPS 204 §5.4 hedged mode). Verification is deterministic.
- **SIMD where it helps.** The `ml_dsa` target ships both `simd` and `scalar` builds; `wasmRuntime` picks the SIMD variant when the host validates simd128, else scalar — both produce identical, KAT-conformant signatures.
- **Output is copied OUT** of WASM linear memory into fresh `Uint8Array`s (never a view that could alias reused memory).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; nothing rejects.

## See also

- [crypto/pkc/ml_dsa](../pkc/ml_dsa.md) — the pure-JS ML-DSA reference (same FIPS 204 algorithm, universal default, + HashML-DSA / internal interfaces)
- [crypto/wasm/ml_kem](./ml_kem.md) — ML-KEM (FIPS 203), the post-quantum KEM companion
- [crypto/wasm/slh_dsa](./slh_dsa.md) — SLH-DSA (FIPS 205), the hash-based post-quantum signature alternative
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
- [crypto/wasm README](./README.md) — the WASM primitive family overview
