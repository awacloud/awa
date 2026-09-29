---
module: chacha20poly1305
category: crypto/mode
dependencies: [chacha20, poly1305]
returns: object
worker-safe: true
status: complete
---

# chacha20poly1305

> ChaCha20-Poly1305 AEAD (RFC 8439 §2.8) — AES-GCM alternative, recommended when AES-NI is unavailable.

**Module** `chacha20poly1305` | **Source** `packages/front/fw/src/crypto/mode/chacha20poly1305.js` | **Deps** `chacha20`, `poly1305` | **Worker-safe** yes

AEAD: confidentiality + authenticity with a 128-bit tag. Adopted by TLS 1.3, WireGuard, Signal. **Nonce reuse**: Poly1305 does NOT degrade cryptographically (unlike GHASH/GCM) — use `nonceTracker` for defence in depth.

## Resolve

```js
const aead = runtime.resolve('chacha20poly1305');
// Returns: { encrypt, decrypt, nonceTracker }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `encrypt(key, nonce, pt, aad?)` | `(Uint8Array(32), Uint8Array(12), Uint8Array, Uint8Array?) => {ct, tag} \| false` | Ciphertext + 128-bit tag |
| `decrypt(key, nonce, ct, tag, aad?)` | `(...) => Uint8Array \| false` | Plaintext or `false` (invalid tag) |
| `nonceTracker(key)` | `(key) => {encrypt, decrypt, seenNonces}` | Anti-nonce-reuse wrapper (in-process) |

## Examples

```js
const { chacha20poly1305, random } = fw.runtime.resolveAll(['chacha20poly1305', 'random']);

const key   = random.bytes(32);
const nonce = random.bytes(12);
const pt    = new TextEncoder().encode('Hello AEAD');
const aad   = new TextEncoder().encode('header');

const out = chacha20poly1305.encrypt(key, nonce, pt, aad);   // {ct, tag}
const dec = chacha20poly1305.decrypt(key, nonce, out.ct, out.tag, aad);
new TextDecoder().decode(dec);   // 'Hello AEAD'
```

### Nonce tracker (anti-reuse)

```js
const tracker = chacha20poly1305.nonceTracker(key);
tracker.encrypt(nonce, pt1, aad);   // OK
tracker.encrypt(nonce, pt2, aad);   // false + console.error('CORRUPT: nonce reuse rejected')
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.chacha20poly1305.encrypt(args[0], args[1], args[2]));
    },
    { dependencies: ['chacha20poly1305'], args: [key, nonce, ptBytes] }
);
```

## Notes

- **12-byte nonce** (RFC 8439 §2.3). **Nonce reuse** does not degrade Poly1305 cryptographically but **leaks the XOR of plaintexts** + enables forgery → use `nonceTracker` for in-process detection.
- **Tag mismatch → `false`** + `console.error('CORRUPT')`. Plaintext is never released on an invalid tag.
- **No AES-NI required**: better performance than GCM on ARM / mobile / without AES hardware.

## See also

- [chacha20](../cipher/chacha20.md), [poly1305](../hash/poly1305.md) — underlying primitives
- [gcm](./gcm.md) — alternative AES AEAD
- [Conformance chacha20poly1305.acvp.md](../../../../src/crypto/mode/chacha20poly1305.acvp.md)
