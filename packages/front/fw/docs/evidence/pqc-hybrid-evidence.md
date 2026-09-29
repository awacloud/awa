# PQC-hybrid combiners — evaluation-evidence dossier

> Component-supplier evidence for the `@awacloud/fw` post-quantum **hybrid**
> combiners: the X-Wing hybrid KEM (`hybridKem`) and the LAMPS composite
> signatures (`hybridSign`). This document assembles the measured facts that
> back those two modules for a third-party evaluator. Every claim cites a
> test file (with count), a provenance entry, or a pinned normative
> reference. No claim is unsourced. This is supplier evidence for a
> cryptographic **component**, not a certified product — see §9.

Audience: security evaluators / integrators performing due diligence on the
hybrid combiners as a supplied component. Descriptive statements only.

## 1. Scope & identification

**Subject of evaluation.** Two fw modules under `@awacloud/fw` (`fw.crypto.pkc`),
each a pure composition over already-delivered, separately-tested fw
primitives — no novel cryptography:

| Module | Construction | Source | Doc |
|---|---|---|---|
| `hybridKem` | X-Wing hybrid KEM (X25519 + ML-KEM-768) | [`src/crypto/pkc/hybridKem.js`](../../src/crypto/pkc/hybridKem.js) | [`hybridKem.md`](../api/crypto/pkc/hybridKem.md) |
| `hybridSign` | Composite PQ/T signatures (ML-DSA-65 ∧ Ed25519 / ECDSA-P-256) | [`src/crypto/pkc/hybridSign.js`](../../src/crypto/pkc/hybridSign.js) | [`hybridSign.md`](../api/crypto/pkc/hybridSign.md) |

**Package identity.** `@awacloud/fw` version `0.1.0`, maturity **L3** (per
`packages/front/fw/package.json`). Browser framework, ESM-only, zero npm
runtime dependencies. The package manifest declares `"license": "Apache-2.0"` and the package root ships a `LICENSE` file — both stamped from the ratified licence matrix (`docs/publication/license-matrix.json`) by the `license-stamp` tool on 2026-09-05. The package's release SBOM (§7) records this manifest value as its declared licence.

**Build provenance.** No bundler is required; modules resolve via HTML
import maps. Two deployment surfaces per module (both delivered): the DI descriptor (`runtime.resolve('hybridKem' | 'hybridSign')`)
and the direct-ESM subpath (`@awacloud/fw/crypto/pkc/hybridKem.js`,
`@awacloud/fw/crypto/pkc/hybridSign.js`) — surface parity documented in
[`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Resolve and
[`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §Resolve.

**Commit / version pinning.** The evaluated tree is the tree of the signed
release this document ships in; its commit is the one the signed release
tag names — see [`verify-releases.md`](https://github.com/awacloud/awa/blob/main/docs/publication/verify-releases.md)
for the verification procedure. Vector and construction revisions are
pinned per §2; per-file byte provenance (SHA-256) is in
[`src/crypto/pkc/hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md).

**Snapshot date & re-issue policy.** Dossier snapshot 2026-07-09. This
document is re-issued whenever a pinned construction/vector revision changes
(§2), a new coverage gap is closed (§4), or the supply-chain inventory
changes (§8). A draft-revision change to X-Wing (-06) or LAMPS
composite-sigs (-19) is a construction event, not a silent edit — see §9 and
the escalation note in
[`hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md).

## 2. Cryptographic constructions

### 2.1 X-Wing hybrid KEM (`hybridKem`)

Pinned to `draft-connolly-cfrg-xwing-kem` **revision -06** (CFRG), the
revision whose Appendix C KAT the in-repo libsodium reference encodes
([`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Construction).

- **Combiner** (draft §5.3, fixed-label variant):
  `ss = SHA3-256( ss_ML-KEM || ss_X25519 || ct_X25519 || pk_X25519 || label )`,
  `label = 5c 2e 2f 2f 5e 5c` (ASCII `\.//^\`). The fixed label pins the
  scheme and binds `ct_X25519 || pk_X25519`.
- **Key derivation** (draft §5.1): the secret key is a **32-byte seed**;
  `expanded = SHAKE256(seed, 96)` splits into `mlkem_seed = expanded[0..64)`
  (`d || z`) and `sk_X25519 = expanded[64..96)`.

(Construction reproduced from the delivered module doc
[`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Construction (FROZEN).)

### 2.2 Composite signatures (`hybridSign`)

Pinned to `draft-ietf-lamps-pq-composite-sigs` **revision -19** (tag
`draft-ietf-lamps-pq-composite-sigs-19`, commit `6df63fdc`), two registered
variants ([`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §Variants;
[`hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md)):

| Variant | OID | Label (ASCII) |
|---|---|---|
| `mldsa65_ed25519` | `1.3.6.1.5.5.7.6.48` | `COMPSIG-MLDSA65-Ed25519-SHA512` |
| `mldsa65_ecdsaP256` | `1.3.6.1.5.5.7.6.45` | `COMPSIG-MLDSA65-ECDSA-P256-SHA512` |

- **Representative message** (draft §5.3):
  `M' = Prefix || Label || len(ctx) || ctx || PH(M)`, with
  `Prefix = "CompositeAlgorithmSignatures2025"` (32 B), `PH(M) = SHA-512(M)`,
  `len(ctx)` one byte (`ctx` 0..255 B, default empty).
- **Signing**: `sig_ML-DSA = ML-DSA-65.Sign(M', ctx = Label)` (FIPS 204),
  and the classical leg signs `M'` (Ed25519) or `SHA-256(M')` (ECDSA-P256,
  DER-encoded `r,s`).
- **Verify = AND** of both component verifies over the reconstructed `M'`;
  no component can be stripped or downgraded
  ([`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §Construction / §Notes).
- The current draft has **no** per-signature randomizer `r` and uses an ASCII
  `Label` (not a DER-OID Domain); that is the revision change from the
  earlier -07 pin.

### 2.3 Method statement & normative references

The hybrid modules are **compositions of verified standards only**: they add
concatenation, a KDF (SHA3-256 / SHAKE256), a pre-hash (SHA-512), DER
framing, and an AND gate over primitives that are individually validated
(§3, §4). Pinned normative references:

| Reference | Role |
|---|---|
| FIPS 203 | ML-KEM (KEM leg of X-Wing) |
| FIPS 204 | ML-DSA (PQ leg of the composite signature) |
| FIPS 202 | SHA-3 / SHAKE-256 (combiner KDF) |
| RFC 7748 | X25519 (classical KEM leg) |
| RFC 8032 | Ed25519 (classical signature leg) |
| RFC 6979 | Deterministic ECDSA (ECDSA-P256 leg) |
| SEC 1 | EC point / DER encoding (ECDSA-P256) |
| SP 800-56C | Key-combiner / KDF guidance |
| SP 800-227 (draft) | KEM transition guidance (X-Wing alignment) |
| `draft-connolly-cfrg-xwing-kem` rev **-06** | X-Wing construction |
| `draft-ietf-lamps-pq-composite-sigs` rev **-19** (`6df63fdc`) | composite-signature construction |

(Reference set consolidated from the module docs;
the underlying-primitive FIPS/RFC mappings are cross-checked against
[`src/crypto/NIST_CONFORMANCE.md`](../../src/crypto/NIST_CONFORMANCE.md).)

## 3. Underlying primitives

The hybrid combiners compose **already-delivered, separately-tested** fw
primitives; the default hybrid path is **pure-JS** (`ml_kem` /
`ml_dsa` are pure-JS in fw today, already Worker-safe). An optional WASM
acceleration tier exists separately (§8).

| Primitive | Origin | Parameter set | Reference |
|---|---|---|---|
| `x25519` | fw own pure-JS (TweetNaCl-derived) | Curve25519 | RFC 7748 ([`x25519.acvp.md`](../../src/crypto/pkc/x25519.acvp.md)) |
| `ml_kem` | fw own pure-JS | ML-KEM-768 | FIPS 203 ([`ml_kem.acvp.md`](../../src/crypto/pkc/ml_kem.acvp.md)) |
| `ml_dsa` | fw own pure-JS | ML-DSA-65 | FIPS 204 ([`ml_dsa.acvp.md`](../../src/crypto/pkc/ml_dsa.acvp.md)) |
| `ed25519` | fw own pure-JS | Ed25519 | RFC 8032 ([`ed25519.acvp.md`](../../src/crypto/pkc/ed25519.acvp.md)) |
| `ecc` | fw own pure-JS (SJCL-derived) | ECDSA P-256 | FIPS 186-5 ([`ecc.acvp.md`](../../src/crypto/pkc/ecc.acvp.md)) |
| `sha3` / `sha512` / `sha256` | fw own pure-JS | SHA3-256, SHAKE256, SHA-512, SHA-256 | FIPS 202 / FIPS 180-4 |

**Optional WASM tier provenance.** When an integrator routes the underlying
KEM/DSA primitives through the fw WASM tier (`src/crypto/wasm/`), the
binaries are vendored from `@awacloud/fw-wasm-crypto`; each vendored source tree
carries a pinned URL, ref, and SHA-256 in
[`packages/front/fw-wasm-crypto/vendor/PROVENANCE.json`](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/vendor/PROVENANCE.json)
(inventory in §8). The default hybrid combiner path does **not** require the
WASM tier.

**Deviations.** None at the primitive level: the hybrid modules invoke the
primitives through their public APIs with the standard parameter sets above.
The combiner constructions themselves are **draft-stage** (X-Wing -06, LAMPS
-19) — that status is a non-claim, not a deviation, and is stated in §9.

## 4. Validation evidence (ACVP)

### 4.1 Underlying-primitive validations (cited, not re-run)

The composite/KEM constructions have **no** NIST validation program of their
own (§4.3). The underlying primitives carry their own validation evidence,
**cited here, not re-executed by this task**:

| Primitive | Validation | Evidence |
|---|---|---|
| ML-KEM-768 | ACVP (FIPS 203) | [`ml_kem.acvp.md`](../../src/crypto/pkc/ml_kem.acvp.md) |
| ML-DSA-65 | ACVP (FIPS 204) | [`ml_dsa.acvp.md`](../../src/crypto/pkc/ml_dsa.acvp.md) |
| X25519 | RFC 7748 vectors | [`x25519.acvp.md`](../../src/crypto/pkc/x25519.acvp.md) |
| Ed25519 | RFC 8032 / FIPS 186-5 vectors | [`ed25519.acvp.md`](../../src/crypto/pkc/ed25519.acvp.md) |
| ECDSA-P256 | FIPS 186-5 vectors | [`ecc.acvp.md`](../../src/crypto/pkc/ecc.acvp.md) |

Aggregate conformance map:
[`src/crypto/NIST_CONFORMANCE.md`](../../src/crypto/NIST_CONFORMANCE.md).

### 4.2 Hybrid-construction vectors (harness & results)

The composite constructions are anchored to **official interop vectors**, run
in the co-located fw test suites (no ACVP program exists for the composites —
§4.3):

| Vector set | Id | Source | Result |
|---|---|---|---|
| X-Wing IETF KAT | tv0..tv2 | [`__fixtures__/xwing-ietf-kat.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/__fixtures__/xwing-ietf-kat.js) — `draft-connolly-cfrg-xwing-kem` -06 App. C | Full 32-byte `ss` byte-match; **19 tests** [`hybridKem.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybridKem.test.js) |
| LAMPS composite (Ed25519) | empty-ctx + with-ctx | [`__fixtures__/composite-mldsa65-ed25519.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/__fixtures__/composite-mldsa65-ed25519.js) — draft -19 (`6df63fdc`) | Byte-exact through `verify()`; part of **32 tests** [`hybridSign.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybridSign.test.js) |
| LAMPS composite (ECDSA-P256) | empty-ctx + with-ctx | [`__fixtures__/composite-mldsa65-ecdsaP256.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/__fixtures__/composite-mldsa65-ecdsaP256.js) — draft -19 (`6df63fdc`) | DER-framed, byte-exact; negative controls reject; part of [`hybridSign.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybridSign.test.js) |
| Combiner reproducibility self-KAT | both variants | [`__fixtures__/composite-kat-regen.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/__fixtures__/composite-kat-regen.js) | Frozen impl reproduces committed `pk`/`sig` byte-for-byte (§7) |

The full `fw.crypto.pkc` suite runs **715 pass / 0 fail** (1 pre-existing
unrelated skip; 2938 `expect()` calls, 10 files) under
`bun test packages/front/fw/src/crypto/pkc/`.
The official-vector count across both hybrid modules is 19 (X-Wing) + 32
(composite) green.

There are **no public ACVP report links** for the hybrid constructions
because no ACVP program covers them (§4.3); the underlying-primitive ACVP
evidence is in the `*.acvp.md` files cited in §4.1.

### 4.3 Coverage gaps (reproduced verbatim from the module docs)

The following two blocks are reproduced **verbatim** from the *Coverage gaps*
sections authored by task 01 in
[`hybridKem.md`](../api/crypto/pkc/hybridKem.md) and
[`hybridSign.md`](../api/crypto/pkc/hybridSign.md); the relative links inside
them resolve from `docs/api/crypto/pkc/`.

X-Wing (`hybridKem`):

- **Covered**: X-Wing tv0..tv2 full shared-secret KAT; implicit-reject on a
  tampered ciphertext; malformed-length rejection. The underlying **ML-KEM-768**
  is ACVP-green ([`ml_kem.acvp.md`](../../src/crypto/pkc/ml_kem.acvp.md)) and **X25519** is RFC 7748
  vector-green — those greens are **cited, not re-run** here.
- **Not covered**: there is **no ACVP / CAVP program for X-Wing** (it is a
  draft-stage composite KEM, not a NIST-approved algorithm), so no certified
  test harness exists for the composite; the KAT above is the authoritative
  oracle. Side-channel / constant-time behaviour is out of scope (see below).

Composite signatures (`hybridSign`):

- **Covered**: both variants' official empty-ctx + with-ctx signatures
  (byte-exact); negative cases (wrong message, ctx-binding mismatch, tampered
  ML-DSA byte, tampered/stripped/swapped trad component, TLV splice-reject,
  malformed DER); the SHA-512 byte-domain KAT; deterministic self-KAT
  reproduction of both variants.
- **Not covered**: there is **no ACVP / CAVP program for the composite
  constructions** — no certified test harness exists, so the LAMPS interop
  vectors are the authoritative oracle. The underlying **ML-DSA-65** is ACVP-green
  ([`ml_dsa.acvp.md`](../../src/crypto/pkc/ml_dsa.acvp.md)), **Ed25519** / **ECDSA-P256** carry their
  own RFC/FIPS vector greens — those are **cited, not re-run** here. Side-channel
  / constant-time resistance is explicitly out of scope (§6).

## 5. Key management

**Encodings** (from [`hybridKem.md`](../api/crypto/pkc/hybridKem.md)
§Key encoding and [`hybridSign.md`](../api/crypto/pkc/hybridSign.md)
§Encoding):

- X-Wing: `pk = pk_ML-KEM(1184) || pk_X25519(32)` = **1216 B**;
  `sk` = the X-Wing **32-byte seed** (expand-on-use);
  `ct = ct_ML-KEM(1088) || ct_X25519(32)` = **1120 B**; `ss` = 32 B. Fixed
  component sizes are the scheme identifier, so no length prefix is used.
- Composite keys use a **length-prefixed TLV** container
  `schemeId(1) || u16(len) || component …` (`schemeId` `0x01` Ed25519 /
  `0x02` ECDSA-P256), so a parser cannot be tricked into re-slicing composite
  bytes (component-splicing guard); a wrong id, truncation, or trailing byte
  is rejected. Composite `pk` = `mldsaPK(1952) || ed25519PK(32)` or
  `mldsaPK(1952) || SEC1 ecPK(65)` = 2017 B. The Ed25519 signature is fixed
  slices `mldsaSig(3309) || edSig(64)` = 3373 B; the ECDSA-P256 signature
  length-prefixes its variable DER component
  (`mldsaSig(3309) || u16(derLen) || DER`).

**Independent seeds / no key reuse.** Composite `keygen()` draws
**independent** per-component seeds (ML-DSA and `ecc` self-seed via `random`;
the Ed25519 32-byte seed comes from `random.bytes`)
([`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §Notes). X-Wing derives
both component secrets from one seed through **distinct SHAKE256 output
ranges** plus the fixed combiner label, so neither component secret is
exposed for reuse in another scheme.

**Zeroization — best-effort only.** Transient key expansions and component
secrets are `.fill(0)`'d after use, but the runtime **cannot guarantee** a
wipe (GC copies, JIT-resident intermediates, no `mlock`). This is documented
as an explicit non-guarantee, never a security guarantee
([`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Constant-time &
zeroization).

**Lifecycle & boundary.** The modules are **client-side only**: keygen,
encapsulation/decapsulation and sign/verify run in the browser (or a Worker —
§6). Key generation, storage, rotation, transport and destruction across the
Target-of-Evaluation boundary are **integrator responsibilities** — the
module supplies the primitives, not a key-management lifecycle. Integrators
feed these encodings and the zeroization posture into their own TOE-boundary
analysis.

## 6. Implementation notes

Mirrors the honest posture of the module docs
([`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §6;
[`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Constant-time).

**Constant-time posture (per primitive, honest).**

- **Timing is not a security boundary.** Browser JS/WASM cannot guarantee
  constant time: JIT, GC, and the absence of `mlock` defeat it. Treat all
  timing behaviour as best-effort.
- The X25519 ladder and ML-KEM FO selection are written **branch-lean** but
  remain pure-JS ([`hybridKem.md`](../api/crypto/pkc/hybridKem.md)).
- The fw `ecc` P-256 scalar path is a **4-bit windowed** method
  (cache-timing sensitive on a co-resident adversary); ML-DSA and Ed25519 are
  branch-lean but pure-JS. For adversarial co-tenancy prefer a platform
  constant-time backend ([`hybridSign.md`](../api/crypto/pkc/hybridSign.md)
  §6).

**Memory handling.** Best-effort `.fill(0)` of transient seeds and
intermediate scalars, with the non-guarantee stated in §5.

**No telemetry / no network.** The combiners are pure compositions (concat,
KDF, pre-hash, DER framing, AND gate) with no network access and no telemetry
— the whole hybrid operation is self-contained and Worker-safe
([`hybridKem.md`](../api/crypto/pkc/hybridKem.md) §Worker Usage;
[`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §Worker Usage).

## 7. Verification & reproducibility

**Re-run the full evidence from the repo:**

```bash
# 1. Full pkc suite (includes both hybrid modules) — 715 pass / 0 fail
bun test packages/front/fw/src/crypto/pkc/

# 2. Hybrid modules only
bun test packages/front/fw/src/crypto/pkc/hybridKem.test.js    # 19 tests
bun test packages/front/fw/src/crypto/pkc/hybridSign.test.js   # 32 tests

# 3. Deterministic, network-free combiner-KAT regeneration proof
bun packages/front/fw/tools/hybrid-kat-regen.js                # exit 0 = byte-identical
```

Counts and outcomes are 715 pass / 0 fail, regen 5 cases byte-identical
(exit 0), and 19 (hybridKem) + 32 (hybridSign) official vectors. The
regeneration tool
([`tools/hybrid-kat-regen.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/tools/hybrid-kat-regen.js)) re-derives
the X-Wing `ek`/`ct` prefixes and full `ss` from the published seed +
randomness, and reproduces each composite `pk`/`sig` from a fixed per-variant
SHAKE-256 DRBG seed through the frozen construction, asserting byte-identity;
it is wired as a test
([`hybrid-kat-regen.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybrid-kat-regen.test.js))
so CI exercises it every run.

**Per-file byte provenance (SHA-256):**
[`src/crypto/pkc/hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md).

**SBOM reference.** A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each
published release, with every input read at the release commit (never a
working tree). Both SBOM files are attached to the release as assets, and
their SHA-256 digests are listed in the release's signed digest manifest.
The SBOM files are **not signed** in this release; signing them is a planned
improvement. This dossier does not embed the SBOM; §8 explains why
it is small.

## 8. Supply-chain statement

**Repo-as-SBOM rationale.** `@awacloud/fw` has **zero npm runtime dependencies**
(its manifest declares no `dependencies`). The default hybrid combiner path is
pure-JS fw primitives (§3), so its transitive supply chain is the fw source
tree itself. This is why the package's release SBOM (§7) is small — it lists
no runtime dependency for `@awacloud/fw` — and why the source tree remains
the material to audit.

**Vendored source inventory (optional WASM tier).** The `@awacloud/fw-wasm-crypto`
package supplies the optional WASM primitive tier; every vendored upstream
tree is pinned (URL + ref + SHA-256 + SPDX license + NOTICE pointer) in
[`packages/front/fw-wasm-crypto/vendor/PROVENANCE.json`](https://github.com/awacloud/awa/blob/main/packages/front/fw-wasm-crypto/vendor/PROVENANCE.json):

| Tree | Ref | SHA-256 (prefix) | License |
|---|---|---|---|
| mlkem-native | v1.2.0 | `377f0960…` | Apache-2.0 AND MIT AND ISC AND CC0-1.0 |
| pqclean | `202a8f9` | `517bffa8…` | CC0-1.0 |
| openssl-slh-dsa | openssl-3.5.0 | `20a5f860…` | Apache-2.0 |
| bearssl | v0.6 | `759d09cd…` | MIT |
| fiat-crypto | v0.1.6 | `b6a4a6ce…` | MIT AND BSD-1-Clause AND Apache-2.0 |
| libsodium | 1.0.22-RELEASE | `acb68370…` | ISC |

**NOTICE map.** Per-tree attribution files under
`packages/front/fw-wasm-crypto/vendor/` (`NOTICE`, `NOTICE-mlkem-native`,
`NOTICE-pqclean`, `NOTICE-openssl-slh-dsa`, `NOTICE-bearssl`,
`NOTICE-fiat-crypto`, `NOTICE-libsodium`); the provenance/NOTICE consistency
is itself tested (`vendor/notice.test.ts`, `vendor/provenance-trees.test.ts`).

**Hybrid-vector provenance.** The vectors/fixtures consumed by the hybrid
suites are locked per-file (source, revision, retrieval date, SHA-256, regen
command) in
[`src/crypto/pkc/hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md).
The LAMPS composite vectors are re-pinned to the numbered revision **-19** and
verified **byte-identical** to the earlier `main @1bb9f5c6` vendoring.

**Security / maintenance policy.** The vulnerability-disclosure policy is
[`SECURITY.md`](https://github.com/awacloud/awa/blob/main/SECURITY.md) and the
versioning / support-window policy is
[`MAINTENANCE.md`](https://github.com/awacloud/awa/blob/main/MAINTENANCE.md),
both at the root of the public repository. Reports go to
**security@awacloud.com**; the OpenPGP key published in `SECURITY.md` protects
that reporting channel only and signs nothing in the release chain (§10). The framework
hardening guide is [`docs/guide/security.md`](../guide/security.md). One
accepted-debt item is recorded in provenance: BearSSL v0.6 is a 2018 beta,
never formally audited (`vendor/PROVENANCE.json` `bearssl.notice`).

## 9. Limits & non-claims

Mirrors the -19 re-vendor outcome
([`hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md)).

- **Component, not a certified product.** This is supplier evidence for a
  cryptographic **component**. **No ANSSI certification** of the composite
  schemes is claimed anywhere. **No FIPS validation of the composite** is
  claimed — the underlying primitives carry their own status (§4), the
  composite wrapper is not independently validated
  ([`hybridSign.md`](../api/crypto/pkc/hybridSign.md) §9).
- **Draft-stage constructions.** X-Wing is pinned to `draft-…-xwing-kem`
  **-06** and the composite signatures to `draft-ietf-lamps-pq-composite-sigs`
  **-19**; there is no NIST/CAVP program for either composite (§4.3). A future
  draft that changes the combiner/label/`PH` (or re-introduces the LAMPS
  randomizer `r`) breaks interop — this is a **construction drift** event:
  stop and escalate, do not silently re-vendor (provenance escalation note).
- **-19 pin outcome.** The composite vectors were re-pinned from the
  unnumbered `main @1bb9f5c6` to the numbered revision **-19** (`6df63fdc`)
  and confirmed **byte-identical** for every field (PK, both signatures,
  message, context) of both variants — the WG numbered revision retained the
  construction.
- **Zeroization is best-effort only** (§5) — never a security guarantee.
- **Timing is not a security boundary** (§6) — pure-JS timing is best-effort;
  for adversarial co-tenancy prefer a platform constant-time backend.
- **Nothing beyond §2–§3 is provided.** The evidence covers exactly the two
  constructions and their listed primitives; no other algorithm, protocol
  integration, or key-management lifecycle is in scope (§5 boundary).

## 10. Document control

| Field | Value |
|---|---|
| Document | PQC-hybrid combiners — evaluation-evidence dossier |
| Covers | `@awacloud/fw` `hybridKem`, `hybridSign` (`fw.crypto.pkc`) |
| Package version | `@awacloud/fw` 0.1.0 (maturity L3) |
| Repository commit | The commit the signed release tag names — see [`verify-releases.md`](https://github.com/awacloud/awa/blob/main/docs/publication/verify-releases.md) |
| Snapshot date | 2026-09-23 |
| Signature | This document carries **no signature of its own**. Its integrity is that of the release it ships in: the release tag is signed over SSH by the tag key `awa-tag-2026` (ed25519, classical), and the release's per-file digest manifest is signed by a detached hybrid envelope (ML-DSA-65 + ECDSA P-256, both must verify) — the manifest is the authoritative half. Keys: [`SECURITY.md`](https://github.com/awacloud/awa/blob/main/SECURITY.md) § Release keys; procedure: [`verify-releases.md`](https://github.com/awacloud/awa/blob/main/docs/publication/verify-releases.md) |
| Contact | security@awacloud.com — the reporting channel named in [`SECURITY.md`](https://github.com/awacloud/awa/blob/main/SECURITY.md) (§8) |

**Change log.**

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-07-09 | Initial issue. Constructions X-Wing -06, LAMPS composite-sigs -19; vectors 19 (X-Wing) + 32 (composite) green; combiner regen byte-identical. |
| 2 | 2026-09-23 | Supply-chain and document-control re-issue; §2–§6 and §9 unchanged. §7: SBOM generated per release in CycloneDX 1.6 + SPDX 2.3, unsigned in this release (was "pending"). §8: repo-as-SBOM rationale kept as the reason the SBOM is small (was "export pending"). §8: disclosure and maintenance policies now published (`SECURITY.md`, `MAINTENANCE.md`); the OpenPGP key is named as the reporting-channel key only. §10: maturity L3 (was L2). §10: "PGP signature" row replaced by "Signature" — no own signature; release tag (SSH) + hybrid-signed digest manifest. §10: contact is the `SECURITY.md` reporting channel. §1: internal tracking reference removed; licence fact kept. |

**Re-issue triggers** (§1): a pinned construction/vector revision change; a
closed coverage gap (§4); a supply-chain inventory change (§8); SBOM signing
becoming available (§7); a release-key rotation (§10).

### Related documents

- [`hybridKem.md`](../api/crypto/pkc/hybridKem.md) — X-Wing module API + evidence.
- [`hybridSign.md`](../api/crypto/pkc/hybridSign.md) — composite-signature module API + evidence.
- [`hybrid-kat.provenance.md`](../../src/crypto/pkc/hybrid-kat.provenance.md) — per-file vector provenance lock.
- [`NIST_CONFORMANCE.md`](../../src/crypto/NIST_CONFORMANCE.md) — aggregate primitive conformance map.
