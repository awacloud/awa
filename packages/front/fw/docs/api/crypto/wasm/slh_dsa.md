---
module: wasmSlhDsa
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmSlhDsa

> WASM-accelerated SLH-DSA (FIPS 205) — stateless hash-based post-quantum signatures, 12 parameter sets.

**Module** `wasmSlhDsa` | **Source** `packages/front/fw/src/crypto/wasm/slh_dsa.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

Opt-in accelerator for the pure-JS [`../pkc/slh_dsa.md`](../pkc/slh_dsa.md). SLH-DSA is purely hash-based (conservative quantum resistance, no number-theoretic assumptions) and hashing-heavy — its deep WOTS / FORS / Merkle / hypertree recursion makes a near-native WASM core a large speedup over the JS reference. The binary is the delivered `@awacloud/fw-wasm-crypto` package's `dist/slh_dsa.scalar.wasm`, loaded **by name** through [`wasmRuntime`](./runtime.md). SLH-DSA is hash-bound, so the package ships the **scalar** variant only (no SIMD); the wrapper pins it.

Not in WebCrypto — `crypto.subtle` has no SLH-DSA. The parameter sets are exposed by the **same identifiers** the pure-JS `slh_dsa` module uses, so the two surfaces are interchangeable.

## Resolve

```js
const wasmSlhDsa = runtime.resolve('wasmSlhDsa');
// Returns: { isAvailable, keygen, sign, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable()` | — | `boolean` — whether the WASM tier is usable (delegates to `wasmRuntime`). |
| `keygen(paramSet)` | `(string) => Promise<{publicKey, secretKey}\|false>` | SLH-DSA.KeyGen; fresh CSPRNG entropy. |
| `sign(secretKey, message, ctx?, paramSet?)` | `(Uint8Array, Uint8Array, Uint8Array?, string?) => Promise<Uint8Array\|false>` | SLH-DSA.Sign (deterministic). `ctx` ≤ 255 bytes. |
| `verify(publicKey, signature, message, ctx?, paramSet?)` | `(Uint8Array, Uint8Array, Uint8Array, Uint8Array?, string?) => Promise<boolean>` | SLH-DSA.Verify; `true` only on a valid signature. |

All operations are **async** and **no-throw**: they resolve to a result or `false` (invalid parameter set, wrong key/signature length, `ctx > 255`, binary unavailable, or a core error). `sign`/`verify` default to `slh_dsa_shake_128f` when `paramSet` is omitted.

### Parameter sets

The `paramSet` string is one of the 12 identifiers below (mirroring pure-JS `slh_dsa`), mapped internally to the frozen ABI `psId` enum (SHA-2 sets `0..5`, SHAKE sets `6..11`; within each family `128s,128f,192s,192f,256s,256f`).

| Identifier (×2 hash families) | Level | publicKey | secretKey | signature |
|---|---|---|---|---|
| `slh_dsa_{sha2,shake}_128{f,s}` | 1 | 32 B | 64 B | 17088 B (f) / 7856 B (s) |
| `slh_dsa_{sha2,shake}_192{f,s}` | 3 | 48 B | 96 B | 35664 B (f) / 16224 B (s) |
| `slh_dsa_{sha2,shake}_256{f,s}` | 5 | 64 B | 128 B | 49856 B (f) / 29792 B (s) |

`f` = fast sign / large signature; `s` = small signature / **slow** sign (the `s` and higher-level sets take seconds per signature — heavy KATs are gated in the pure-JS suite behind `CRYPTO_FULL`).

## Examples

```js
const slh = runtime.resolve('wasmSlhDsa');

// Generate a keypair and sign.
const kp = await slh.keygen('slh_dsa_shake_128f');
const msg = new TextEncoder().encode('payload');
const sig = await slh.sign(kp.secretKey, msg, undefined, 'slh_dsa_shake_128f');
const ok = await slh.verify(kp.publicKey, sig, msg, undefined, 'slh_dsa_shake_128f');
// ok === true

// With a context string (≤ 255 bytes), bound on both sides.
const ctx = new TextEncoder().encode('app-v1');
const sig2 = await slh.sign(kp.secretKey, msg, ctx, 'slh_dsa_shake_128f');
await slh.verify(kp.publicKey, sig2, msg, ctx, 'slh_dsa_shake_128f'); // true
```

## Notes

- **FIPS 205** (August 2024). The shim does the §10.2.1 context wrapping
  (`M' = 0x00 ‖ |ctx| ‖ ctx ‖ M`) internally; the wrapper passes `(msg, ctx)`
  straight through the frozen ABI.
- **Deterministic signing.** `sign` uses `addrnd = PK.seed` (the deterministic
  FIPS-205 path, matching pure-JS `extraEntropy:false`), so signatures are
  reproducible and KAT-checkable. There is no hedged-coin option on this surface.
- **Keygen takes no seed.** The prescriptive API generates fresh CSPRNG entropy;
  use the pure-JS `slh_dsa` module when a deterministic seed is required.
- **WASM is software speed, not hardware crypto.** No AES-NI / SHA-NI exposure —
  that is WebCrypto's domain. This tier accelerates algorithms WebCrypto does not
  cover (SLH-DSA among them).
- **Worker-safe.** Pure factory; the binary is fetched by the package loader via
  `wasmRuntime`; no DOM. Tier selection / fallback chaining is a consumer concern
  (sd-common), not part of this primitive.

## See also

- [`../pkc/slh_dsa.md`](../pkc/slh_dsa.md) — the pure-JS reference (same parameter-set identifiers; `keygen(seed)`, `signPh`/`verifyPh` HashSLH-DSA).
- [`./ml_dsa.md`](./ml_dsa.md) — WASM ML-DSA (FIPS 204), lattice-based PQC signatures.
- [`./runtime.md`](./runtime.md) — the shared WASM loader adapter every wrapper builds on.
