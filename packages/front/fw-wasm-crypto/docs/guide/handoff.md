# Handoff — G2 satisfied, CT/fuzz pending

All 17 ACVP/RFC-green wasm targets delivered through the fw loader seam.

## What shipped

`tools/wasm-crypto build --pkg packages/front/fw-wasm-crypto` emits, for each
of the **17 modules** in `targets.json`, a simd and scalar variant:

```
dist/<module>.simd.wasm    dist/<module>.simd.wasm.js
dist/<module>.scalar.wasm  dist/<module>.scalar.wasm.js
```

All 17 targets are validated byte-for-byte against NIST ACVP vectors or the
defining RFC (see [Module reference](modules.md) for the per-target ABI
exports, source-kind, and KAT status):

- **Tier-A own (C23)** — 9 modules: ChaCha20-Poly1305, SHA-2, SHA-3, BLAKE2b,
  CMAC, HMAC, HKDF, PBKDF2, Argon2id. Framework-authored `csrc/` sources;
  simd128 where it pays (see the package README, "Tier-A own modules").
- **Tier-B classical** — 3 modules: AES-GCM/CBC/CTR, RSA PKCS#1+PSS+OAEP,
  ECDSA+ECDH. Vendored BearSSL v0.6 + fiat-crypto field arithmetic (see the
  package README, "Tier-B classical modules").
- **Tier-C PQC** — 3 modules: ML-KEM (FIPS-203), ML-DSA (FIPS-204), SLH-DSA
  (FIPS-205). Vendored mlkem-native / PQClean / OpenSSL-slh-dsa (see the
  package README, "Tier-C PQC modules").
- **Tier-A libsodium-vendored** — 2 modules: Ed25519, X25519. Known
  not-yet-own pair (libsodium ref).

The artifacts reach `@awacloud/fw` through the `src/loader.js` seam: `loadWasmModule`
fetches, compiles, instantiates, and validates the zero-import invariant + ABI
triple at load time. See [dist-to-fw loader seam](loader-seam.md) for the full
seam description.

## Gate G2 satisfied

The campaign gate **G2** required:

> `@awacloud/fw-wasm-crypto` committed to the monorepo with `dist/*.wasm` reachable
> through the fw loader, every target ACVP/RFC-green.

This is now satisfied. The committed `dist/` artifacts, together with the
`src/loader.js` seam, are the G2 artifact. (The `.wasm.js` ACVP provenance
markers are emitted by `verify` alongside each binary.)

G2 being satisfied unblocks two downstream consumers:

1. **`acvp-wasm-ct-fuzz`** — the wasm-tier adapter that runs the 17 modules
   through in-engine constant-time probes and differential fuzz.

2. **The `@awacloud/fw` wasm wrappers** — 18 wrappers that bind each
   algorithm-export from the loader to the fw DI surface. The fw-side wrappers
   consume `loadWasmModule` from `@awacloud/fw-wasm-crypto` and bind against the
   frozen `targets.json` `exports[]` arrays.

## Residual L3 criterion

Advancing this package to **L3** additionally requires:

> Every target green on **in-engine constant-time probes** and **differential
> fuzz** against a reference implementation.

That criterion is the `acvp-wasm-ct-fuzz` plan's job and is **not yet
delivered**. Therefore this package is **L2** with L3 explicitly pending
CT/fuzz completion.

**KAT-green does not mean timing-safe.** The ACVP/RFC byte-for-byte results
confirm functional correctness. Constant-time is not self-attested by KAT
alone — engine-level timing analysis (and the CT probes in `services/acvp`)
is required. See the CT note in the README's Tier-A section: the in-engine CT
proof is `acvp-wasm-ct-fuzz`'s job, not this package's.
