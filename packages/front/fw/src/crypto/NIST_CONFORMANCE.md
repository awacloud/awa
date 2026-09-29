# NIST conformance — `fw/core/crypto` module

State as of the current commit. Test vectors are executed on every
build via `bun test src/crypto/` (**3 853 tests + 7 skip
gated `CRYPTO_FULL`**, 0 failures, 41 files; ~180 s).


## Legend

- ✅ — implemented + official vectors validated
- ⚠️ — implemented but outside NIST scope (defense in depth)
- ❌ — not implemented in this module

---

## FIPS — validated primitives

| Standard | Algorithm | Module | Status | Vectors |
|---|---|---|---|---|
| FIPS 197 | AES-128/192/256 | [aes.js](cipher/aes.js) | ✅ | FIPS-197 App. B/C + **ACVP-AES-ECB-1.0** (254 AFT/2138 sub-sample, 6 MCT chains × 100 outer × 1000 inner — iter0 + iter99 byte-exact); **`api.fn` constant-time by default** (masked-lookup S-box anti-cache-timing); fast T-table opt-in via `api.ttable.fn`; `api.bitsliced.fn` deprecated alias of `api.fn` — see [aes.acvp.md](cipher/aes.acvp.md) |
| FIPS 180-4 | SHA-224 | [sha224.js](hash/sha224.js) | ✅ | FIPS-180 + **ACVP-SHA2-224-1.0** (24 AFT/512 incl. bit-level non-byte-aligned + 1 MCT standard × 100 outer × 1000 inner byte-exact) — see [sha224.acvp.md](hash/sha224.acvp.md) |
| FIPS 180-4 | SHA-256 | [sha256.js](hash/sha256.js) | ✅ | FIPS-180 App. B 1-3 (incl. 1M×"a") + **ACVP-SHA2-256-1.0** (67 AFT/512 sub-sample over lengths 1720..12144 bits + 1 MCT alternate × 100 outer × 1000 inner byte-exact) — see [sha256.acvp.md](hash/sha256.acvp.md) |
| FIPS 180-4 | SHA-384 | [sha384.js](hash/sha384.js) | ✅ | FIPS-180 + **ACVP-SHA2-384-1.0** (24 AFT/1024 incl. bit-level + 1 MCT standard × 100 outer × 1000 inner byte-exact) — see [sha384.acvp.md](hash/sha384.acvp.md) |
| FIPS 180-4 | SHA-512 | [sha512.js](hash/sha512.js) | ✅ | FIPS-180 + **ACVP-SHA2-512-1.0** (67 AFT/1024 + 1 MCT alternate × 100 outer × 1000 inner byte-exact); iteration A2 exposes `_internal.makeSha(init, outWords)` builder for the truncated variants — see [sha512.acvp.md](hash/sha512.acvp.md) |
| FIPS 180-4 §5.3.6.1 | SHA-512/224 | [sha512_224.js](hash/sha512_224.js) | ✅ | **ACVP-SHA2-512-224-1.0** (74/146 byte-aligned AFT sub-sample + 1 MCT standard × 100 outer × 1000 inner byte-exact); IV derived by independent computation (FIPS §5.3.6); HMAC-compatible — see [sha512_224.acvp.md](hash/sha512_224.acvp.md) |
| FIPS 180-4 §5.3.6.2 | SHA-512/256 | [sha512_256.js](hash/sha512_256.js) | ✅ | **ACVP-SHA2-512-256-1.0** (53/1024 byte-aligned AFT sub-sample + 1 MCT alternate × 100 outer × 1000 inner byte-exact); IV derived then cross-checked against OpenSSL (the widely circulated incorrect IV `c84d6b74` corrected to `c84c64c2`); HMAC-compatible — see [sha512_256.acvp.md](hash/sha512_256.acvp.md) |
| FIPS 202 | SHA3-224/256/384/512 | [sha3.js](hash/sha3.js) | ✅ | FIPS 202 + NIST KAT 200×0xa3 + **ACVP-SHA3-{224,256,384,512}-2.0** (AFT byte-aligned sub-sample 15+16+13+13 + 4 MCT standard × 100 outer × 1000 inner — SHA3-256 100/100 byte-exact, others iter0+iter99) — see [sha3.acvp.md](hash/sha3.acvp.md) |
| FIPS 202 | SHAKE128 / SHAKE256 | [sha3.js](hash/sha3.js) | ✅ | NIST CAVP + **ACVP-SHAKE-{128,256}-FIPS202** (AFT byte-aligned in/out 29 + 6, outLen variable, multi-block squeeze validated) — see [sha3.acvp.md](hash/sha3.acvp.md) |
| FIPS 198-1 | HMAC-SHA-2 + HMAC-SHA-3 + HMAC-SHA-512/{224,256} | [hmac.js](hash/hmac.js) | ✅ | RFC 4231 + **ACVP-HMAC-SHA2-{224,256,384,512}-2.0** (4 × 35 AFT/150) + **ACVP-HMAC-SHA3-{224,256,384,512}-2.0** (4 × 31 AFT/150, **iteration B1**) + **ACVP-HMAC-SHA2-512-{224,256}-2.0** (2 × 31 AFT/150, **iteration B2**) — see [hmac.acvp.md](hash/hmac.acvp.md) |
| FIPS 186-5 §6 | ECDSA (P-{224,256,384,521} + K-curves) | [ecc.js](pkc/ecc.js) | ✅ | round-trip + CAVP P-256/SHA-256 SigVer; **deterministic k RFC 6979** by default + **ACVP**: KeyGen-FIPS186-5 (24/72 validator `Q==d·G`), **KeyVer-FIPS186-5 (12/12 full §A.4.2 validation, C1)**, SigVer-FIPS186-5 (8 sub-samples), **DetECDSA-SigGen-FIPS186-5 (16 byte-exact RFC 6979 over 4 NIST pairs incl. P-521+SHA-512, C2)**; **strict mode `verify({strict:true})` + low-s canonicalization `sign({strict:true})` + RFC 6979 hash-decoupling `sign({hashForK})` (C3)** — see [ecc.acvp.md](pkc/ecc.acvp.md) |
| FIPS 186-5 §A.1.3 | RSA keygen (probable primes) | [rsaKeygen.js](utils/rsaKeygen.js) | ✅ | sieve < 2000 + Miller-Rabin (k=5 at 1024 bits, Table B.1), top-2 bits forced, `\|p−q\| > 2^(nlen/2−100)`, `d > 2^(nlen/2)`, CRT output (dp, dq, qInv); round-trip OAEP-SHA-256 on a 2048-bit key + **RSA-KeyGen-FIPS186-5** (15/15 validator-style vectors: MR on p,q, byte-exact dmp1/dmq1/iqmp via `_inverseModAny(e, lcm(p−1,q−1))` over 3 nlen × 5 ACVP methods); `provable`/auxiliary methods not implemented (P3) — see [rsaKeygen.acvp.md](utils/rsaKeygen.acvp.md) |
| FIPS 203 | ML-KEM-512/768/1024 | [ml_kem.js](pkc/ml_kem.js) | ✅ | KAT Wycheproof (keygen + encaps byte-exact) + round-trip 512/768/1024 + implicit reject + **ACVP**: ML-KEM-keyGen-FIPS203 (9/75 sub-samples first/mid/last × 3 paramSets), ML-KEM-encapDecap-FIPS203 (9 encap + 9 decap sub-samples + 30/30 decapKeyCheck §7.3 hash-consistency + 30/30 encapKeyCheck §7.2 modulus-q) — see [ml_kem.acvp.md](pkc/ml_kem.acvp.md) |
| FIPS 204 | ML-DSA-44/65/87 | [ml_dsa.js](pkc/ml_dsa.js) | ✅ | Wycheproof KAT byte-exact (keygen ML-DSA-65 + sign deterministic + verify) + **ACVP**: ML-DSA-keyGen-FIPS204 (9/75 sub-samples × 3 paramSets), ML-DSA-sigGen-FIPS204 external+pure (18 byte-exact), ML-DSA-sigVer-FIPS204 external+pure (45/45 mix valid/invalid) + **HashML-DSA iteration E3**: `signPh/verifyPh` 12 hashAlg supported (9 SigGen + 45 SigVer ACVP byte-exact) + **internal interface** (`_internal.signInternal/verifyInternal` 9 ACVP) + **externalMu** (`_internal.signWithMu/verifyWithMu` 9 ACVP) — see [ml_dsa.acvp.md](pkc/ml_dsa.acvp.md) |
| FIPS 205 | SLH-DSA-{SHAKE,SHA2}-{128,192,256}{f,s} | [slh_dsa.js](pkc/slh_dsa.js) | ✅ | 12 variants byte-exact against @noble/post-quantum 0.6.1 — §11.1 (SHAKE) + §11.2 (SHA-2); **ACVP**: SLH-DSA-keyGen-FIPS205 (36/120), SLH-DSA-sigGen-FIPS205 external+pure 128f (2 byte-exact), SLH-DSA-sigVer-FIPS205 external+pure 'f' variants (15/84) + **HashSLH-DSA iteration E4**: `signPh/verifyPh` 12 hashAlg supported (2 SigGen + 12 SigVer ACVP byte-exact over 'f' variants) + **internal interface** (`_internal.signInternal/verifyInternal` 2 SigGen + 12 SigVer ACVP); externalMu not applicable to SLH-DSA (no intermediate mu in FIPS 205 §6) — see [slh_dsa.acvp.md](pkc/slh_dsa.acvp.md) |

## NIST SP — modes & derivation

| Standard | Algorithm | Module | Status | Vectors |
|---|---|---|---|---|
| SP 800-38A | AES-CTR | [ctr.js](mode/ctr.js) | ✅ | F.5.1 + **ACVP-AES-CTR-1.0** (78 AFT/150 sub-sample: 3 testGroups encrypt + 3 decrypt × AES-128/192/256, payloadLen 1..1920 bits incl. non-byte/non-block-aligned via `bitArray.clamp`) — see [ctr.acvp.md](mode/ctr.acvp.md) |
| SP 800-38A | AES-CBC | [cbc.js](mode/cbc.js) | ✅ | RFC 3602 §4 (1-4) + **ACVP-AES-CBC-1.0** (144 AFT/2156 sub-sample: 12 testGroups encrypt + 12 decrypt × AES-128/192/256, multi-block tgId 25-30 full 10×ptLen) + **MCT 6/6 byte-exact** (FIPS 140-2 Annex C: tgId 37-42 × 100 outer × 1000 inner with ACVP-spec key/IV/PT transitions, **iteration D4**) — see [cbc.acvp.md](mode/cbc.acvp.md) |
| SP 800-38B | AES-CMAC | [cmac.js](mode/cmac.js) | ✅ | RFC 4493 §4 + **CMAC-AES-1.0** (81 gen + 108 ver / 756 sub-sample: AES-128/192/256 × msgLen ∈ {0, 4256, 65536} × macLen ∈ {64, 88, 128}); **iteration D3**: TDES rejection (`blockSize !== 16` → DEPRECATED warning per SP 800-131A §2.4) + `truncatedMac/Verify` API that enforces `tagLen ∈ [32, 128]` (SP 800-38B §6.4) — see [cmac.acvp.md](mode/cmac.acvp.md) |
| SP 800-38D | AES-GCM (128/192/256) | [gcm.js](mode/gcm.js) | ✅ | McGrew-Viega §B **TC 1-18 complete** (TC 1-6 AES-128, TC 7-12 AES-192 [D1], TC 13-18 AES-256 [TC 13/14 baseline + TC 15-18 D1] cross-checked against Node libcrypto) + **ACVP-AES-GCM-1.0** (60/60 AFT 100% AES-128); all 3 keyLen × {empty, AAD, multi-block, 96/64/480-bit IV} byte-exact — see [gcm.acvp.md](mode/gcm.acvp.md) |
| SP 800-38D | GMAC | [gcm.js](mode/gcm.js#L212) | ✅ | round-trip vs GCM + **ACVP-AES-GMAC-1.0** (60/60 AFT 100%: AES-128 × ivLen ∈ {96, 120} × aadLen ∈ {0, 120} × tagLen ∈ {32, 128}; decrypt includes 7 `testPassed=false` cases) — see [gcm.acvp.md](mode/gcm.acvp.md) |
| SP 800-38F | KW (RFC 3394) | [kw.js](mode/kw.js) | ✅ | RFC 3394 §4.1-4.6 + **ACVP-AES-KW-1.0** (108/3600 cipher-direction sub-sample: AES-128/192/256 × 6 payloadLen); **iteration D2**: `wrapInverseCipher`/`unwrapInverseCipher` explicit reject (NOT-IMPLEMENTED, SP 800-38F §6.3) + TDES rejection (`blockSize !== 16` → DEPRECATED warning per SP 800-131A §2.4) — see [kw.acvp.md](mode/kw.acvp.md) |
| SP 800-38F | KWP (RFC 5649) | [kw.js](mode/kw.js) | ✅ | RFC 5649 §6 + **ACVP-AES-KWP-1.0** (108/3600 cipher-direction sub-sample 3/group: AES-128/192/256 × 6 payloadLen ∈ {8, 1280, 2152, 2176, 3040, 4096} bits; single-semi-block fast path via payloadLen=8; decrypt includes 10 `testPassed=false` cases rejected by the constant-time IV+length+padding check) — see [kw.acvp.md](mode/kw.acvp.md) |
| SP 800-132 | PBKDF2 (10 PRF families) | [pbkdf2.js](hash/pbkdf2.js) | ✅ | RFC 7914 (HMAC-SHA-256) + **PBKDF-1.0** (25/50 sub-sample: HMAC-SHA-224) + **B4 cross-check Python `hashlib`** (9 families × 5 vectors = 45 vectors: SHA-2-{256,384,512}, SHA-512/{224,256}, SHA-3-{224,256,384,512}); **default count = 600 000** (OWASP 2023), warn if < 100 000 — see [pbkdf2.acvp.md](hash/pbkdf2.acvp.md) |
| SP 800-56C Rev. 2 | HKDF (RFC 5869) | [hkdf.js](hash/hkdf.js) | ✅ | RFC 5869 App. A.1-A.3 + **KDA-HKDF-Sp800-56Cr1** (240 SHA-2 + 180 SHA-3/SHA-512-truncated **B3**) + **KDA-HKDF-Sp800-56Cr2 hybrid single** (40 vectors `IKM=Z‖T` **B3**) + **KDA-HKDF-Sp800-56Cr2 hybrid multi-expansion** (20 vectors / 56 expand iterations **B3**); **10 HMAC families** validated byte-exact — see [hkdf.acvp.md](hash/hkdf.acvp.md) |
| SP 800-90A | CTR_DRBG-AES-256 (no df) | [random.js](utils/random.js) | ✅ | strict §10.2 implementation + **KAT power-on** (NIST CAVP `drbgvectors_pr_false` COUNT=0) + **ctrDRBG-1.0** (30/240 sub-sample 100% of the supported variant: tg7 predRes=True + tg15 predRes=False, AES-256 no-df, returnedBitsLen=4096 bits, instantiate→{reSeed\|generate ± predRes-reseed} sequence byte-exact); auto-reseed at 2^32 < 2^48; AES-128/192, TDES, derFunc=true not implemented (P3) — see [random.acvp.md](utils/random.acvp.md) |
| SP 800-90B | RCT + APT (continuous health tests) | [random.js](utils/random.js) | ✅ | RCT (C=4, α=2^-20, H=8) §4.4.1 + APT (W=512, C=13) §4.4.2; state persisted across calls; "dead source" latch §4.5; applied to every buffer drawn from `crypto.getRandomValues` |
| SP 800-90C | RBG construction | [random.js](utils/random.js) | ⚠️ | entropy source = `crypto.getRandomValues` (validated OS NRBG); CTR_DRBG df not implemented (no-df only — full-entropy source assumed); KAT power-on against the official NIST CAVP vector (see SP 800-90A row) — FIPS 140-3 validation remains the responsibility of a CMVP lab |

## Complementary RFCs (interop / outside NIST)

| Standard | Algorithm | Module | Status | Vectors |
|---|---|---|---|---|
| RFC 7748 | X25519 | [x25519.js](pkc/x25519.js) | ⚠️ | RFC 7748 §5.2 (test vectors 1+2 + iterative 1/1000 + 1M under CRYPTO_FULL) + §5 clamping/MSB-mask + §6.1 ECDH + low-order u (u=0/1/p-1 → 0) + DH symmetry stress — see [x25519.acvp.md](pkc/x25519.acvp.md) |
| FIPS 186-5 §7 + RFC 8032 | Ed25519 (PureEdDSA + ph + ctx) | [ed25519.js](pkc/ed25519.js) | ✅ | RFC 8032 §7.1 (1-3) + **ACVP** EDDSA-{KeyGen, KeyVer, SigGen, SigVer}-1.0 pure (3+4+3+5) + **preHash iteration E1** (SigGen 3 sub-samples ph + SigVer 5 ph) + **Ed25519ctx iteration E1** (`signCtx/verifyCtx` round-trip + dom2 binding tests) + **Ed448 explicit reject iteration E2** (`ed25519.ed448.{keyPair,sign,verify,signPh,verifyPh}` returns false + warn NOT-IMPLEMENTED, 6 stubs tested); native Ed448 implementation not implemented (edwards448 curve + SHAKE-256, create a separate ed448.js if required) — see [ed25519.acvp.md](pkc/ed25519.acvp.md) |
| FIPS 186-5 §5.4 + SP 800-56B §6.4 + RFC 8017 | RSA-OAEP / RSA-PSS / RSADP | [rsa.js](pkc/rsa.js) | ✅ | RFC 8017 Ex. 1 + **RSA-DecryptionPrimitive-Sp800-56Br2** (90/90: 3 modulo × 2 keyMode; 66 byte-exact `pt` + 24 domain-check) + **RSA-SigVer-FIPS186-4** (36/72 PSS-SHA224 sub-sample); **CRT** auto-enabled; OAEP decrypt constant-time (anti-Manger) + **RSA blinding Chaum/Pollard iteration F1** (anti-timing, enabled by default on `_rsadp`; `c → c · r^e mod n` then `m → m · r^-1`; covers Boneh-Brumley 2003; opt-out via `_internal.rsadp(p, c, {blinding:false})`); PKCS#1 v1.5 and PSS-SHA3/SHAKE not implemented (P3) — see [rsa.acvp.md](pkc/rsa.acvp.md) |
| RFC 5915 | EC private key (PKCS#8 / SEC1) | [keyformat.js](utils/keyformat.js) | ⚠️ | round-trip P-256/384/521 |
| RFC 8410 | Ed25519/X25519 PKCS#8 + SPKI | [keyformat.js](utils/keyformat.js) | ⚠️ | RFC 8410 §10.1/§10.3 |
| RFC 8439 | ChaCha20 | [chacha20.js](cipher/chacha20.js) | ⚠️ | RFC 8439 §2.3.2 + §2.4.2 + §A.1 (5 KAT block) + §A.2 (3 KAT encrypt) + multi-block/concat + 513-byte involution — see [chacha20.acvp.md](cipher/chacha20.acvp.md) |
| RFC 8439 | Poly1305 | [poly1305.js](hash/poly1305.js) | ⚠️ | RFC 8439 §2.5.2 + §A.3 (11/11 vectors: single/multi-block carry + crossing 2¹³⁰ + degenerate r=0/s=0) + verify CT (16 XOR mutations rejected) + edge cases (empty/1-byte/16-byte boundary) — see [poly1305.acvp.md](hash/poly1305.acvp.md) |
| RFC 8439 | ChaCha20-Poly1305 AEAD | [chacha20poly1305.js](mode/chacha20poly1305.js) | ⚠️ | RFC 8439 §2.6.2 (polyKey derivation) + §2.8.2 (AEAD encrypt+decrypt KAT) + §A.5 (decrypt fixture) + exhaustive tampering (ct/tag/aad per-byte + nonce + length-encoding) + counter binding (counter=0 polyKey vs counter=1 keystream) — see [chacha20poly1305.acvp.md](mode/chacha20poly1305.acvp.md) |
| RFC 7693 | BLAKE2b | [blake2b.js](hash/blake2b.js) | ⚠️ | RFC 7693 §A ("abc") + empty 256/512 + **§E official self-test** (48 sub-tests: 4 outLens × 6 inLens × keyed/unkeyed → final hash byte-exact `c23a7800...7bccd475`) + length binding (256 ≠ truncate 512) + salt/person domain separation + streaming at 3 granularities + digest idempotence — see [blake2b.acvp.md](hash/blake2b.acvp.md) |
| RFC 9106 | Argon2id | [argon2.js](hash/argon2.js) | ✅ | RFC 9106 §5.3 byte-exact (t=3, m=32, p=4, full P/S/K/X) + 8 bindings (P/S/K/X/t/m/p/τ each changes the tag) + parametric τ no-truncation + memory clamp 8·p + `_Hp` multi-block (outLen 100/200/1024) + 6 negative validations; Argon2d/Argon2i out of scope (P3, RFC §4 mandates Argon2id) — see [argon2.acvp.md](hash/argon2.acvp.md) |
| X.690 | ASN.1 DER | [asn1.js](utils/asn1.js) | ⚠️ | round-trip |
| RFC 7468 | PEM | [pem.js](utils/pem.js) | ⚠️ | round-trip |
| RFC 4122 + RFC 9562 | UUID v1 (time-based) + v4 (random) | [uuid.js](utils/uuid.js) | ⚠️ | RFC 9562 §A.4-style byte-exact (deterministic prng) + bit-mask version + variant + canonical format with dashes (`format='rfc4122'`) + cross-check 100 samples vs `valid.js:uuid` regex; v3/v5/v6/v7/v8 not implemented (P3) — see [uuid.acvp.md](utils/uuid.acvp.md) |
| KeePass v1 / KDBX 3.x | AES-DF | [adf.js](hash/adf.js) | ⚠️ | Format-spec interop (neither RFC nor NIST) — exhaustive bindings (M/T/C/R) + channel independence (T-only ≠ tail vs M-only = tail) + rounds=0 semantics + invariant `fn = SHA256 ∘ partial` + 3 byte-exact regression KAT (algorithmic canary); underlying SHA-256 + AES-256-ECB primitives ACVP-validated — see [adf.acvp.md](hash/adf.acvp.md) |

---

## Operational vigilance points

1. **Entropy source** — `random.js` exclusively uses `crypto.getRandomValues`.
   `Math.random` and `crypto.randomUUID` are blocked by [sanity/base.js](../sanity/base.js).
2. **Constant-time comparisons** — `bitArray.equal`, `cmac.verify`,
   `gcm.decrypt`, `chacha20poly1305.decrypt`, `poly1305.verify`,
   `ed25519.verify` (accumulated XOR), `hmac.verify`, `rsa.oaepDecrypt`
   (separator scanned with no early-exit, anti-Manger), `kw.unwrapPad`
   (accumulated IV/length/padding validation), `ml_kem.decapsulate`
   (final Khat/Kbar selection via mask) — all security-critical
   comparisons are short-circuit-free.
3. **Authentication failure** — the AEAD modes (`gcm`, `chacha20poly1305`,
   `kw`) **never** release the plaintext on an invalid tag:
   they return `false` after `console.error('CORRUPT:')`.
6. **GCM — nonce reuse** — reusing an IV for two distinct
   encryptions under the same key is **catastrophic** (loss of
   the GHASH authentication key + XOR leak of the plaintexts). The
   `gcm.encrypt` API documents this risk and `gcm.nonceTracker(prf)` provides
   an in-process safeguard (Set of seen IVs) refusing any duplicate.
7. **ECDSA — deterministic k** — `ecdsa.sign` produces `k` via RFC 6979
   (HMAC-DRBG) by default, eliminating any risk of key leakage through
   reuse/bias of `k`. Random mode opt-in via
   `sign(msg, { deterministic:false })`.
8. **PBKDF2 — iterations** — default raised to 600 000 (OWASP 2023). Any
   call with a `count` < 100 000 emits `WEAK:` to the console.
4. **No exception thrown** — by convention, every cryptographic error
   logs via `console.warn`/`console.error` then returns `false`.
5. **Worker serialization** — every `factory()` is pure and
   `factory.toString()` remains valid for transport to a Worker.

---

## Security by default (Iteration I2)

Module policy: **fail-closed** on every deprecated, unimplemented,
or intrinsically unsafe path. Rather than silently offering
obsolete primitives (which would end up being adopted by default),
the module **explicitly refuses** via `console.warn(...)` + `return false`.
Warnings are typed: `DEPRECATED`, `UNSAFE`, `NOT-IMPLEMENTED`,
`LIMIT-EXCEEDED`, `WEAK`, `CORRUPT`, `INVALID`, `BUG`.

### Explicitly rejected algorithms (`return false` + typed warning)

| Family | Export | Type | Justification |
|---|---|---|---|
| RSA | `pkcs1v15Sign` / `pkcs1v15Verify` | `DEPRECATED` | SP 800-131A Rev.2 Table 5 (Nov. 2019) — deprecates v1.5 sign |
| RSA | `pkcs1v15Encrypt` / `pkcs1v15Decrypt` | `DEPRECATED|UNSAFE` | Bleichenbacher 2006 padding oracle |
| Argon2 | `hashD` (Argon2d) | `UNSAFE` | RFC 9106 §4 — vulnerable to cache-timing (data-dependent addressing) |
| Argon2 | `hashI` (Argon2i) | `DEPRECATED` | Alwen-Blocki 2016 — reduced GPU/ASIC resistance |
| ChaCha20 | `xchacha20()` | `NOT-IMPLEMENTED` | Draft-irtf-cfrg-xchacha not finalized; specialized use (libsodium) |
| KW | `wrapInverseCipher` / `unwrapInverseCipher` | `NOT-IMPLEMENTED` | SP 800-38F §6.3 inverse-cipher out of scope (rare TPM usage) |
| HMAC-SHA-1 | (not exposed) | — | SP 800-131A §5 — not implemented; factory does not expose `sha1` |
| MD-5 | (not exposed) | — | SP 800-131A §5 — not implemented |
| Ed448 | (not exposed) | — | out of scope — separate module required (SHAKE-256 + edwards448 curve); documented in `ed25519.acvp.md` |

### Active runtime guards (malformed or out-of-spec inputs)

| Module | Guard | Type | Justification |
|---|---|---|---|
| `cipher/chacha20.js` | Counter overflow > 2³² blocks | `LIMIT-EXCEEDED` | RFC 8439 §2.3 — silent counter wrap would reuse the keystream |
| `pkc/ecc.js` | `_coordsInRange(bits, curve)` (x/y < p) | `INVALID` | FIPS 186-5 §A.4 — point outside the field of definition |
| `pkc/ecc.js` | `_isInSubgroup(point, curve)` | `INVALID` | FIPS 186-5 §A.4.2 / SP 800-56A §5.6.2.3.3 — public key outside the main subgroup |
| `mode/cmac.js` | `prf.blockSize !== 16` | `DEPRECATED` | SP 800-131A §2.4 — TDES deprecated, SP 800-38B §5.1 requires AES |
| `mode/kw.js` | `prf.blockSize !== 16` | `DEPRECATED` | SP 800-131A §2.4 + SP 800-38F §6.2 |
| `mode/cmac.js` | `tagLen < 32 bits` | `WEAK` | SP 800-38B §6.4 recommended minimum |
| `mode/gcm.js` | `gcm.nonceTracker(prf)` (opt-in) | `CORRUPT` | refuses in-process IV reuse (`Set` of seen nonces) |
| `mode/chacha20poly1305.js` | `nonceTracker(key)` (opt-in) | `CORRUPT` | same as GCM; Poly1305 does not cryptographically detect reuse |
| `pkc/x25519.js` | `isLowOrderPoint(u)` (opt-in helper) | — | RFC 7748 §6.1 — 7 documented LOPs, constant-time comparison |
| `pkc/rsa.js` | `_rsadp` blinding Chaum/Pollard (default true) | — | Boneh-Brumley 2003 anti-timing ; opt-out `_internal.rsadp(p, c, {blinding:false})` |
| `cipher/aes.js` | `fn(key)` constant-time **by default**; T-table opt-in via `ttable.fn(key)` | — | constant-time-by-default masked-lookup S-box, anti-cache-timing (Bernstein 2005); fast T-table reserved for trusted hosts |
| `hash/argon2.js` | salt < 8 bytes | `INVALID` | RFC 9106 §3.1 — salt minimum |
| `hash/pbkdf2.js` | `count < 100 000` | `WEAK` | OWASP 2023 |
| `utils/random.js` | RCT + APT continuous health-tests SP 800-90B | `CORRUPT` | latched-dead flag stops all generation if entropy is suspect |
| `mode/{kw,cmac,gcm}` | tag mismatch | `CORRUPT` | no plaintext release; AEAD authentication |

### `CRYPTO_FULL` policy

The `process.env.CRYPTO_FULL === '1'` flag unlocks the high-cost
test vectors. Default suite < 200 s; `CRYPTO_FULL` suite ~5-10 min
depending on the machine.

| Module | Tests gated behind `CRYPTO_FULL=1` |
|---|---|
| `hash/sha224.test.js` | LDT 1 GiB (ACVP-SHA2-224-1.0 tcId=514) |
| `hash/sha256.test.js` | LDT 1 GiB (ACVP-SHA2-256-1.0 tcId=514) |
| `hash/sha384.test.js` | LDT 1 GiB (ACVP-SHA2-384-1.0 tcId=1026) |
| `hash/sha512.test.js` | LDT 1 GiB (ACVP-SHA2-512-1.0 tcId=1027) |
| `hash/sha512_224.test.js` | LDT 1 GiB (ACVP-SHA2-512-224-1.0 tcId=1028) — **gap-fix audit post-upgrade** |
| `hash/sha512_256.test.js` | LDT 1 GiB (ACVP-SHA2-512-256-1.0 tcId=1026) — **gap-fix audit post-upgrade** |
| `pkc/ml_kem.test.js` | Full ACVP: 75/75 keyGen + 165/165 encapDecap (~0.5 s) |
| `pkc/ml_dsa.test.js` | Full ACVP: 75/75 keyGen + 45/45 sigVer ext+pure + 90/90 sigGen ext+pure (~4 s) |
| `pkc/slh_dsa.test.js` | Full ACVP: 120/120 keyGen + 180 sigVer ext+pure full (~135 s) |
| `utils/random.test.js` | Full ACVP: 5 CTR_DRBG modes (AES-128/192/256 × df) full predRes=false (~100 ms) |
| `pkc/x25519.test.js` | RFC 7748 §5.2 1 000 000 iterations (~10 min, outside the current `CRYPTO_FULL` — prepared) |

**Deliberately not wired**:

*Special cases (prohibitive cost vs. value)*:
- **SLH-DSA sigGen full (624 vectors)** — signing costs minutes/op for the
  `s` variants, estimated total in hours. Sub-sample E4 validates the path.
- **LDT SHA-2 ≥ 2 GiB** (tcId 515-517 and 384/512 equivalents) — extra
  cost with no additional information vs 1 GiB (64-bit counter already validated).

*Frozen ACVP sub-samples (no "full" mode even under `CRYPTO_FULL`)* — the
sub-sampling strategy captures the systematic patterns of each ACVP
suite (anchors `min/max(len)` + representatives for each structural bucket
GFSbox/KeySbox/VarKey/VarTxt/etc.); extending to full would mostly add
non-pathological intermediate lengths/positions with no cryptographic
coverage gain:

- **`cipher/aes`**: 254/2138 AFT — full small groups (GFSbox/
  KeySbox/VarKey/VarTxt 217 vectors) + 3 tcId [first/mid/last] over the
  12 large structural groups (37 vectors) + full variable-message
  buckets (tg 25-30). Full cost ~10× × **2 paths**
  (CT default `api.fn` + T-table `api.ttable.fn`) → ~3-5 min under CRYPTO_FULL.
- **`mode/cbc`**: 144/2156 AFT — 12 testGroups × 12 AFT [encrypt+decrypt]
  + full multi-block buckets. MCT 6/6 already full. Full cost ~15×.
- **`mode/ctr`**: 78/150 AFT — 6 testGroups × 13 AFT [encrypt+decrypt],
  non-byte/non-block-aligned payloadLen retained in full. Cost ~2×.
- **`mode/cmac`**: 189/756 — 3 keyLen × 9 macLen × 7 msgLen sub-sampled
  via anchors. Full cost ~5×.
- **`mode/kw` + `mode/kwp`**: 108/3600 each (3% coverage) —
  payloadLen sub-sample [first/mid/last]. Full cost ~33× each
  (~5 min cumulative).
- **`mode/gcm`**: ACVP-AES-GCM-1.0 = 60/60 AFT **full** on AES-128 (already
  wired); AES-192/256 covered via McGrew-Viega TC 7-18 byte-exact
  (cross-checked against OpenSSL). No residual sub-sample to activate.
- **`hash/hmac`**: 35/150 AFT × 10 HMAC families (SHA-2 + SHA-3 +
  SHA-512-truncated) = 350/1500. Structural sub-sample by
  keyLen/msgLen/macLen. Full cost ~4× per family.
- **`hash/hkdf`**: Cr1 sub-sample over 10 HMAC families (240+180 vectors).
  Cr2 hybrid single + multi-expansion **already full** (40 + 20). Full
  Cr1 cost ~3× (same algorithms, other lengths).
- **`hash/pbkdf2`**: 25/50 SHA-224 ACVP (only published family) + 45
  cross-check Python `hashlib` over 9 HMAC families. Cryptographic
  coverage already broad via cross-check.
- **`hash/sha3`**: 110/600+ AFT per variant. MCT already **100/100
  byte-exact full** (Iteration H2). Full AFT would only add intermediate
  lengths.
- **`hash/sha2*` (224/256/384/512/512_224/512_256)**: 24-73 / 146-1024
  AFT per variant (regular-stride sub-sample + min/max anchors). LDT
  1 GiB already gated behind CRYPTO_FULL. MCT 1/1 byte-exact (100×1000) already full.
- **`pkc/ecc`**: KeyVer 12/12 **full**; SigVer 8 sub-sample, DetECDSA
  16 (RFC 6979). Full SigVer = ~50×: covers other triplets
  (curve, hash, msg) with no specific gain.
- **`pkc/rsa`**: RSA-DecryptionPrimitive 90/90 **full** + PSS-SigVer
  36/72 SHA-224 sub-sample. Full PSS-SigVer = ~2× over the same family.
- **`pkc/ed25519`**: EDDSA-{KeyGen 3, KeyVer 4, SigGen 3, SigVer 5} +
  preHash {SigGen 3, SigVer 5} sub-samples per category (mix
  valid/invalid). Full = ~3-5× per category.
- **`utils/rsaKeygen`**: 15/15 **full**.

Enabling full coverage of all this under `CRYPTO_FULL=1` is
technically feasible (follow the H3 PQC pattern: synchronous `readFileSync`
of the ACVP JSON) but would not yield any new cryptographic
discovery for an estimated CI cost of +10-20 min.

### Typed warning index

The warning types emitted by the module follow a strict convention
(grep-friendly for audit / CI logs):

- `DEPRECATED` — algorithm deprecated by NIST/IETF, to be replaced.
- `UNSAFE` — known vulnerability, do not use.
- `NOT-IMPLEMENTED` — deliberately unwired path (redirect to a
  documented alternative).
- `LIMIT-EXCEEDED` — intrinsic limit reached (counter overflow,
  message > 2⁶⁴ bits, etc.).
- `WEAK` — parameter below the recommended minimum (tagLen < 32,
  PBKDF2 iter < 100k, etc.).
- `INVALID` — malformed input (size, structure, range).
- `CORRUPT` — runtime tampering detection (tag mismatch, RCT
  fail, nonce reuse).
- `BUG` — internal inconsistency (should not happen, signals an
  invocation bug).
- `NOT READY` — expected state not initialized (DRBG not instantiated).
