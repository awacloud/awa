---
module: rsa
category: crypto/pkc
dependencies: [bitArray, bn, random]
returns: object
worker-safe: true
status: complete
---

# rsa

> RSA-OAEP + RSA-PSS (FIPS 186-5 §5.4 / RFC 8017) — asymmetric encryption + signatures. PKCS#1 v1.5 explicit reject.

**Module** `rsa` | **Source** `packages/front/fw/src/crypto/pkc/rsa.js` | **Deps** `bitArray`, `bn`, `random` | **Worker-safe** yes

CRT auto-enabled for decrypt/sign (4× speedup). Chaum/Pollard RSA blinding enabled by default (anti-Boneh-Brumley 2003 timing attack).

## Resolve

```js
const rsa = runtime.resolve('rsa');
// Returns: { oaepEncrypt, oaepDecrypt, pssSign, pssVerify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `oaepEncrypt(pub, msg, hashMod?)` | — | Ciphertext bytes |
| `oaepDecrypt(priv, ct, hashMod?)` | — | Plaintext or `false` (constant-time anti-Manger) |
| `pssSign(priv, msg, hashMod?, sLen?, salt?)` | — | Signature |
| `pssVerify(pub, msg, sig, hashMod?, sLen?)` | — | `boolean` |
| `internalOf(rsa).{rsaep, rsadp, mgf1}` | — | Primitives + RSA blinding control |

## Examples

### OAEP-SHA-256

```js
const { rsa, rsaKeygen } = fw.runtime.resolveAll(['rsa', 'rsaKeygen']);

const { publicKey, secretKey } = rsaKeygen.generate(2048);

const msg = new TextEncoder().encode('Hello, RSA!');
const ct  = rsa.oaepEncrypt(publicKey, msg);
const pt  = rsa.oaepDecrypt(secretKey, ct);
new TextDecoder().decode(pt);   // 'Hello, RSA!'
```

### PSS-SHA-256

```js
const sig = rsa.pssSign(secretKey, msg);
const ok  = rsa.pssVerify(publicKey, msg, sig);   // true
```

### Disable blinding (benchmark)

```js
const pt = internalOf(rsa).rsadp(secretKey, ct, { blinding: false });
```

## Worker Usage

```js
// RSA-2048 modexp = ~50ms. Delegate to avoid blocking the UI.
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.rsa.oaepDecrypt(args[0], args[1]));
    },
    { dependencies: ['rsa'], args: [secretKey, ct] }
);
```

## Notes

- **No PKCS #1 v1.5** (signature or encryption): SP 800-131A Rev.2 deprecates v1.5 signatures, and v1.5 encryption carries the Bleichenbacher padding oracle. Use PSS and OAEP.
- **RSA blinding default ON**: opt-out via `internalOf(rsa).rsadp(p, c, {blinding:false})` for benchmarks; covers Boneh-Brumley 2003 anti-timing.
- **OAEP decrypt constant-time** anti-Manger: separator scanned without early-exit.

## See also

- [rsaKeygen](../utils/rsaKeygen.md) — RSA key generation
- [ecc](./ecc.md), [ed25519](./ed25519.md) — faster ECC alternatives
- [Conformance rsa.acvp.md](../../../../src/crypto/pkc/rsa.acvp.md)
