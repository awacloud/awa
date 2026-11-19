---
module: keyformat
category: crypto/utils
dependencies: [asn1]
returns: object
worker-safe: true
status: complete
---

# keyformat

> RSA / EC / Ed25519 / X25519 key serialisation — PKCS#8, SPKI, SEC1, PKCS#1 (RFC 5915 / 8410 / 8017).

**Module** `keyformat` | **Source** `packages/front/fw/src/crypto/utils/keyformat.js` | **Deps** `asn1` | **Worker-safe** yes

Round-trip for RSA, ECDSA (P-256/384/521), Ed25519 and X25519 keys. Pivot format for interop with OpenSSL / WebCrypto / Node. RSA keys use the shapes [`rsaKeygen`](./rsaKeygen.md) returns and [`rsa`](../pkc/rsa.md) takes: `{ n, e }` and `{ n, e, d, p, q, dp, dq, qInv }`, unsigned big-endian `Uint8Array`s.

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
| `encodeRsaPublicKey` / `decodeRsaPublicKey` | RSA — PKCS#1 `RSAPublicKey` (`{ n, e }`) | RFC 8017 A.1.1 |
| `encodeRsaPrivateKey` / `decodeRsaPrivateKey` | RSA — PKCS#1 `RSAPrivateKey`, two-prime (version 0) | RFC 8017 A.1.2 |
| `encodeSpkiRsa` / `decodeSpkiRsa`           | RSA — SPKI public key (rsaEncryption, NULL parameters) | RFC 3279 §2.3.1 |
| `encodePkcs8Rsa` / `decodePkcs8Rsa`         | RSA — PKCS#8 private key (wraps PKCS#1) | RFC 5208 + RFC 8017 |
| `OID`                                       | OID constants (curves, algos) | — |

## Examples

```js
const { keyformat, pem, rsaKeygen } = fw.runtime.resolveAll(['keyformat', 'pem', 'rsaKeygen']);

// Ed25519: 32-byte seed → DER PKCS#8 → PEM
const skPem = pem.encode(keyformat.encodePkcs8Edwards(keyformat.OID.ED25519, seed), 'PRIVATE KEY');

// PEM → Ed25519
const back = keyformat.decodePkcs8Edwards(pem.decode(skPem, 'PRIVATE KEY').bytes);
// → { oid: '1.3.101.112', seed }

// RSA: key pair → SPKI / PKCS#8 PEM, which OpenSSL and node read as is
const { publicKey, privateKey } = rsaKeygen.generate({ bits: 2048 });
const pubPem  = pem.encode(keyformat.encodeSpkiRsa(publicKey), 'PUBLIC KEY');
const privPem = pem.encode(keyformat.encodePkcs8Rsa(privateKey), 'PRIVATE KEY');
const pub = keyformat.decodeSpkiRsa(pem.decode(pubPem, 'PUBLIC KEY').bytes);   // { n, e }
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.keyformat.encodeSec1(args[0], args[1], args[2]));
    },
    { dependencies: ['keyformat'], args: [d, publicKey, curveOid] }   // encodeSec1(d, pub?, curveOid?)
);
```

## Notes

- **Round-trip only**: no cryptographic key validation (e.g. point-on-curve check). Use `ecc.deserialize` after decode for subgroup check.
- **OpenSSL compatibility** verified for Edwards (Ed25519/X25519) and EC; the RSA encodings are byte-identical to node's (`node:crypto` DER export, 2048 and 3072 bits).
- **JWK** not supported (use an external converter if required).
- **RSA decoding is strict**: rsaEncryption with NULL parameters only, a two-prime private key only (a multi-prime version-1 key is refused), no trailing bytes; integers come back unsigned (the DER sign byte dropped). Encoding a private key needs all eight integers.

## See also

- [asn1](./asn1.md), [pem](./pem.md) — underlying primitives
- [ecc](../pkc/ecc.md), [ed25519](../pkc/ed25519.md), [x25519](../pkc/x25519.md) — consumers
