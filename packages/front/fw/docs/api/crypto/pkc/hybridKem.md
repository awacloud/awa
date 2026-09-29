---
module: hybridKem
category: crypto/pkc
dependencies: [x25519, ml_kem, sha3]
returns: object
worker-safe: true
status: complete
---

# hybridKem

> X-Wing hybrid KEM — X25519 + ML-KEM-768, IETF KAT-verified (draft rev -06).

**Module** `hybridKem` | **Source** `packages/front/fw/src/crypto/pkc/hybridKem.js` | **Deps** `x25519`, `ml_kem`, `sha3` | **Worker-safe** yes

X-Wing is a general-purpose **hybrid** Key Encapsulation Mechanism combining the
classical X25519 Diffie–Hellman KEM with the NIST post-quantum KEM ML-KEM-768, so
that the shared secret stays secure as long as **either** component resists
attack (harvest-now-decrypt-later hedge). It is a pure composition over the vetted
fw primitives [`x25519`](./x25519.md), [`ml_kem`](./ml_kem.md) and
[`sha3`](../hash/sha3.md) — no novel cryptography.

## Resolve

```js
const hybridKem = runtime.resolve('hybridKem');
// Returns: { xwing }
```

Direct ESM (a ready-to-use `xwing` over default fw primitives, lazily wired):

```js
import { xwing } from '@awacloud/fw/crypto/pkc/hybridKem.js';
```

## Construction (FROZEN)

X-Wing per `draft-connolly-cfrg-xwing-kem` **revision -06** (CFRG) — the revision
whose Appendix C KAT the in-repo libsodium reference
(`references/CRYPTO-SRC/libsodium/test/default/kem_xwing.c`, tv0..tv2) encodes.

- **Combiner** (draft §5.3, fixed-label variant):
  `ss = SHA3-256( ss_ML-KEM || ss_X25519 || ct_X25519 || pk_X25519 || label )`,
  `label = 5c 2e 2f 2f 5e 5c` (ASCII `\.//^\`). The fixed label pins the scheme
  and binds `ct_X25519 || pk_X25519`, so a component key cannot be reused in
  another combiner without changing the label domain.
- **Key derivation** (draft §5.1): the secret key is a **32-byte seed**;
  `expanded = SHAKE256(seed, 96)` splits into `mlkem_seed = expanded[0..64)`
  (`d || z` for ML-KEM keygen) and `sk_X25519 = expanded[64..96)`.

## Key encoding

Fixed-length concatenation — component sizes **are** the scheme identifier, so no
length prefix is used.

| Artefact | Encoding | Size |
|----------|----------|------|
| `pk` | `pk_ML-KEM(1184) \| pk_X25519(32)` | 1216 B |
| `sk` | the X-Wing seed (expand-on-use) | 32 B |
| `ct` | `ct_ML-KEM(1088) \| ct_X25519(32)` | 1120 B |
| `ss` | shared secret | 32 B |

## API

`xwing` — the single X-Wing hybrid KEM instance.

| Method | Signature | Returns |
|--------|-----------|---------|
| `xwing.lengths` | `{ pk: 1216, sk: 32, ct: 1120, ss: 32 }` | Byte sizes |
| `xwing.keygen(seed?)` | `(Uint8Array(32)?) => {publicKey, secretKey} \| false` | Keypair; deterministic for a 32-byte seed, random otherwise |
| `xwing.encapsulate(publicKey, rnd?)` | `(Uint8Array(1216), Uint8Array(64)?) => {cipherText, sharedSecret} \| false` | Encapsulate; `rnd = msg32 \| eskX32`, deterministic when supplied |
| `xwing.decapsulate(cipherText, secretKey)` | `(Uint8Array(1120), Uint8Array(32)) => Uint8Array(32) \| false` | Shared secret; implicit-reject on a tampered ct, `false` on malformed length |

Returns `Uint8Array` everywhere; `false` on invalid input (fw crypto idiom).

## Examples

### KEM end-to-end

```js
const hybridKem = runtime.resolve('hybridKem');
const { xwing } = hybridKem;

// Receiver
const { publicKey, secretKey } = xwing.keygen();

// Sender (receives publicKey)
const { cipherText, sharedSecret } = xwing.encapsulate(publicKey);

// Receiver (receives cipherText)
const sharedSecret2 = xwing.decapsulate(cipherText, secretKey);
// sharedSecret === sharedSecret2 (32 bytes)
```

### Deterministic (KAT) form

```js
import { xwing } from '@awacloud/fw/crypto/pkc/hybridKem.js';

const { publicKey, secretKey } = xwing.keygen(seed32);         // fixed 32-byte seed
const { cipherText, sharedSecret } = xwing.encapsulate(publicKey, rnd64); // msg32||eskX32
```

## Worker Usage

The descriptor factory is a self-contained pure composition (concat +
SHAKE256/SHA3-256 KDF), so the whole hybrid operation runs inside one Worker call
with no main-thread round-trips.

```js
const worker = fw.createWorker(['hybridKem']);
const kp = await worker.call('hybridKem.xwing.keygen');
```

## Constant-time & zeroization posture (honest)

- **Timing is NOT a security boundary.** The X25519 ladder and ML-KEM FO selection
  are written branch-lean, but browser JS/WASM cannot guarantee constant time (JIT,
  GC, no `mlock`). Do not rely on this module for side-channel resistance.
- **Zeroization is best-effort only, never a guarantee.** Transient key expansions
  and component secrets are `.fill(0)`'d after use, but the runtime may retain GC
  copies or JIT-resident intermediates. Treat at-rest secret handling as the
  caller's responsibility.

## Positioning & liability

awa ships X-Wing as a **certifiable cryptographic component**, not a certified
product: no ANSSI/FIPS certification of the composite scheme is claimed here. The
underlying ML-KEM-768 is ACVP-green (`src/crypto/pkc/ml_kem.acvp.md`); X25519 is
RFC 7748 vector-green. Correctness is anchored to the **official IETF X-Wing KAT**
(tv0..tv2, full 32-byte shared-secret match), not merely a self-consistent
round-trip. Rejected-but-noted alternatives (X25519MLKEM768 TLS-concat combiner;
generic HKDF `Z||T` combiner) are intentionally NOT shipped — X-Wing's fixed label
is the safer general-purpose default.

## Evidence & vectors

Correctness is anchored to the **official IETF X-Wing KAT** and locked by a
deterministic, network-free regeneration proof.

| Vector set | Id | Source | What it proves |
|---|---|---|---|
| X-Wing IETF KAT | `tv0..tv2` | `src/crypto/pkc/__fixtures__/xwing-ietf-kat.js` (test fixture — repository only, not shipped) — `draft-connolly-cfrg-xwing-kem` rev -06 App. C | Full 32-byte `ss` byte-match + `ek`/`ct` prefixes (not a mere round-trip) |

- **Regeneration proof** — `bun packages/front/fw/tools/hybrid-kat-regen.js`
  recomputes `ekPrefix` / `ctPrefix` / full `ss` for tv0..tv2 from the published
  `seed` + `randomness` through the frozen `xwing`, and asserts byte-identity
  (exit 0/1). Wired as a test in
  [`hybrid-kat-regen.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybrid-kat-regen.test.js)
  so CI exercises it every run.
- **Provenance** — per-file source / revision / SHA-256 in
  [`hybrid-kat.provenance.md`](../../../../src/crypto/pkc/hybrid-kat.provenance.md).

### Coverage gaps

- **Covered**: X-Wing tv0..tv2 full shared-secret KAT; implicit-reject on a
  tampered ciphertext; malformed-length rejection. The underlying **ML-KEM-768**
  is ACVP-green ([`ml_kem.acvp.md`](../../../../src/crypto/pkc/ml_kem.acvp.md)) and **X25519** is RFC 7748
  vector-green — those greens are **cited, not re-run** here.
- **Not covered**: there is **no ACVP / CAVP program for X-Wing** (it is a
  draft-stage composite KEM, not a NIST-approved algorithm), so no certified
  test harness exists for the composite; the KAT above is the authoritative
  oracle. Side-channel / constant-time behaviour is out of scope (see below).

## Notes

- Pinned draft revision **-06**; a future draft that changes the combiner, label,
  or key derivation breaks interop — re-pin and re-verify against fresh vectors.
- Deterministic for fixed inputs (32-byte seed, 64-byte encaps randomness), which
  is exactly what the KAT exercises; production callers omit them to draw the
  platform CSPRNG.

## See also

- [`ml_kem`](./ml_kem.md) — the post-quantum KEM leg (ML-KEM-768).
- [`x25519`](./x25519.md) — the classical Diffie–Hellman leg.
- [`hybridSign`](./hybridSign.md) — companion composite-signature hybrid (shares
  the positioning & zeroization posture).
