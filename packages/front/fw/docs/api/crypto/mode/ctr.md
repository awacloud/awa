---
module: ctr
category: crypto/mode
dependencies: [bitArray, aes]
returns: object
worker-safe: true
status: complete
---

# ctr

> AES-CTR (SP 800-38A §6.5) — stream mode, no padding, encrypt/decrypt involution.

**Module** `ctr` | **Source** `packages/front/fw/src/crypto/mode/ctr.js` | **Deps** `bitArray`, `aes` | **Worker-safe** yes

CTR = stream cipher derived from a block cipher. **Unauthenticated**: use GCM for AEAD. **Nonce reuse is catastrophic**: 2 messages under an identical (key, IV) → keystream recovery.

## Resolve

```js
const ctr = runtime.resolve('ctr');
// Returns: { encrypt }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `encrypt(prf, dataBa, ivBa, prefix)` | `({encrypt}, bitArray, bitArray, string) => bitArray \| false` | data XOR keystream (involution → encrypt = decrypt) |

## Examples

```js
const { aes, ctr, bitArray } = fw.runtime.resolveAll(['aes', 'ctr', 'bitArray']);

const cipher = aes.fn(keyWords);
const ivBa  = bitArray.ui8_to_ba(nonce16);

const ct = ctr.encrypt(cipher, ptBa, ivBa, '');
const pt = ctr.encrypt(cipher, ct, ivBa, '');   // involution
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cipher = libs.aes.fn(args[0]);
        self.postMessage(libs.ctr.encrypt(cipher, args[1], args[2], ''));
    },
    { dependencies: ['aes', 'ctr'], args: [keyWords, dataBa, ivBa] }
);
```

## Notes

- **Stream cipher**: `encrypt(encrypt(pt)) = pt` (involution).
- **No padding**: arbitrary-length payload (incl. non-byte/non-block-aligned via `bitArray.clamp`).
- **Nonce uniqueness**: the caller's responsibility. For AEAD with a nonce-tracker, use GCM.

## See also

- [aes](../cipher/aes.md), [aes_modes](../utils/aes_modes.md) — Uint8Array wrapper
- [aes_ctr](../utils/aes_ctr.md) — legacy wrapper with PKCS#7 (deprecated)
- [gcm](./gcm.md) — recommended AEAD
- [Conformance ctr.acvp.md](../../../../src/crypto/mode/ctr.acvp.md)
