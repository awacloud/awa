---
module: keyformat
category: crypto/utils
dependencies: [asn1, pem, bitArray]
returns: object
worker-safe: true
status: complete
---

# keyformat

> EC / Ed25519 / X25519 key serialisation — PKCS#8 (PrivateKeyInfo) + SPKI + SEC1 (RFC 5915 / RFC 8410).

**Module** `keyformat` | **Source** `packages/front/fw/src/crypto/utils/keyformat.js` | **Deps** `asn1`, `pem`, `bitArray` | **Worker-safe** yes

Round-trip for ECDSA (P-256/384/521), Ed25519, X25519 keys. Pivot format for interop with OpenSSL / WebCrypto / Node. RSA is not handled here (the `rsaKeygen` module returns `{n,e,d,p,q,dp,dq,qInv}` directly as Uint8Array).

## Resolve

```js
const keyformat = runtime.resolve('keyformat');
// Returns: {
//   OID,
//   encodePkcs8Edwards, decodePkcs8Edwards,
//   encodeSpkiEdwards,  decodeSpkiEdwards,
//   encodeSec1,         decodeSec1,
//   encodePkcs8Ec,      decodePkcs8Ec,
//   encodeSpkiEc,       decodeSpkiEc
// }
```

## API

| Method | Family | Standard |
|--------|--------|----------|
| `encodePkcs8Edwards` / `decodePkcs8Edwards` | Ed25519 / X25519 — private key | RFC 8410 §7 |
| `encodeSpkiEdwards` / `decodeSpkiEdwards`   | Ed25519 / X25519 — public key | RFC 8410 §4 |
| `encodeSec1` / `decodeSec1`                 | EC (P-256/384/521) — raw `ECPrivateKey` | RFC 5915 |
| `encodePkcs8Ec` / `decodePkcs8Ec`           | EC — PKCS#8 private key (wraps SEC1) | RFC 5208 + RFC 5915 |
| `encodeSpkiEc` / `decodeSpkiEc`             | EC — SPKI public key | RFC 5480 |
| `OID`                                       | OID constants (curves, algos) | — |

## Examples

```js
const { keyformat, pem } = fw.runtime.resolveAll(['keyformat', 'pem']);

// Ed25519 → DER PKCS#8 → PEM
const skBytes = keyformat.encodePkcs8Edwards({ oid: keyformat.OID.Ed25519, seed: secretKey });
const skPem = pem.encode(skBytes, 'PRIVATE KEY');

// PEM → Ed25519 (seed + optional publicKey)
const back = keyformat.decodePkcs8Edwards(pem.decode(skPem));
// → { oid, seed, publicKey? }
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.keyformat.encodeSec1(args[0]));
    },
    { dependencies: ['keyformat'], args: [{ curveOid, d, publicKey }] }
);
```

## Notes

- **Round-trip only**: no cryptographic key validation (e.g. point-on-curve check). Use `ecc.deserialize` after decode for subgroup check.
- **OpenSSL compatibility** verified for Edwards (Ed25519/X25519) and EC.
- **JWK** not supported (use an external converter if required).
- **RSA**: not handled in this module — `rsaKeygen` returns the structure (`n, e, d, p, q, dp, dq, qInv`) directly; RSA PKCS#8/SPKI serialisation must be implemented separately if required.

## See also

- [asn1](./asn1.md), [pem](./pem.md) — underlying primitives
- [ecc](../pkc/ecc.md), [ed25519](../pkc/ed25519.md), [x25519](../pkc/x25519.md) — consumers
