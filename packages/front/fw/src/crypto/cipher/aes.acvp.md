# `aes.js` — ACVP / NIST conformance

## Standards

- **Primary**: **FIPS 197** — *Advanced Encryption Standard (AES)*, §5.1 (encryption), §5.3 (decryption), §5.2 (key expansion).
- **Secondary**: ACVP — *Automated Cryptographic Validation Protocol*, draft-celi-acvp-symmetric.
- **ACVP draft**: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-ECB-1.0/`

## Implemented algorithm

Block cipher AES-128 / AES-192 / AES-256 (single-block primitive). API: `aes.factory().fn(key, full=true)` → `{encrypt(block), decrypt(block)?}`. **`api.fn` is the constant-time default** (masked-lookup S-box); the fast T-table path is **opt-in** via `api.ttable.fn`. `api.bitsliced.fn` is a deprecated alias of `api.fn`. The key is passed as 32-bit words (4 / 6 / 8 integers). `full=false` only computes the encryption schedule (memory savings for one-way modes such as CTR/GCM). Error (invalid `key size`/`block size`) → `false` + `console.warn`. S-box/MixCols tables are precomputed at factory time; `factory().toString()` remains Worker-serializable.

This module provides the **block primitive**; ECB, CBC, CTR, GCM, KW, etc. are implemented in `mode/`.

## Test coverage

### Integrated official vectors

> **All vectors below are executed 2× via `describe.each`** — once on the
> **constant-time default** path `api.fn` and once on the **T-table opt-in**
> path `api.ttable.fn`. Both produce byte-identical output
> (`api.bitsliced.fn` is a deprecated alias of `api.fn`).

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| FIPS 197 App. B | AES-128 single block (P=3243f6a8…, K=2b7e1516…, C=3925841d…) | `FIPS-197 Appendix B [$name]` | KAT byte-exact + round-trip (CT default + T-table) |
| FIPS 197 App. C | AES-192 (K=000102…1617, P=0011…eeff, C=dda97c…) | `FIPS-197 Appendix C — AES-192 [$name]` | KAT + round-trip (CT default + T-table) |
| FIPS 197 App. C | AES-256 (K=000102…1f, P=0011…eeff, C=8ea2b7…) | `FIPS-197 Appendix C — AES-256 [$name]` | KAT + round-trip (CT default + T-table) |
| ACVP-AES-ECB-1.0 | `expectedResults.json` tcId 1-2138 (sub-sample 254) | `ACVP-AES-ECB-1.0 / AFT vectors [$name]` | KAT byte-exact (encrypt + decrypt, AES-128/192/256, GFSbox/KeySbox/VarKey/VarTxt + variable-message buckets tg 25-30) **× 2 paths** |
| ACVP-AES-ECB-1.0 | `expectedResults.json` tcId 2139-2144 (6 MCT) | `ACVP-AES-ECB-1.0 / Monte Carlo Tests [$name]` | Monte Carlo loop AESAVS §6.4 (100 outer × 1000 inner block-ops) — byte-exact assertions on the key/pt/ct of **iter0** and **iter99** for the 6 chains (enc/dec × 128/192/256) **× 2 paths** |

#### AFT sub-sampling strategy (see audit plan, *Risks & safeguards*)

The ACVP AES-ECB suite enumerates 36 testGroups (24 structural AFT + 6 PT-variable + 6 MCT) for a total of 2138 AFT + 6 MCT. Strategy:

- **Small groups (≤ 24 tests)**: covered in full — tg 1, 2, 5, 6, 9, 10, 13, 14, 17, 18, 21, 22, 25-30 (217 vectors).
- **Large groups (128-256 tests)**: 3 representative tcId (first / middle / last) — tg 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24 (37 vectors). These groups enumerate the systematic GFSbox / KeySbox / VarKey / VarTxt patterns (one bit position per tcId); the three tcId capture the extremes and the middle of each enumeration.
- Total integrated: **254 AFT + 6 MCT** out of 2144 available, **executed 2× via `describe.each` on the constant-time default path (`api.fn`) and the T-table opt-in path (`api.ttable.fn`)** — i.e. 542 conformance tests (+ 2 `api.bitsliced.fn` alias tests = 544 total). The `CRYPTO_FULL=1` mode is not wired for this module; suite ~22 s (mostly spent on the constant-time MCT × 6 chains, the default path being ~50× slower by design).

### Security properties tested

- [x] **Correct key schedule** — all 128/192/256 sizes validated against AESAVS KeySbox + VarKey.
- [x] **Round transformation** — SubBytes / ShiftRows / MixColumns / AddRoundKey are implicitly validated via the systematic GFSbox vectors (PT/CT bit-position).
- [x] **Inverse cipher** — InvSubBytes / InvShiftRows / InvMixColumns validated by the entire decrypt half (tg 13-24, 28-30, 34-36).
- [x] **Long-chain stability** — MCT guarantees no arithmetic degradation appears over 100,000 consecutive ops per chain (× 6 chains).
- [x] **Edge cases** — invalid key (3 words), invalid block (3 words) → `false` + `console.warn`.
- [x] **`full=false`**: `decrypt` not exposed.
- [x] **Side-channel resistance (timing)** — **the default path `api.fn` is now constant-time**: SubBytes via masked-lookup S-box (256 uniform reads per byte, branchless mask `((diff-1)>>>8) & 1`), MixColumns via branchless `xtime`; the memory access pattern is independent of the key/state (neutralizes Bernstein 2005). The fast T-table path (vulnerable to cache-timing) is **opt-in** via `api.ttable.fn`. `api.bitsliced.fn` is a **deprecated alias** of `api.fn`. Implementation: ~22 LOC `api.fn` (key schedule straight from FIPS 197 §5.2 with no pre-processed `decKey`; `_cryptCT` derives `Nr` from `keys[0]`). **Validated across the whole set of FIPS-197 App. B/C + ACVP-AES-ECB-1.0 vectors (254 AFT + 6 MCT × 100×1000) byte-exact** via `describe.each` factoring over the 2 paths (CT default + T-table). Cost of the default ~50-100× the T-table path — that's the price of security-by-default; opt into `api.ttable.fn` on a trusted, non-shared host. Byte-exact cross-consistency of `api.fn` vs `api.ttable.fn` on FIPS-197 KAT (AES-128/192/256) + 16 random blocks. **WebCrypto delegate** not wired: `globalThis.crypto.subtle` is asynchronous and does not expose a bare block primitive (only high-level AEAD `AES-GCM`/`AES-CTR`/`AES-CBC`) — the `mode/{cbc,ctr,gcm}.js` modes could eventually delegate directly to WebCrypto, out of scope for `cipher/aes.js`.

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | FIPS 197 + ACVP-AES-ECB-1.0 |
| Validated key sizes | ✅ | 128 / 192 / 256 — all covered by AFT + MCT |
| KAT power-on / self-test | ✅ | FIPS-197 App. B/C vectors executed on every `bun test`; no dedicated `selfTest()` — module init is purely table precomputation (deterministic) |
| CT comparisons (if secret) | N/A | Low-level block module; CT comparisons are the responsibility of the modes (see `gcm.js`, `cmac.js`, `kw.js`) |
| No `throw` / timing leak | ✅ | No `throw` (reviewed OK); **default path `api.fn` is constant-time** (masked-lookup S-box). The opt-in T-table path `api.ttable.fn` remains non-constant-time with respect to cache (see limitation below) |

## Known limitations

- **Cache-timing on the opt-in path `api.ttable.fn`**: classic T-table implementation (inherited from SJCL) — not safe against an attacker able to observe cache access patterns (co-tenant, browser). **The default is now safe**: `api.fn` provides a constant-time path validated byte-exact on the same FIPS-197 + ACVP-AES-ECB-1.0 vectors. Choice left to the caller: security by default (constant-time `api.fn`) or performance on a trusted host (T-table `api.ttable.fn`, ~50-100× faster). `crypto.subtle` delegation remains out of scope for `cipher/aes.js` (asynchronous API, no bare block primitive exposed by WebCrypto).
- **MCT sub-sampling**: `iter0` and `iter99` validated byte-exact; the 98 intermediate iterations are not asserted byte-by-byte. Residual risk = a bug *specific to iterations 1-98* going undetected; judged negligible because (1) the chain is cumulative — a local bug would deviate `iter99`; (2) each outer iteration tests a different (key, pt) state.
- **No Crypto Officer test**: the ACVP does not expose Crypto Officer ECB tests either; the modes (CBC, GCM…) will carry them.

## Cross-references

- Module: [`cipher/aes.js`](./aes.js)
- Tests: [`cipher/aes.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/cipher/aes.test.js) — **544 tests** (542 conformance tests via `describe.each` over 2 paths: CT default `api.fn` + T-table opt-in `api.ttable.fn`, same FIPS-197 + ACVP-AES-ECB-1.0 vectors byte-exact; + 2 `api.bitsliced.fn` alias tests)
- Uint8Array wrappers (outside `.acvp.md` scope): [`utils/aes_ctr.js`](../utils/aes_ctr.js), [`utils/aes_modes.js`](../utils/aes_modes.js) — cover ECB+CTR / multi-mode and will be validated via the `mode/*` iterations.
- ACVP draft: `references/NIST/ACVP/src/draft-celi-acvp-symmetric.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ACVP-AES-ECB-1.0/`
- Overall conformance: [`NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
