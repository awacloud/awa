# Crypto / Mode

AES operating modes + ChaCha20 AEAD. Each module takes a pre-scheduled block/stream primitive (see [`cipher/`](../cipher/README.md)) and uses it to process full buffers.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [cbc](./cbc.md) | `{encrypt, decrypt}` | `bitArray`, `aes` | AES-CBC (SP 800-38A §6.2) — confidentiality, caller-provided padding |
| [ctr](./ctr.md) | `{encrypt}` | `bitArray`, `aes` | AES-CTR (SP 800-38A §6.5) — stream, no padding |
| [gcm](./gcm.md) | `{encrypt, decrypt, gmac, gmacVerify, nonceTracker, _internal}` | `bitArray`, `aes` | AES-GCM (SP 800-38D) — AEAD, GMAC included |
| [cmac](./cmac.md) | `{mac, verify, truncatedMac, truncatedVerify, _internal}` | `bitArray`, `aes` | AES-CMAC (SP 800-38B / RFC 4493); TDES rejected |
| [kw](./kw.md) | `{wrap, unwrap, wrapPad, unwrapPad, wrapInverseCipher, unwrapInverseCipher, _internal}` | `bitArray`, `aes` | AES-KW + KWP (SP 800-38F / RFC 3394 / RFC 5649) |
| [chacha20poly1305](./chacha20poly1305.md) | `{encrypt, decrypt, nonceTracker}` | `chacha20`, `poly1305` | AEAD ChaCha20-Poly1305 (RFC 8439) |

## Common pattern (AEAD)

```js
const { aes, gcm, random, bitArray } = fw.runtime.resolveAll(['aes', 'gcm', 'random', 'bitArray']);

const key   = Array.from(bitArray.ui8_to_ba(random.bytes(32)));
const iv    = bitArray.ui8_to_ba(random.bytes(12));
const cipher = aes.fn(key);
const aad   = bitArray.ui8_to_ba(new TextEncoder().encode('header'));
const pt    = bitArray.ui8_to_ba(new TextEncoder().encode('Hello World'));

const out = gcm.encrypt(cipher, pt, iv, aad, 128);  // { ct, tag }
const dec = gcm.decrypt(cipher, out.ct, iv, aad, out.tag, 128);
```

## See also

- [Cipher](../cipher/README.md) — block primitives required as input
- [Utils / aes_modes](../utils/aes_modes.md) — uniform Uint8Array wrapper over all AES modes
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
