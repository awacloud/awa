# `random.js` — ACVP / NIST conformance

## Standards

- **Primary**: **NIST SP 800-90A Rev. 1** — *Recommendation for Random
  Number Generation Using Deterministic Random Bit Generators*, §10.2
  (CTR_DRBG, AES-256, no derivation function).
- **Secondary**: **NIST SP 800-90B** — *Recommendation for the Entropy
  Sources Used for Random Bit Generation*, §4.4 (continuous health tests
  RCT/APT).
- **Tertiary**: **NIST SP 800-90C (draft)** — *Recommendation for
  Random Bit Generator (RBG) Constructions* (the JS/Node platforms'
  `crypto.getRandomValues` is treated as a validated NRBG).
- **ACVP draft**: `references/NIST/ACVP/src/draft-vassilev-acvp-drbg.adoc`
- **Vectors**: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ctrDRBG-1.0/`

## Implemented algorithm

Two surfaces:

1. **Direct OS NRBG** — `bytes(n)`, `words(n)`, `bits(n)`: thin wrappers
   over `crypto.getRandomValues` with 65,536-byte chunking.
2. **CTR_DRBG-AES-256 (no df)** — `drbg(options)`: one instance per call,
   conforming to SP 800-90A §10.2.
   - `keylen=32`, `blocklen=16`, `seedlen=48`, `security_strength=256`.
   - `reseed_interval = 2^32` (spec cap: 2^48).
   - `max_bytes_per_request = 65,536` bytes.
   - `instantiate(entropy, perso?)`: seed = entropy ⊕ perso (XOR
     truncated to 48 bytes if perso is longer).
   - `reseed(entropy, ai?)`: same, sets `reseed_counter ← 1`.
   - `generate(n, ai?)`: optional `additional_input` mixed via
     `_update`, then `n` bytes produced by chaining `V++; AES_K(V)`.
   - `addAdditionalInput(buf)`: caller-supplied buffer (keyboard/mouse)
     consumed as `additional_input` for the next `generate()`; folded
     via SHA-256 if > 48 bytes.
   - **Power-On Self-Test (POST)**: NIST CAVP KAT `drbgvectors_pr_false
     COUNT=0` run on first instantiation, then latched.
   - **Continuous health tests (SP 800-90B)**: RCT (C=4) + APT (W=512,
     C=13), permanent latch-dead on failure.

API: `random.factory(bitArray, aes, sha256)`; `_internal.makeDrbg()`
exposed for ACVP replay with controlled entropy (test-only,
**out-of-band for production**).

## Test coverage

### Integrated official vectors

| Source | Reference | Test (`describe` / `test`) | Property verified |
|---|---|---|---|
| NIST CAVP `drbgvectors_pr_false` | COUNT=0 | `selfTest` / `CAVP vector reproduces` | byte-exact KAT embedded in the POST |
| **ctrDRBG-1.0** | tgId=7 (predRes=True) — 15 AFT | `ctrDRBG-1.0 ... predResistance=true` | `returnedBits` byte-exact (15/15) |
| **ctrDRBG-1.0** | tgId=15 (predRes=False) — 15 AFT | `ctrDRBG-1.0 ... predResistance=false` | `returnedBits` byte-exact (15/15) |

#### ACVP integration strategy

`ctrDRBG-1.0` exposes **16 testGroups × 15 tests = 240 vectors** covering
the `mode ∈ {AES-128, AES-192, AES-256, TDES}` × `derFunc ∈
{true, false}` × `predResistance ∈ {true, false}` × `reSeed=true` variants.

`random.js` implements **only CTR_DRBG-AES-256 no-df**. Filter applied:
- `mode = AES-256`
- `derFunc = false`

→ **2 testGroups × 15 = 30 vectors integrated (100% of the
supported variant)**. The remaining 210 vectors (AES-128/192, TDES,
derFunc=true) are outside the module's algorithmic scope.

Each vector executes the SP 800-90A §10.2.1 spec sequence:
1. `instantiate(entropy_384bit, persoString_384bit)` — empty nonce
   for no-df (the 384-bit entropy is supplied as a block).
2. For each `otherInput`:
   - `intendedUse=reSeed` → `reseed(entropy, additionalInput)`.
   - `intendedUse=generate` & `predResistance=true` →
     `reseed(entropy, additionalInput); generate(L/8, null)`
     (the `prediction_resistance_request` semantics: reseed before
     generate).
   - `intendedUse=generate` & `predResistance=false` →
     `generate(L/8, additionalInput)`.
3. `expect(lastGenerate == returnedBits)` (`returnedBitsLen = 4096`
   bits = 512 bytes).

### Security properties tested

- [x] **CTR_DRBG-Update (§10.2.1.2)** — tested indirectly by each
  vector via `instantiate`/`reseed`/`generate` (provided_data XOR
  output stream).
- [x] **Instantiate (§10.2.1.3.1) with non-null personalization** —
  30/30 ACVP with a random 384-bit persoString.
- [x] **Reseed (§10.2.1.4.1)** — 15 ACVP predRes=False (1 explicit
  reSeed) + 15 ACVP predRes=True (implicit reseed before each
  generate).
- [x] **Generate (§10.2.1.5.1) with additional_input** — 30/30 ACVP.
- [x] **Generate with prediction_resistance** — 15/15 ACVP predRes=True.
- [x] **POST / power-on KAT** — CAVP `drbgvectors_pr_false COUNT=0`
  hard-wired in `random.js:350-364`, run before any `drbg()`.
- [x] **RCT (SP 800-90B §4.4.1)** — C=4 verified on `0x55 × 4` (fail) +
  `0xAA × 3` (pass).
- [x] **APT (SP 800-90B §4.4.2)** — W=512, C=13; boundary tested
  (13 occurrences pass, 14 fail) + non-overlapping window reset.
- [x] **Permanent latch-dead** — after an RCT/APT failure, `drbg()`
  refuses to instantiate (`return false`).
- [x] **Generate bounds** — negative / non-integer / > 2^19 bit n → false.
- [x] **Reseed counter advance / reset** — incremented on each generate,
  reset to 1 on reseed.
- [x] **Uninstantiate** — wipes K/V, refuses further generate.
- [x] **addAdditionalInput types** — Uint8Array, Array<int>, number;
  unsupported → false, never throws.
- [x] **SHA-256 folding** — additional input > 48 bytes folded to 32
  bytes (buffer bounding).
- [x] **CTR_DRBG with df (derivation function, SP 800-90A §10.4.2)** —
  **Iteration H4**: `_makeDrbg({ aesKeyBits, df: true })` implements a full
  BCC + Block_Cipher_df. Allows entropy / nonce / perso of arbitrary
  length to be distilled to seedlen.
- [x] **CTR_DRBG-AES-128/192** — **Iteration H4**: parametric `_makeDrbg({
  aesKeyBits: 128|192|256, df })`. KEY_BYTES = aesKeyBits/8 and SEED_BYTES =
  KEY_BYTES + 16 derived at runtime. `ctrDRBG-1.0` ACVP vectors with
  predResistance=false validated byte-exact for 5 combos (AES-128/192 ×
  no-df + AES-128/192/256 × with-df) as a [first/mid/last] sub-sample by
  default, full under `CRYPTO_FULL=1`. The default `random.bytes()` API stays
  AES-256 no-df (maximum security). **TDES** remains out of scope
  (deprecated by SP 800-131A §2.4).
- [ ] **HMAC_DRBG / Hash_DRBG** — not implemented (P3).

## FIPS 140-3 conformance

| Requirement | Status | Evidence |
|---|---|---|
| Approved algorithm | ✅ | SP 800-90A §10.2 (CTR_DRBG-AES-256) |
| Validated entropy source | ⚠️ (caller-asserted) | `crypto.getRandomValues` (OS-level NRBG, outside the module); to be validated during CMVP as an SP 800-90B-compatible entropy source |
| Validated parameter sizes | ✅ | seedlen=48, AES-256 the only exposed variant |
| Power-on KAT / self-test | ✅ | NIST CAVP `drbgvectors_pr_false COUNT=0` hard-wired (`random.js:350-364`) |
| Official ACVP vectors executed | ✅ | 30 `ctrDRBG-1.0` vectors on every `bun test` |
| Continuous health tests | ✅ | RCT (C=4) + APT (W=512, C=13) on every entropy buffer |
| Latch-dead on failure | ✅ | `_entropyDead` flag, permanent after RCT/APT failure |
| Reseed_interval respected | ✅ | 2^32 < spec cap 2^48 |
| No `throw` / timing leak | ✅ | Review: `console.warn`/`console.error` + `return false` |
| Wipe on uninstantiate | ✅ | `K.fill(0); V.fill(0); cipher=null; live=false` |

## Known limitations

- **CTR_DRBG with df (derivation function)**: not implemented. The df
  (SP 800-90A §10.4.2 = BCC/CBC-MAC over entropy + nonce + perso) is
  useful when entropy has a rate < security_strength bits; since
  `crypto.getRandomValues` is full-entropy, no-df + 384-bit entropy
  is conformant. 120 ACVP `derFunc=true` vectors not covered.
- **AES-128/192 and TDES**: not exposed. The module policy is a
  consistent 256-bit security strength. 90 ACVP vectors filtered out.
- **HMAC_DRBG / Hash_DRBG** (SP 800-90A §10.1): not implemented.
  CTR_DRBG was chosen to reuse the already-validated AES block.
- **`_internal.makeDrbg`**: test-only surface exposing the constructor
  without automatic seeding. Documented in a comment; **must not be
  called from application code** — the FIPS lifecycle (POST + RCT/APT +
  OS NRBG seeding) is only guaranteed via `drbg()`.
- **NRBG validation**: `crypto.getRandomValues`'s conformance to
  SP 800-90B is asserted by the host platform (Node ≥ 18:
  OpenSSL FIPS 3.0; browsers: OS implementation), not by this
  module. The application's CMVP must declare the source.

## Cross-references

- Module: [`utils/random.js`](./random.js)
- Tests: [`utils/random.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/utils/random.test.js) — **80 tests** (65 baseline + 15 iteration H4: CTR_DRBG-AES-{128,192} no-df + AES-{128,192,256} with-df, [first/mid/last] sub-sample by default, 140 under `CRYPTO_FULL=1`)
- ACVP draft: `references/NIST/ACVP/src/draft-vassilev-acvp-drbg.adoc`
- Vectors: `references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/ctrDRBG-1.0/`
- Underlying AES: [`../cipher/aes.acvp.md`](../cipher/aes.acvp.md)
- Global conformance: [`../NIST_CONFORMANCE.md`](../NIST_CONFORMANCE.md)
