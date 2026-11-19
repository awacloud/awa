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
// Returns: { ecdsa, elGamal, curves, curveName, deserialize, basicKey, curve, point, pointJac }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `curves` | `{c192, c224, c256, c384, c521, k192, k224, k256}` | The registered curves: P-192 … P-521 and secp192k1 / secp224k1 / secp256k1 |
| `curveName(curve)` | `(curve) => string \| false` | The registry key of a curve instance (`'c256'`) |
| `ecdsa.generateKeys(curve, paranoia?, sec?)` | `(number \| curve, number?, bn?) => {pub, sec} \| false` | A key pair; a number is a curve size (`256` → `curves.c256`) |
| `ecdsa.secretKey` / `ecdsa.publicKey` | constructors `(curve, exponent)` / `(curve, point)` | Key objects (prefer `generateKeys` / `deserialize`) |
| `sec.sign(hash, opts?)` | `(bitArray, {strict?, hashForK?, deterministic?}) => bitArray` | `r ‖ s` (deterministic RFC 6979 by default) |
| `pub.verify(hash, rs, opts?)` | `(bitArray, bitArray, {strict?, fakeLegacyVersion?}) => boolean` | `true`, or `false` on any invalid input |
| `elGamal.generateKeys(curve, paranoia?, sec?)` | as `ecdsa` | ECDH key pair: `sec.dh(pub)`, `pub.kem()` → `{key, tag}`, `sec.unkem(tag)` |
| `deserialize(key)` | `({type: 'ecdsa'\|'elGamal', curve, point \| exponent, secretKey?}) => key \| false` | A public key (subgroup-checked) or a secret key; `point` is the hex of `x ‖ y`, `exponent` hex, `curve` a `curves` key |
| `basicKey`, `curve`, `point`, `pointJac` | constructors | The low-level key, curve and point classes the keys are built on |

### Options

- **`strict: true`** (sign / verify): canonicalises low-s + rejects `s > n/2` (SP 800-131A "NIST strict").
- **`hashForK: hashMod`** (sign): explicitly sets the hash for K derivation (RFC 6979 strict: H_K = H_msg).
- **`deterministic: false`** (sign): reverts to random k (NOT RECOMMENDED).

## Examples

### Sign + verify P-256 / SHA-256

```js
const { ecc, sha256 } = fw.runtime.resolveAll(['ecc', 'sha256']);

const { pub, sec } = ecc.ecdsa.generateKeys(256);

const hashBa = sha256.hash('message');
const sig = sec.sign(hashBa);                    // deterministic RFC 6979
const ok  = pub.verify(hashBa, sig);             // true

// Strict mode (low-s)
const sigStrict = sec.sign(hashBa, { strict: true });
const okStrict  = pub.verify(hashBa, sigStrict, { strict: true });
```

### Subgroup check (deserialize)

```js
const pk = ecc.deserialize({ type: 'ecdsa', curve: 'c256', point: hexPoint });   // false if the point is outside the subgroup
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const sk = libs.ecc.deserialize({ type: 'ecdsa', secretKey: true, curve: 'c256', exponent: args[0] });
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
- **K-curves (Koblitz)**: k192, k224 and k256 (secp192k1 / secp224k1 / secp256k1) — prefer the P-curves.

## See also

- [bn](../utils/bn.md), [hmac](../hash/hmac.md) — underlying primitives
- [ed25519](./ed25519.md) — faster EdDSA alternative
- [Conformance ecc.acvp.md](../../../../src/crypto/pkc/ecc.acvp.md)
