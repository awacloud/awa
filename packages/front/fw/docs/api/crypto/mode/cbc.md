---
module: cbc
category: crypto/mode
dependencies: [bitArray, aes]
returns: object
worker-safe: true
status: complete
---

# cbc

> AES-CBC (SP 800-38A §6.2) — confidentiality, padding is the caller's responsibility.

**Module** `cbc` | **Source** `packages/front/fw/src/crypto/mode/cbc.js` | **Deps** `bitArray`, `aes` | **Worker-safe** yes

CBC is **unauthenticated**: use [`gcm`](./gcm.md) or [`chacha20poly1305`](./chacha20poly1305.md) for AEAD. If CBC is required, layer an explicit MAC (encrypt-then-MAC).

## Resolve

```js
const cbc = runtime.resolve('cbc');
// Returns: { encrypt, decrypt }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `encrypt(prf, ptBa, ivBa)` | `({encrypt}, bitArray, bitArray) => bitArray \| false` | Ciphertext (PT pre-padded by caller) |
| `decrypt(prf, ctBa, ivBa)` | `({encrypt, decrypt}, bitArray, bitArray) => bitArray \| false` | Plaintext (caller must unpad) |

## Examples

```js
const { aes, cbc, pad, bitArray, random } = fw.runtime.resolveAll(['aes', 'cbc', 'pad', 'bitArray', 'random']);

const key = Array.from(bitArray.ui8_to_ba(random.bytes(32)));
const iv  = bitArray.ui8_to_ba(random.bytes(16));
const cipher = aes.fn(key);

const ptBa  = bitArray.ui8_to_ba(pad.pad(new TextEncoder().encode('Hello, CBC!')));
const ctBa  = cbc.encrypt(cipher, ptBa, iv);
const back  = cbc.decrypt(cipher, ctBa, iv);
const plain = pad.strip(bitArray.ba_to_ui8(back));
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cipher = libs.aes.fn(args[0]);
        self.postMessage(libs.cbc.encrypt(cipher, args[1], args[2]));
    },
    { dependencies: ['aes', 'cbc'], args: [keyWords, ptBa, ivBa] }
);
```

## Notes

- **No AEAD**: malleable (bit-flipping), no authentication. For AEAD, use GCM.
- **Caller padding**: use `utils/pad.js` (PKCS#7 RFC 5652) or `utils/aes_modes.cbc` which handles padding.
- **MCT 6/6 byte-exact** validated (FIPS 140-2 Annex C).

## See also

- [aes](../cipher/aes.md), [pad](../utils/pad.md), [aes_modes](../utils/aes_modes.md) — Uint8Array wrapper with padding
- [gcm](./gcm.md) — recommended AEAD
- [Conformance cbc.acvp.md](../../../../src/crypto/mode/cbc.acvp.md)
