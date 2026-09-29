---
module: ecc
category: crypto/pkc
dependencies: [bitArray, hex, bn, sha256, sha384, sha512, hmac]
returns: object
worker-safe: true
status: complete
---

# ecc

> ECDSA (FIPS 186-5 §6) on P-{224,256,384,521} + K-curves. RFC 6979 deterministic by default.

**Module** `ecc` | **Source** `packages/front/fw/src/crypto/pkc/ecc.js` | **Deps** `bitArray`, `hex`, `bn`, `sha256`, `sha384`, `sha512`, `hmac` | **Worker-safe** yes

FIPS 186-5 + RFC 6979 compliant ECDSA (deterministic k via HMAC-DRBG, eliminates leakage from a biased random k). Subgroup check `n·Q == O` active on all `deserialize` calls.

## Resolve

```js
const ecc = runtime.resolve('ecc');
// Returns: { curves, publicKey, secretKey, sign, verify, deserialize, _internal }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `curves` | `{c192, c224, c256, c384, c521, k192, k224, k256, k283, k409, k571}` | Available curves |
| `secretKey(curve, exponent)` | — | `{exponent, publicKey, sign, verify}` |
| `publicKey(curve, point)` | — | `{point, verify}` |
| `sign(hash, opts?)` | `(bitArray, {strict?, hashForK?, deterministic?}) => Object` | `{r, s}` (deterministic by default) |
| `verify(hash, rs, opts?)` | `(bitArray, {r,s}, {strict?, fakeLegacyVersion?}) => boolean` | Constant-time |
| `deserialize(bits, curveName)` | — | Public key (subgroup-checked) |

### Options

- **`strict: true`** (sign / verify): canonicalises low-s + rejects `s > n/2` (SP 800-131A "NIST strict").
- **`hashForK: hashMod`** (sign): explicitly sets the hash for K derivation (RFC 6979 strict: H_K = H_msg).
- **`deterministic: false`** (sign): reverts to random k (NOT RECOMMENDED).

## Examples

### Sign + verify P-256 / SHA-256

```js
const { ecc, sha256 } = fw.runtime.resolveAll(['ecc', 'sha256']);

const sk = ecc.secretKey(ecc.curves.c256);
const pk = sk.publicKey;

const hashBa = sha256.hash('message');
const sig = sk.sign(hashBa);                     // deterministic RFC 6979
const ok  = pk.verify(hashBa, sig);              // true

// Strict mode (low-s)
const sigStrict = sk.sign(hashBa, { strict: true });
const okStrict  = pk.verify(hashBa, sigStrict, { strict: true });
```

### Subgroup check (deserialize)

```js
const pkPoint = ecc.deserialize(rawBytes, 'c256');   // false if point is outside the subgroup
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const sk = libs.ecc.secretKey(libs.ecc.curves.c256, args[0]);
        self.postMessage(sk.sign(args[1]));
    },
    { dependencies: ['ecc'], args: [exponent, hashBa] }
);
```

## Notes

- **Deterministic k RFC 6979**: by default, eliminates any risk of leakage from a reused or biased k.
- **Scalar mult NOT constant-time**: 4-bit windowed method with pre-computed multiple table — the index is the scalar nibble, observable via cache-timing (Bernstein 2005). Acceptable in a browser without a co-resident adversary; for multi-tenant servers prefer WebCrypto `subtle.*` or X25519/Ed25519.
- **Subgroup check FIPS 186-5 §A.4.2**: `deserialize` rejects points outside the subgroup of order `n` (~1-3 ms per P-256).
- **P-521 RFC 6979** byte-exact (fixes the `bn.bitLength() = 528` rounding bug via the `_trueBitLength` helper).
- **K-curves (Koblitz)**: covered (k192, k224, k256, k283, k409, k571) but deprecated by NIST SP 800-186 — prefer P-curves.

## See also

- [bn](../utils/bn.md), [hmac](../hash/hmac.md) — underlying primitives
- [ed25519](./ed25519.md) — faster EdDSA alternative
- [Conformance ecc.acvp.md](../../../../src/crypto/pkc/ecc.acvp.md)
