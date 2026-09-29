---
module: chacha20
category: crypto/cipher
dependencies: []
returns: object
worker-safe: true
status: complete
---

# chacha20

> ChaCha20 stream cipher IETF (RFC 8439) — XORable keystream, 96-bit nonce + 32-bit counter.

**Module** `chacha20` | **Source** `packages/front/fw/src/crypto/cipher/chacha20.js` | **Deps** none | **Worker-safe** yes

For AEAD, use [`chacha20poly1305`](../mode/chacha20poly1305.md) which combines `chacha20` + `poly1305`.

## Resolve

```js
const chacha20 = runtime.resolve('chacha20');
// Returns: { name, xor, xchacha20, _internal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `xor` | `(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, initialCounter?: number) => Uint8Array \| false` | `data XOR keystream` (involution: encrypt/decrypt) |
| `xchacha20` | `() => false` | **NOT-IMPLEMENTED** — explicit reject (G3) |
| `_internal.block` | `(key32, counter, nonce32, out32) => void` | 64-byte block function (debug/introspection) |

### `chacha20.xor(key, nonce, data, initialCounter=0)`

- `key`: `Uint8Array(32)`
- `nonce`: `Uint8Array(12)`
- `data`: `Uint8Array` arbitrary length (in/out via XOR)
- `initialCounter`: `number` ≥ 0, default 0

Returns `false` + `console.warn('INVALID')` on invalid sizes.
Returns `false` + `console.warn('LIMIT-EXCEEDED')` if `initialCounter + ⌈data.length / 64⌉ > 2³²` (counter overflow → silent wrap that would reuse keystream — catastrophic).

### `chacha20.xchacha20()`

Always `false` + `console.warn('NOT-IMPLEMENTED: chacha20: XChaCha20 (draft-irtf-cfrg-xchacha) is not implemented')`. The IETF draft was never finalised; for 192-bit nonces, use a dedicated implementation (e.g. libsodium-wasm).

## Examples

### KAT RFC 8439 §2.4.2

```js
const { chacha20, hex } = fw.runtime.resolveAll(['chacha20', 'hex']);

const key   = hex.toBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
const nonce = hex.toBytes('000000000000004a00000000');
const pt    = new TextEncoder().encode('Ladies and Gentlemen of the class of \'99: …');

const ct = chacha20.xor(key, nonce, pt, 1);
const back = chacha20.xor(key, nonce, ct, 1);   // involution → pt
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const out = libs.chacha20.xor(args[0], args[1], args[2], 1);
        self.postMessage(out);
    },
    { dependencies: ['chacha20'], args: [key, nonce, ptUint8] }
);
```

## Notes

- **32-bit counter**: intrinsic RFC 8439 §2.3 limit — 256 GiB max under a (key, nonce) pair. Active runtime guard: rejection via `LIMIT-EXCEEDED` warning.
- **XChaCha20 not implemented**: see explicit reject `xchacha20()`. Use a fresh 12-byte nonce per message; for strong collision resistance, consider an external library.
- **Stream cipher** = involution: `xor(xor(pt)) = pt`.
- **No AEAD**: this module provides confidentiality only. For authentication, use [`chacha20poly1305`](../mode/chacha20poly1305.md).

## See also

- [chacha20poly1305](../mode/chacha20poly1305.md) — full AEAD (RFC 8439 §2.8)
- [poly1305](../hash/poly1305.md) — companion MAC
- [Conformance chacha20.acvp.md](../../../../src/crypto/cipher/chacha20.acvp.md)
