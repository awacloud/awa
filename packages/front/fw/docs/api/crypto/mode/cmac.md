---
module: cmac
category: crypto/mode
dependencies: [bitArray, aes]
returns: object
worker-safe: true
status: complete
---

# cmac

> AES-CMAC (SP 800-38B / RFC 4493) — deterministic MAC based on AES, TDES rejected.

**Module** `cmac` | **Source** `packages/front/fw/src/crypto/mode/cmac.js` | **Deps** `bitArray`, `aes` | **Worker-safe** yes

Default 128-bit tag, truncatable to 32-128 via `truncatedMac` (SP 800-38B §6.4 minimum 32 bits).

## Resolve

```js
const cmac = runtime.resolve('cmac');
// Returns: { mac, verify, truncatedMac, truncatedVerify, _internal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `mac(prf, msgBa)` | — | 128-bit tag |
| `verify(prf, msgBa, tagBa)` | — | `boolean` (constant-time) |
| `truncatedMac(prf, msgBa, tagLen)` | — | Truncated tag `tagLen ∈ [32, 128]` |
| `truncatedVerify(prf, msgBa, tagBa, tagLen)` | — | `boolean` |
| `_internal.{subkeys}` | — | Debug primitives |

## Examples

```js
const { aes, cmac, bitArray } = fw.runtime.resolveAll(['aes', 'cmac', 'bitArray']);

const cipher = aes.fn(keyWords);
const msg = bitArray.ui8_to_ba(new TextEncoder().encode('Hello, CMAC!'));

const tag = cmac.mac(cipher, msg);                           // 128 bits
const ok  = cmac.verify(cipher, msg, tag);                   // true

const tag64 = cmac.truncatedMac(cipher, msg, 64);            // 64 bits
const ok64  = cmac.truncatedVerify(cipher, msg, tag64, 64);
```

### TDES rejected

```js
const tdesCipher = { encrypt: ..., blockSize: 8 };           // mock
cmac.mac(tdesCipher, msg);   // false + console.warn('DEPRECATED: cmac: non-AES block cipher (e.g. TDES)')
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cipher = libs.aes.fn(args[0]);
        self.postMessage(libs.cmac.mac(cipher, args[1]));
    },
    { dependencies: ['aes', 'cmac'], args: [keyWords, msgBa] }
);
```

## Notes

- **TDES rejected**: `prf.blockSize !== 16` → `false` + `DEPRECATED` warn (SP 800-131A §2.4 + SP 800-38B §5.1).
- **`tagLen < 32`** → `WEAK` warn (SP 800-38B §6.4 recommended minimum).
- **`verify` constant-time** via `bitArray.equal`.

## See also

- [aes](../cipher/aes.md), [hmac](../hash/hmac.md) — hash-based MAC alternative
- [gcm](./gcm.md) — for AEAD (CMAC provides authentication only)
- [Conformance cmac.acvp.md](../../../../src/crypto/mode/cmac.acvp.md)
