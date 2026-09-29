---
module: webcryptoHmac
category: crypto/webcrypto
dependencies: []
returns: object
worker-safe: true
status: complete
---

# webcryptoHmac

> WebCrypto-backed HMAC sign/verify over `crypto.subtle` — native CryptoKey, constant-time verify.

**Module** `webcryptoHmac` | **Source** `packages/front/fw/src/crypto/webcrypto/hmac.js` | **Deps** none | **Worker-safe** yes

Async, one-shot HMAC over SHA-256 (default), SHA-384, SHA-512, or SHA-1 (legacy).
Opt-in alternative to the pure-JS `hmac` module; keys are native `CryptoKey` objects
and `verify` is constant-time per the platform guarantee.

## Resolve

```js
const webcryptoHmac = runtime.resolve('webcryptoHmac');
// Returns: { isAvailable, importKey, generateKey, sign, verify, mac }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `crypto.subtle` is present |
| `importKey` | `(rawKey: Uint8Array, hash?, extractable?) => Promise<CryptoKey\|false>` | Imports a raw key for HMAC under `hash` |
| `generateKey` | `(hash?, lengthBits?, extractable?) => Promise<CryptoKey\|false>` | Generates a random HMAC key |
| `sign` | `(key: CryptoKey, data: Uint8Array) => Promise<Uint8Array\|false>` | Computes HMAC tag |
| `verify` | `(key: CryptoKey, signature: Uint8Array, data: Uint8Array) => Promise<boolean>` | Verifies HMAC tag (constant-time) |
| `mac` | `(rawKey: Uint8Array, data: Uint8Array, hash?) => Promise<Uint8Array\|false>` | One-shot: importKey then sign |

**Default hash**: `'SHA-256'`. Supported: `'SHA-256'`, `'SHA-384'`, `'SHA-512'`, `'SHA-1'`.
`'SHA-1'` emits `console.warn('[crypto] DEPRECATED: HMAC-SHA-1')`.

All operations resolve to a result or `false`; they never reject.

## Examples

### One-shot MAC (most common)

```js
const { webcryptoHmac } = fw.runtime.resolveAll(['webcryptoHmac']);
const key  = new TextEncoder().encode('secret-key');
const data = new TextEncoder().encode('message');
const tag  = await webcryptoHmac.mac(key, data);           // Uint8Array (32 bytes)
```

### Import key, sign, then verify

```js
const rawKey = crypto.getRandomValues(new Uint8Array(32));
const key  = await webcryptoHmac.importKey(rawKey, 'SHA-256');
const data = new TextEncoder().encode('payload');
const sig  = await webcryptoHmac.sign(key, data);          // Uint8Array
const ok   = await webcryptoHmac.verify(key, sig, data);   // true
```

### Generate a fresh key

```js
const key  = await webcryptoHmac.generateKey('SHA-512');   // CryptoKey
const data = new TextEncoder().encode('test');
const tag  = await webcryptoHmac.sign(key, data);
```

### HMAC-SHA-384

```js
const tag = await webcryptoHmac.mac(rawKey, data, 'SHA-384');
```

### Worker usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const [rawKey, payload] = args;
        const tag = await libs.webcryptoHmac.mac(rawKey, new TextEncoder().encode(payload));
        self.postMessage(tag);
    },
    { dependencies: ['webcryptoHmac'], args: [rawKey, 'message'] }
);
```

## Notes

- **Keys are native `CryptoKey`** objects, not `bitArray`. Use `importKey` to
  bring a raw `Uint8Array` secret into WebCrypto, or `generateKey` for ephemeral use.
- **`verify` is constant-time** per the WebCrypto specification — the platform
  performs the comparison without early exit.
- **No-throw contract**: every method catches `crypto.subtle` rejections internally
  and resolves `false`; callers never need a `try/catch`.
- **Unsupported hash** (anything outside SHA-256/384/512/SHA-1): logs
  `[crypto] INVALID` and resolves `false`.
- **SHA-1**: accepted for legacy interop only. Triggers a deprecation warning and
  is forbidden by SP 800-131A §5 for new protocols.
- **`isAvailable`**: check this once at startup if the runtime environment is
  unknown (e.g. a sandboxed iframe).  All other methods also guard internally.
- **Opt-in alternative**: for environments without `crypto.subtle` (or when
  `bitArray` I/O or SHA-3/BLAKE2b is needed) use the pure-JS `hmac` module.

## See also

- [../hash/hmac.md](../hash/hmac.md) — pure-JS HMAC default, bitArray I/O, SHA-3/BLAKE2b support
- [digest.md](./digest.md) — WebCrypto SHA-256/384/512 one-shot digest
- [../hash/sha256.md](../hash/sha256.md), [../hash/sha512.md](../hash/sha512.md) — pure-JS hash modules
