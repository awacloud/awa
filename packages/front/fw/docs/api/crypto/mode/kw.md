---
module: kw
category: crypto/mode
dependencies: [bitArray, aes]
returns: object
worker-safe: true
status: complete
---

# kw

> AES-KW + KWP (SP 800-38F / RFC 3394 / RFC 5649) — symmetric key wrapping.

**Module** `kw` | **Source** `packages/front/fw/src/crypto/mode/kw.js` | **Deps** `bitArray`, `aes` | **Worker-safe** yes

KW (RFC 3394) wraps payloads that are multiples of 64 bits. KWP (RFC 5649) adds padding for arbitrary-length payloads. Inverse-cipher variant (SP 800-38F §6.3) explicitly rejected.

## Resolve

```js
const kw = runtime.resolve('kw');
// Returns: { wrap, unwrap, wrapPad, unwrapPad, wrapInverseCipher, unwrapInverseCipher, _internal }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `wrap(prf, ptBa)` | — | CT (KW, RFC 3394); payload must be a multiple of 64 bits |
| `unwrap(prf, ctBa)` | — | PT or `false` if IV check fails |
| `wrapPad(prf, ptBa)` | — | CT (KWP, RFC 5649); arbitrary-length payload |
| `unwrapPad(prf, ctBa)` | — | PT or `false` |
| `wrapInverseCipher()` | `() => false` | **NOT-IMPLEMENTED** explicit reject |
| `unwrapInverseCipher()` | `() => false` | **NOT-IMPLEMENTED** explicit reject |
| `_internal.{...}` | — | Debug primitives |

## Examples

### KW (RFC 3394) — payload multiple of 64 bits

```js
const { aes, kw, bitArray } = fw.runtime.resolveAll(['aes', 'kw', 'bitArray']);

const kek = aes.fn(kekKeyWords);
const ptBa = bitArray.ui8_to_ba(targetKeyBytes);
const wrapped = kw.wrap(kek, ptBa);
const unwrapped = kw.unwrap(kek, wrapped);
```

### KWP (RFC 5649) — arbitrary-length payload

```js
const wrapped = kw.wrapPad(kek, payloadAnyLength);
const back = kw.unwrapPad(kek, wrapped);   // false if IV/length/padding invalid
```

### Inverse-cipher rejected

```js
kw.wrapInverseCipher();   // false + console.warn('NOT-IMPLEMENTED: kw: KW-AE inverse-cipher (SP 800-38F §6.3)')
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const kek = libs.aes.fn(args[0]);
        self.postMessage(libs.kw.wrap(kek, args[1]));
    },
    { dependencies: ['aes', 'kw'], args: [kekWords, ptBa] }
);
```

## Notes

- **TDES rejected**: `prf.blockSize !== 16` → `DEPRECATED` warn (SP 800-131A §2.4 + SP 800-38F §6.2).
- **`unwrapPad` constant-time**: IV + length + padding validation accumulated without early-exit.
- **Inverse-cipher (KW-AE/AD inverse)**: not implemented, rare use case (embedded TPM). Use `wrap`/`unwrap`.

## See also

- [aes](../cipher/aes.md), [aes_modes](../utils/aes_modes.md) — Uint8Array wrapper over kw + kwp
- [Conformance kw.acvp.md](../../../../src/crypto/mode/kw.acvp.md)
