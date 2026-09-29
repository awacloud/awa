---
module: webcryptoAes
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoAes

> WebCrypto-backed async AES: GCM, CBC, and CTR modes via `crypto.subtle`.

**Module** `webcryptoAes` | **Source** `packages/front/fw/src/crypto/webcrypto/aes.js` | **Deps** none | **Worker-safe** yes

Opt-in alternative to the pure-JS `aes` + `mode/*` modules. Async, `Uint8Array` / `CryptoKey` I/O. Every method resolves to `Uint8Array | CryptoKey | false` — never rejects. Key generation, import, and export are included. AES-KW key-wrapping is in the sibling `webcryptoAesKw` module.

## Resolve

```js
const webcryptoAes = runtime.resolve('webcryptoAes');
// Returns: { isAvailable, generateKey, importKey, exportKey,
//            encryptGcm, decryptGcm, encryptCbc, decryptCbc,
//            encryptCtr, decryptCtr }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `generateKey` | `(mode: 'GCM'\|'CBC'\|'CTR', lengthBits?: 128\|192\|256, extractable?: boolean) => Promise<CryptoKey\|false>` | Fresh key or `false` |
| `importKey` | `(raw: Uint8Array, mode: 'GCM'\|'CBC'\|'CTR', extractable?: boolean) => Promise<CryptoKey\|false>` | Imported key or `false` |
| `exportKey` | `(key: CryptoKey) => Promise<Uint8Array\|false>` | Raw key bytes or `false` |
| `encryptGcm` | `(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array, tagBits?: number) => Promise<Uint8Array\|false>` | `ciphertext \|\| tag` or `false` |
| `decryptGcm` | `(key: CryptoKey, iv: Uint8Array, ctWithTag: Uint8Array, aad?: Uint8Array, tagBits?: number) => Promise<Uint8Array\|false>` | Plaintext or `false` (auth failure or error) |
| `encryptCbc` | `(key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array) => Promise<Uint8Array\|false>` | Ciphertext (PKCS#7 padded) or `false` |
| `decryptCbc` | `(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array) => Promise<Uint8Array\|false>` | Plaintext or `false` |
| `encryptCtr` | `(key: CryptoKey, counter: Uint8Array, counterBits: number, data: Uint8Array) => Promise<Uint8Array\|false>` | Encrypted bytes or `false` |
| `decryptCtr` | `(key: CryptoKey, counter: Uint8Array, counterBits: number, data: Uint8Array) => Promise<Uint8Array\|false>` | Decrypted bytes or `false` |

**Defaults**: `lengthBits` = 256, `extractable` for `generateKey` = `true`, `extractable` for `importKey` = `false`, `tagBits` = 128.

**IV / counter length requirements**:
- GCM: any length; 12 bytes (96-bit) strongly recommended (NIST SP 800-38D §8.2).
- CBC: exactly 16 bytes.
- CTR: exactly 16 bytes; `counterBits` typically 64.

**Validation errors** log `[crypto] INVALID: webcryptoAes: <reason>` and resolve `false`:
- Unknown mode (not `GCM`, `CBC`, or `CTR`).
- `raw.length` not in `{16, 24, 32}` for `importKey`.
- Wrong IV / counter byte-length for CBC / CTR.
- Non-`Uint8Array` where a `Uint8Array` is required.

## Examples

### AES-GCM encrypt / decrypt

```js
const enc = (s) => new TextEncoder().encode(s);

const key = await webcryptoAes.generateKey('GCM');          // AES-256-GCM
const iv  = crypto.getRandomValues(new Uint8Array(12));     // 12-byte random IV
const aad = enc('authenticated metadata');

const ctTag   = await webcryptoAes.encryptGcm(key, iv, enc('hello'), aad);
// ctTag is Uint8Array: ciphertext || 16-byte tag

const plaintext = await webcryptoAes.decryptGcm(key, iv, ctTag, aad);
// plaintext is Uint8Array; false on tampered ciphertext/tag/aad
```

### AES-CBC encrypt / decrypt

```js
const key = await webcryptoAes.generateKey('CBC', 128);
const iv  = crypto.getRandomValues(new Uint8Array(16));    // 16-byte IV

const ct = await webcryptoAes.encryptCbc(key, iv, new TextEncoder().encode('secret'));
// Platform applies PKCS#7 padding

const pt = await webcryptoAes.decryptCbc(key, iv, ct);
```

### AES-CTR encrypt / decrypt

```js
const key     = await webcryptoAes.generateKey('CTR', 256);
const counter = crypto.getRandomValues(new Uint8Array(16)); // 16-byte counter block
const data    = new TextEncoder().encode('stream data');

const ciphertext = await webcryptoAes.encryptCtr(key, counter, 64, data);
const recovered  = await webcryptoAes.decryptCtr(key, counter, 64, ciphertext);
```

### Import / export a raw key

```js
const rawBytes = crypto.getRandomValues(new Uint8Array(32));  // 256-bit
const key      = await webcryptoAes.importKey(rawBytes, 'GCM', true);

const exported = await webcryptoAes.exportKey(key);  // Uint8Array matching rawBytes
```

### Availability guard

```js
if (!webcryptoAes.isAvailable()) {
    // Fall back to pure-JS aes + gcm modules
}
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const { key, ivHex, ctTagHex } = args;
        const fromHex = (h) => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));
        libs.webcryptoAes.decryptGcm(key, fromHex(ivHex), fromHex(ctTagHex))
            .then(self.postMessage);
    },
    { dependencies: ['webcryptoAes'], args: { key, ivHex, ctTagHex } }
);
```

## Notes

- **GCM output is `ciphertext || tag`**: WebCrypto appends the authentication tag to the ciphertext. Pass the full concatenated buffer to `decryptGcm`. The tag length defaults to 128 bits (16 bytes).
- **12-byte IV per message**: NIST SP 800-38D strongly recommends a 96-bit (12-byte) random IV per encryption for best performance and security. Never reuse an IV with the same key under GCM.
- **CBC uses platform PKCS#7 padding**: the ciphertext is always a multiple of 16 bytes, even when the plaintext already aligns. The platform strips padding transparently on decryption.
- **GCM auth failure resolves `false`**: `decryptGcm` catches the rejection from `crypto.subtle.decrypt` (tampered ciphertext, wrong tag, wrong AAD) and resolves `false` — it never rejects. Callers must check the return value before using the plaintext.
- **No-throw contract**: all methods are `async` and resolve to a result or `false`. `crypto.subtle` rejections are caught and logged (`[crypto] FAIL: webcryptoAes.<method>: …`); they never propagate.
- **Worker-safe**: `crypto.subtle` is available in Web Workers; this module has no DOM dependency and no main-thread closures.

## See also

- [aes](../cipher/aes.md) — pure-JS AES block cipher (synchronous, bitArray I/O)
- [gcm](../mode/gcm.md) — pure-JS AES-GCM mode (synchronous, bitArray I/O)
- [aeskw](./aeskw.md) — WebCrypto AES-KW key-wrapping (sibling module)
