# Crypto / Cipher

**Low-level** block / stream primitives (one block / one keystream at a time). For full-buffer encryption, use an operating mode from `crypto/mode/`.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [aes](./aes.md) | `{name, fn, bitsliced}` | none | AES-128/192/256 (FIPS 197) single block + opt-in constant-time bitsliced variant |
| [chacha20](./chacha20.md) | `{name, xor, xchacha20, _internal}` | none | ChaCha20 IETF (RFC 8439) — keystream stream-cipher |

## Common pattern

```js
const aes = fw.runtime.resolve('aes');
const cipher = aes.fn(keyAs32BitWords);          // schedule
const ct = cipher.encrypt(ptBlock4Words);        // one 16-byte block
const pt = cipher.decrypt(ctBlock4Words);
```

For streaming / multi-block, pass `cipher` to `mode/{cbc,ctr,gcm,kw,cmac}.js`.

## See also

- [Mode](../mode/README.md) — multi-block wrappers + AEAD
- [`NIST_CONFORMANCE.md`](../../../../src/crypto/NIST_CONFORMANCE.md)
