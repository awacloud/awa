---
module: aes_ctr
category: crypto/utils
dependencies: [bitArray, aes, ctr, pad]
returns: object
worker-safe: true
status: complete
---

# aes_ctr

> **`@deprecated`** legacy AES-CTR + PKCS#7 wrapper — prefer [`aes_modes.ctr`](./aes_modes.md) for new code.

**Module** `aes_ctr` | **Source** `packages/front/fw/src/crypto/utils/aes_ctr.js` | **Deps** `bitArray`, `aes`, `ctr`, `pad` | **Worker-safe** yes

Legacy API kept for back-compat. PKCS#7 + CTR is semantically odd (CTR does not need padding). For new code: `aes_modes.ctr` (no padding) or `aes_modes.gcm` (AEAD).

## Resolve

```js
const aes_ctr = runtime.resolve('aes_ctr');
// Returns: { ui8 }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `ui8(key, iv)` | `(Uint8Array(32), Uint8Array(16)) => instance` | Instance with pad/strip/raw methods |

### Instance methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `pad(plaintext)` | `(Uint8Array) => Uint8Array` | encrypt + PKCS#7 pad |
| `strip(ciphertext)` | `(Uint8Array) => Uint8Array` | decrypt + PKCS#7 strip |
| `raw(data)` | `(Uint8Array) => Uint8Array` | XOR keystream without padding (involution) |
| `update(iv)` | `(Uint8Array) => void` | Update the IV |

## Examples

```js
const aes_ctr = fw.runtime.resolve('aes_ctr');

const c = aes_ctr.ui8(key32, iv16);
const ct = c.pad(new TextEncoder().encode('Hello'));   // encrypt + PKCS#7
const pt = c.strip(ct);                                // decrypt + strip
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const c = libs.aes_ctr.ui8(args[0], args[1]);
        self.postMessage(c.pad(args[2]));
    },
    { dependencies: ['aes_ctr'], args: [key, iv, pt] }
);
```

## Notes

- **`@deprecated`**: for new code, prefer `aes_modes.ctr` (no padding) or `aes_modes.gcm` (AEAD).
- **No runtime warning** — soft-deprecated for back-compat.
- **CTR is malleable**: no authentication; layer a MAC or use GCM/ChaCha20-Poly1305.

## See also

- [aes_modes](./aes_modes.md) — recommended wrapper
- [ctr](../mode/ctr.md) — underlying primitive
