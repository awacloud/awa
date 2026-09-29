---
module: webcryptoEcc
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoEcc

> WebCrypto-backed async ECDSA + ECDH on NIST P-256/384/521 via `crypto.subtle`.

**Module** `webcryptoEcc` | **Source** `packages/front/fw/src/crypto/webcrypto/ecc.js` | **Deps** none | **Worker-safe** yes

Opt-in alternative to the pure-JS `ecc` module, which remains the default. Async, `Uint8Array`/`CryptoKey`/`CryptoKeyPair` I/O. Every method resolves to its result or `false` — never rejects. ECDSA signatures are raw IEEE P1363 `r||s` (not ASN.1/DER). Curve25519 (Ed25519/X25519) and secp256k1 are out of scope.

## Resolve

```js
const webcryptoEcc = runtime.resolve('webcryptoEcc');
// Returns: { isAvailable, generateKey, sign, verify, deriveBits, deriveKey, importKey, exportKey }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `generateKey` | `(kind: 'ECDSA'\|'ECDH', curve?: 'P-256'\|'P-384'\|'P-521', extractable?: boolean) => Promise<CryptoKeyPair\|false>` | Key pair or `false` |
| `sign` | `(privateKey: CryptoKey, data: Uint8Array, hash?: 'SHA-256'\|'SHA-384'\|'SHA-512') => Promise<Uint8Array\|false>` | Raw `r\|\|s` signature or `false` |
| `verify` | `(publicKey: CryptoKey, signature: Uint8Array, data: Uint8Array, hash?: 'SHA-256'\|'SHA-384'\|'SHA-512') => Promise<boolean>` | `true`/`false` |
| `deriveBits` | `(privateKey: CryptoKey, publicKey: CryptoKey, lengthBits: number) => Promise<Uint8Array\|false>` | Shared secret or `false` |
| `deriveKey` | `(privateKey: CryptoKey, publicKey: CryptoKey, derivedKeyAlg: object, usages: string[], extractable?: boolean) => Promise<CryptoKey\|false>` | Derived key or `false` |
| `importKey` | `(format: 'raw'\|'spki'\|'pkcs8'\|'jwk', keyData: Uint8Array\|object, kind: 'ECDSA'\|'ECDH', curve: 'P-256'\|'P-384'\|'P-521', usages: string[], extractable?: boolean) => Promise<CryptoKey\|false>` | `CryptoKey` or `false` |
| `exportKey` | `(format: 'raw'\|'spki'\|'pkcs8'\|'jwk', key: CryptoKey) => Promise<Uint8Array\|object\|false>` | `Uint8Array` (DER/raw), object (jwk), or `false` |

ECDSA hash defaults to `SHA-256`; curve defaults to `P-256`. `generateKey` assigns usages by kind — ECDSA → `['sign','verify']`, ECDH → `['deriveBits','deriveKey']`. `importKey` defaults `extractable` to `false` for `pkcs8` (private keys), `true` otherwise. `'raw'` carries the public point only.

Operations resolve `false` when:
- `crypto.subtle` is unavailable (`[crypto] NOT READY` logged)
- `kind`, `curve`, `hash`, or `format` is invalid (`[crypto] INVALID` logged)
- a key is used with the wrong kind — `sign`/`verify` require an ECDSA key, `deriveBits`/`deriveKey` require an ECDH key (`[crypto] INVALID` logged)
- the underlying `crypto.subtle` call rejects (`[crypto] FAIL` logged)

## Examples

### ECDSA sign and verify

```js
const pair = await webcryptoEcc.generateKey('ECDSA', 'P-256');
const data = new TextEncoder().encode('message');

const sig = await webcryptoEcc.sign(pair.privateKey, data, 'SHA-256');
// sig is a 64-byte Uint8Array (raw r||s) for P-256

const ok = await webcryptoEcc.verify(pair.publicKey, sig, data, 'SHA-256');
// ok === true
```

### ECDH shared secret

```js
const alice = await webcryptoEcc.generateKey('ECDH', 'P-256');
const bob = await webcryptoEcc.generateKey('ECDH', 'P-256');

const secretA = await webcryptoEcc.deriveBits(alice.privateKey, bob.publicKey, 256);
const secretB = await webcryptoEcc.deriveBits(bob.privateKey, alice.publicKey, 256);
// secretA and secretB are equal (Diffie–Hellman agreement)
```

### ECDH into an AES-GCM key

```js
const key = await webcryptoEcc.deriveKey(
    alice.privateKey,
    bob.publicKey,
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt']
);
// key is a usable AES-GCM CryptoKey
```

### Import / export

```js
const rawPub = await webcryptoEcc.exportKey('raw', pair.publicKey);   // Uint8Array
const jwk = await webcryptoEcc.exportKey('jwk', pair.publicKey);      // object

const imported = await webcryptoEcc.importKey('raw', rawPub, 'ECDSA', 'P-256', ['verify']);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        libs.webcryptoEcc.generateKey('ECDSA', 'P-256')
            .then((pair) => libs.webcryptoEcc.sign(
                pair.privateKey,
                new TextEncoder().encode('hi')
            ))
            .then(self.postMessage);
    },
    { dependencies: ['webcryptoEcc'] }
);
```

## Notes

- **Raw signatures**: WebCrypto ECDSA uses the IEEE P1363 fixed-width `r||s` form (64 bytes for P-256, 96 for P-384, 132 for P-521), NOT ASN.1/DER. This module performs no DER transcoding — convert at the call site if a DER consumer requires it.
- **Curves**: only the NIST P-curves WebCrypto supports — P-256, P-384, P-521. secp256k1 is not in WebCrypto; Ed25519/X25519 live in the dedicated `ed25519`/`x25519` modules.
- **Cross-kind safety**: keys are typed by `algorithm.name`. Signing with an ECDH key, or deriving with an ECDSA key, is rejected with `[crypto] INVALID` and resolves `false`.
- **No-throw contract**: every method is `async` and resolves to its result or `false`; `crypto.subtle` rejections are caught and logged, never propagated.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; this module has no DOM dependency and no main-thread closures.

## See also

- [ecc](../pkc/ecc.md) — pure-JS elliptic-curve module, the default
- [ed25519](./ed25519.md) — WebCrypto Ed25519 signatures
- [x25519](./x25519.md) — WebCrypto X25519 key agreement
- [digest](./digest.md) — WebCrypto SHA-1/256/384/512
