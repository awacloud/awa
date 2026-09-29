---
module: webcryptoRsa
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoRsa

> WebCrypto-backed RSA — OAEP encrypt/decrypt, PSS & PKCS1 sign/verify over `crypto.subtle`.

**Module** `webcryptoRsa` | **Source** `packages/front/fw/src/crypto/webcrypto/rsa.js` | **Deps** none | **Worker-safe** yes

Scheme-parameterized async RSA over native `CryptoKey` / `CryptoKeyPair`. Three
schemes, mapped to their WebCrypto algorithm names:

| Scheme | Algorithm | Operations |
|--------|-----------|------------|
| `OAEP` | `RSA-OAEP` | `encrypt` / `decrypt` |
| `PSS` | `RSA-PSS` | `sign` / `verify` |
| `PKCS1` | `RSASSA-PKCS1-v1_5` | `sign` / `verify` (legacy) |

Opt-in alternative to the pure-JS `rsa` + `rsaKeygen` modules. Every method
resolves to a result or `false` — it never rejects.

## Resolve

```js
const webcryptoRsa = runtime.resolve('webcryptoRsa');
// Returns: { isAvailable, generateKey, encrypt, decrypt, sign, verify, importKey, exportKey }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `generateKey` | `(scheme, modulusBits?, hash?, extractable?) => Promise<CryptoKeyPair\|false>` | RSA keypair for `scheme` |
| `encrypt` | `(publicKey: CryptoKey, data: Uint8Array, label?: Uint8Array) => Promise<Uint8Array\|false>` | RSA-OAEP ciphertext (OAEP keys only) |
| `decrypt` | `(privateKey: CryptoKey, ct: Uint8Array, label?: Uint8Array) => Promise<Uint8Array\|false>` | RSA-OAEP plaintext (OAEP keys only) |
| `sign` | `(privateKey: CryptoKey, data: Uint8Array, saltLengthBytes?: number) => Promise<Uint8Array\|false>` | PSS/PKCS1 signature, dispatched by key |
| `verify` | `(publicKey: CryptoKey, signature: Uint8Array, data: Uint8Array, saltLengthBytes?: number) => Promise<boolean>` | PSS/PKCS1 verify, dispatched by key |
| `importKey` | `(format: 'spki'\|'pkcs8'\|'jwk', keyData: Uint8Array\|object, scheme, hash, usages: string[], extractable?) => Promise<CryptoKey\|false>` | Import a DER/JWK key |
| `exportKey` | `(format: 'spki'\|'pkcs8'\|'jwk', key: CryptoKey) => Promise<Uint8Array\|object\|false>` | Export a key (DER → `Uint8Array`, JWK → object) |

**Defaults**: `modulusBits = 2048` (also `3072`, `4096`), `hash = 'SHA-256'`
(also `'SHA-384'`, `'SHA-512'`, `'SHA-1'`), `extractable = true` for
`generateKey`. Public exponent is fixed at 65537. `importKey` `extractable`
defaults to `true` for `spki` and `false` otherwise.

**PSS salt length**: `sign`/`verify` default `saltLength` to the hash output
size in bytes (32 for SHA-256); override with `saltLengthBytes`. The same value
must be used on both sides.

**Usages**: `generateKey` sets `['encrypt','decrypt']` for OAEP and
`['sign','verify']` for PSS/PKCS1. For `importKey` you pass the `usages`
explicitly (e.g. `['verify']` for an SPKI public key).

All methods resolve to a result or `false`; they never reject. Cross-scheme
misuse (encrypt with a PSS key, sign with an OAEP key) logs `[crypto] INVALID`
and resolves `false`.

## Examples

### Generate a keypair and OAEP round-trip

```js
const { publicKey, privateKey } = await webcryptoRsa.generateKey('OAEP', 2048, 'SHA-256');
const data = new TextEncoder().encode('secret message');
const ct = await webcryptoRsa.encrypt(publicKey, data);          // Uint8Array
const pt = await webcryptoRsa.decrypt(privateKey, ct);           // Uint8Array
new TextDecoder().decode(pt); // 'secret message'
```

### OAEP with a label

```js
const label = new TextEncoder().encode('ctx-v1');
const ct = await webcryptoRsa.encrypt(publicKey, data, label);
const pt = await webcryptoRsa.decrypt(privateKey, ct, label);    // must match on both sides
```

### PSS sign / verify

```js
const { publicKey, privateKey } = await webcryptoRsa.generateKey('PSS', 2048, 'SHA-256');
const data = new TextEncoder().encode('payload');
const sig = await webcryptoRsa.sign(privateKey, data);           // Uint8Array
const ok  = await webcryptoRsa.verify(publicKey, sig, data);     // true
```

### Import an SPKI public key, then verify

```js
const spki = await webcryptoRsa.exportKey('spki', publicKey);    // Uint8Array (DER)
const pub  = await webcryptoRsa.importKey('spki', spki, 'PSS', 'SHA-256', ['verify']);
const ok   = await webcryptoRsa.verify(pub, sig, data);          // true
```

### PKCS1 (legacy interop only)

```js
const { publicKey, privateKey } = await webcryptoRsa.generateKey('PKCS1', 2048, 'SHA-256');
// Emits: [crypto] DEPRECATED: RSASSA-PKCS1-v1_5; prefer RSA-PSS
const sig = await webcryptoRsa.sign(privateKey, data);
const ok  = await webcryptoRsa.verify(publicKey, sig, data);
```

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const { publicKey, privateKey } = await libs.webcryptoRsa.generateKey('PSS', 2048);
        const data = new TextEncoder().encode(args[0]);
        const sig = await libs.webcryptoRsa.sign(privateKey, data);
        self.postMessage(await libs.webcryptoRsa.verify(publicKey, sig, data));
    },
    { dependencies: ['webcryptoRsa'], args: ['payload'] }
);
```

## Notes

- **Schemes**: WebCrypto exposes exactly RSA-OAEP, RSA-PSS, and
  RSASSA-PKCS1-v1_5. **PKCS1-v1_5 encryption is not supported** (insecure and
  absent from the spec) — use OAEP for encryption.
- **PKCS1 signatures are legacy**: `sign`/`verify` on a PKCS1 key (and
  `generateKey('PKCS1', …)`) emit `console.warn('[crypto] DEPRECATED:
  RSASSA-PKCS1-v1_5; prefer RSA-PSS')`. Prefer RSA-PSS for new protocols.
- **Cross-scheme misuse is rejected**: every operation guards
  `key.algorithm.name`; using a key with the wrong scheme logs `[crypto]
  INVALID` and resolves `false`.
- **Import/export is DER or JWK only**: `spki` (public) / `pkcs8` (private)
  return/accept `Uint8Array`; `jwk` returns/accepts a plain object. For PEM use
  the pure-JS `pem` module to wrap/unwrap the DER bytes.
- **No-throw contract**: all methods catch `crypto.subtle` rejections and
  resolve `false`; callers never need a `try/catch`.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; this module has
  no DOM dependency and no main-thread closures. RSA keygen at 2048+ bits is
  CPU-bound — running it in a worker keeps the main thread responsive.

## See also

- [../pkc/rsa.md](../pkc/rsa.md) — pure-JS RSA, the default (bitArray I/O, PEM-aware)
- [../utils/rsaKeygen.md](../utils/rsaKeygen.md) — pure-JS RSA key generation
- [digest.md](./digest.md), [hmac.md](./hmac.md) — sibling WebCrypto modules
