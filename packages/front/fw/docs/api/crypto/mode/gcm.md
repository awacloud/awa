---
module: gcm
category: crypto/mode
dependencies: [bitArray, aes]
returns: object
worker-safe: true
status: complete
---

# gcm

> AES-GCM (SP 800-38D) — authenticated AEAD + GMAC, IV-reuse catastrophic.

**Module** `gcm` | **Source** `packages/front/fw/src/crypto/mode/gcm.js` | **Deps** `bitArray`, `aes` | **Worker-safe** yes

Recommended AEAD mode for TLS / file encryption. **IV reuse under the same key is catastrophic**: loss of the GHASH authentication key + leak of the XOR of plaintexts.

## Resolve

```js
const gcm = runtime.resolve('gcm');
// Returns: { encrypt, decrypt, gmac, gmacVerify, nonceTracker, _internal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `encrypt(prf, ptBa, ivBa, aadBa, tagLenBits)` | — | `{ct, tag} \| false` |
| `decrypt(prf, ctBa, ivBa, aadBa, tagBa, tagLenBits)` | — | Plaintext or `false` (invalid tag) |
| `gmac(prf, aadBa, ivBa, tagLenBits)` | — | Tag (no PT) |
| `gmacVerify(prf, aadBa, ivBa, tagBa, tagLenBits)` | — | `boolean` |
| `nonceTracker(prf)` | `({encrypt}) => {encrypt, decrypt, seenNonces}` | Anti-IV-reuse wrapper (in-process) |
| `_internal.{ghash, gctr}` | — | Debug primitives |

### `tagLenBits`

`32` to `128` (in steps of 32). 128 recommended for general use. Shorter tag = linear security loss.

## Examples

```js
const { aes, gcm, random, bitArray } = fw.runtime.resolveAll(['aes', 'gcm', 'random', 'bitArray']);

const key   = Array.from(bitArray.ui8_to_ba(random.bytes(32)));
const iv    = bitArray.ui8_to_ba(random.bytes(12));        // 96-bit recommended
const aad   = bitArray.ui8_to_ba(new TextEncoder().encode('header'));
const pt    = bitArray.ui8_to_ba(new TextEncoder().encode('Hello, GCM!'));

const cipher = aes.fn(key);
const out = gcm.encrypt(cipher, pt, iv, aad, 128);     // {ct, tag}
const dec = gcm.decrypt(cipher, out.ct, iv, aad, out.tag, 128);
// dec === pt (or false on invalid tag)
```

### Nonce tracker (anti-IV-reuse)

```js
const tracker = gcm.nonceTracker(cipher);
tracker.encrypt(pt1, iv1, aad, 128);   // OK
tracker.encrypt(pt2, iv1, aad, 128);   // false + console.error('CORRUPT: nonce reuse')
```

### GMAC only (no plaintext)

```js
const tag = gcm.gmac(cipher, aad, iv, 128);
const ok  = gcm.gmacVerify(cipher, aad, iv, tag, 128);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cipher = libs.aes.fn(args[0]);
        self.postMessage(libs.gcm.encrypt(cipher, args[1], args[2], args[3], 128));
    },
    { dependencies: ['aes', 'gcm'], args: [key, pt, iv, aad] }
);
```

## Notes

- **Unique IV** per (key, message): use `random.bytes(12)` or a monotonic counter. `nonceTracker` detects reuse in-process.
- **Tag mismatch → `false`** + `console.error('CORRUPT: gcm: authentication tag mismatch')`. Plaintext is **never** released on an invalid tag.
- **AES-128/192/256**: `cipher` can be scheduled on any of the 3 key sizes (key-size-agnostic via `aes.fn`).

## See also

- [aes](../cipher/aes.md), [chacha20poly1305](./chacha20poly1305.md) — alternative AEAD
- [cmac](./cmac.md) — MAC without AEAD
- [Conformance gcm.acvp.md](../../../../src/crypto/mode/gcm.acvp.md)
