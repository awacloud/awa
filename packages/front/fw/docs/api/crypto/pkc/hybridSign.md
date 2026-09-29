---
module: hybridSign
category: crypto/pkc
dependencies: [ml_dsa, ed25519, ecc, sha512, sha256, random, utf8]
returns: object
worker-safe: true
status: complete
---

# hybridSign

> Composite PQ/T signatures (LAMPS draft) — ML-DSA-65 ∧ Ed25519 / ECDSA-P-256, AND-verify.

**Module** `hybridSign` | **Source** `packages/front/fw/src/crypto/pkc/hybridSign.js` | **Deps** `ml_dsa`, `ed25519`, `ecc`, `sha512`, `sha256`, `random`, `utf8` | **Worker-safe** yes

Composes vetted fw primitives into `draft-ietf-lamps-pq-composite-sigs` composite signatures — no novel cryptography. Both components sign one representative `M'`; verify is the logical AND of both, so no component can be stripped or downgraded.

## Resolve

```js
const hybridSign = runtime.resolve('hybridSign');
// Returns: { mldsa65_ed25519, mldsa65_ecdsaP256, _internal }
```

## Construction (frozen, vector-verified)

```
M' = Prefix || Label || len(ctx) || ctx || SHA-512(M)          [draft §5.3]
  Prefix = ASCII "CompositeAlgorithmSignatures2025"  (32 B)     [draft §5.2]
  Label  = the per-variant ASCII label (see table)             [draft §11]
  len(ctx) = 1 byte (ctx is 0..255 bytes; default empty)

sig_ML-DSA = ML-DSA-65.Sign(M', mldsa_ctx = Label)     (FIPS 204 Alg 2)
sig_trad   = Ed25519.Sign(M')                          (its own ctx unused)
           | ECDSA-P256.Sign(SHA-256(M'))              (DER-encoded r,s)
verify     = ML-DSA verify AND trad verify over the reconstructed M'
```

The current draft has **no** per-signature randomizer `r` and uses an ASCII
`Label` (not a DER-OID Domain). This exact wiring reproduces the official LAMPS
interop vectors.

## Variants

| Variant | OID | Label (ASCII) | Composite pk | Composite sig |
|---------|-----|---------------|--------------|---------------|
| `mldsa65_ed25519` | `1.3.6.1.5.5.7.6.48` | `COMPSIG-MLDSA65-Ed25519-SHA512` | 1952 + 32 B | 3309 + 64 = 3373 B |
| `mldsa65_ecdsaP256` | `1.3.6.1.5.5.7.6.45` | `COMPSIG-MLDSA65-ECDSA-P256-SHA512` | 1952 + 65 B | 3309 + DER (variable) |

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `<variant>.lengths` | object | Component + container byte lengths |
| `<variant>.keygen()` | `() => {publicKey, secretKey}` | TLV-encoded key pair (independent seeds) |
| `<variant>.sign(sk, msg, ctx?)` | `(Uint8Array, Uint8Array, Uint8Array?) => Uint8Array \| false` | Composite signature |
| `<variant>.verify(pk, msg, sig, ctx?)` | `(Uint8Array, Uint8Array, Uint8Array, Uint8Array?) => boolean` | AND of both components |

Inputs/outputs are `Uint8Array`; any invalid input returns `false` (sign) or
`false` (verify). `ctx` is an optional 0..255-byte application context bound
into `M'`.

## Encoding

- **Public / secret keys** use a length-prefixed TLV container
  `schemeId(1) || u16(len) || component …` so a parser cannot be tricked into
  re-slicing composite bytes (guards component-splicing). `schemeId` = `0x01`
  (Ed25519) / `0x02` (ECDSA-P256); a wrong id, truncation, or trailing byte is
  rejected.
- **Ed25519 signature** is fixed slices `mldsaSig(3309) || edSig(64)` — identical
  to the official wire form (no randomizer).
- **ECDSA-P256 signature** length-prefixes its variable DER component:
  `mldsaSig(3309) || u16(derLen) || DER`.

The official LAMPS vectors use a plain component concat; the vendored conformance
tests re-frame the exact official component bytes into this container and verify
through the real `verify()` path.

## Examples

```js
const hybridSign = runtime.resolve('hybridSign');
const v = hybridSign.mldsa65_ed25519;

const { publicKey, secretKey } = v.keygen();
const msg = new TextEncoder().encode('hello');
const sig = v.sign(secretKey, msg);
v.verify(publicKey, msg, sig);            // true

// bind an application context
const ctx = new TextEncoder().encode('app:v1');
const sigCtx = v.sign(secretKey, msg, ctx);
v.verify(publicKey, msg, sigCtx, ctx);    // true
v.verify(publicKey, msg, sigCtx);         // false — ctx mismatch
```

## Worker Usage

The whole composite operation is pure composition (SHA-512 pre-hash, component
sign/verify, AND) and runs in a single Worker call; the PQ primitive loads as it
does on the main thread.

```js
const worker = fw.createWorker(['hybridSign']);
const sig = await worker.call('hybridSign', 'mldsa65_ecdsaP256', 'sign', [sk, msg]);
```

## §6 — Constant-time posture (honest)

- Browser JS/WASM **cannot guarantee constant-time**: JIT, GC, and the absence of
  `mlock` mean timing is **not a security boundary**. Treat it as best-effort.
- The fw `ecc` P-256 scalar path is a 4-bit windowed method (cache-timing
  sensitive on a co-resident adversary). ML-DSA and Ed25519 are written
  branch-lean but are still pure-JS. For adversarial co-tenancy prefer a
  platform constant-time backend.
- **Zeroization is best-effort only.** `keygen()` `.fill(0)`s transient seeds and
  intermediate scalars, but JS cannot guarantee a wipe (GC copies, JIT-resident
  values). Never rely on it as a security guarantee.

## §9 — Limits & non-claims

- **Not FIPS-validated as a composite.** The underlying ML-DSA / Ed25519 / ECDSA
  primitives carry their own validation status; the composite wrapper is not
  independently validated.
- **Vector revision pin.** Conformance is byte-exact against the official
  `draft-ietf-lamps-pq-composite-sigs` interop vectors, now **re-pinned to the
  numbered IETF revision -19** (tag `draft-ietf-lamps-pq-composite-sigs-19`,
  commit `6df63fdc`, re-vendored 2026-07-09). The -19 bytes were fetched and
  confirmed **byte-identical** to the original `main @1bb9f5c6` vendoring for
  every field (PK, both signatures, message, context) of both variants — the WG
  numbered revision **retains** this construction (ASCII `Label`, no `r`). A
  future draft that re-introduces `r` or changes `Label`/`PH` would break interop
  (construction drift → escalate, do not silently re-vendor).
- **Draft table inconsistency (ECDSA-P256).** The draft's own `labelsTable.md`
  lists the label as `COMPSIG-MLDSA65-P256-SHA512` while `algParams.md` lists
  `COMPSIG-MLDSA65-ECDSA-P256-SHA512`. The committed vectors are authoritative and
  verify **only** with the latter; the module uses the vector-proven label.
- **Dependency note.** The module depends on `sha256` (ECDSA-P256 inner hash,
  vector-proven) and `random` (Ed25519 keygen seed) in addition to the original design
  sketch — both are load-bearing.

## Evidence & vectors

Correctness is anchored to the **official LAMPS interop vectors** (byte-exact,
both variants, empty-ctx + with-ctx) and locked by a deterministic regeneration
proof.

| Vector set | Id | Source | What it proves |
|---|---|---|---|
| LAMPS composite (Ed25519) | empty-ctx + with-ctx | `src/crypto/pkc/__fixtures__/composite-mldsa65-ed25519.js` (test fixture — repository only, not shipped) — draft rev **-19** (`6df63fdc`) | ML-DSA sig, Ed25519 sig and composite PK all byte-exact official material through `verify()` |
| LAMPS composite (ECDSA-P256) | empty-ctx + with-ctx | `src/crypto/pkc/__fixtures__/composite-mldsa65-ecdsaP256.js` (test fixture — repository only, not shipped) — draft rev **-19** (`6df63fdc`) | DER-framed ECDSA composite verifies byte-exact; negative (strip/swap/tamper) rejects |
| Combiner reproducibility self-KAT | `mldsa65_ed25519`, `mldsa65_ecdsaP256` | `src/crypto/pkc/__fixtures__/composite-kat-regen.js` (test fixture — repository only, not shipped) — generated by the frozen impl | Frozen keygen + deterministic sign reproduce the committed `pk`/`sig` byte-for-byte (drift lock) |

- **Regeneration proof** — `bun packages/front/fw/tools/hybrid-kat-regen.js`
  re-derives each composite `pk` + `sig` from a fixed per-variant SHAKE-256 DRBG
  seed through the frozen construction, asserts byte-identity and re-verifies
  each signature (exit 0/1). Wired as a test in
  [`hybrid-kat-regen.test.js`](https://github.com/awacloud/awa/blob/main/packages/front/fw/src/crypto/pkc/hybrid-kat-regen.test.js).
- **Provenance** — per-file source / revision / SHA-256 in
  [`hybrid-kat.provenance.md`](../../../../src/crypto/pkc/hybrid-kat.provenance.md).

### Coverage gaps

- **Covered**: both variants' official empty-ctx + with-ctx signatures
  (byte-exact); negative cases (wrong message, ctx-binding mismatch, tampered
  ML-DSA byte, tampered/stripped/swapped trad component, TLV splice-reject,
  malformed DER); the SHA-512 byte-domain KAT; deterministic self-KAT
  reproduction of both variants.
- **Not covered**: there is **no ACVP / CAVP program for the composite
  constructions** — no certified test harness exists, so the LAMPS interop
  vectors are the authoritative oracle. The underlying **ML-DSA-65** is ACVP-green
  ([`ml_dsa.acvp.md`](../../../../src/crypto/pkc/ml_dsa.acvp.md)), **Ed25519** / **ECDSA-P256** carry their
  own RFC/FIPS vector greens — those are **cited, not re-run** here. Side-channel
  / constant-time resistance is explicitly out of scope (§6).

## Notes

- Verify is a strict AND (`okMl === true && okTrad === true`); a stripped,
  swapped, or tampered component is rejected — the anti-downgrade property.
- `keygen()` draws **independent** per-component seeds (ML-DSA and `ecc` self-seed
  via `random`; the Ed25519 32-byte seed comes from `random.bytes`). No component
  key is reused across schemes.
- Message bytes are hashed through the bitArray domain before `sha512.hash()`
  (SJCL big-endian packing). A raw-byte digest silently passes a round-trip but
  fails the official vectors — only the vectors are evidence of correctness.

## See also

- [ml_dsa](./ml_dsa.md) — ML-DSA-65 post-quantum component.
- [ed25519](./ed25519.md) — Ed25519 classical component.
- [ecc](./ecc.md) — ECDSA-P-256 classical component.
- [hybridKem](./hybridKem.md) — companion hybrid KEM (X-Wing).
