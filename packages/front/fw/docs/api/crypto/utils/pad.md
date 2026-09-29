---
module: pad
category: crypto/utils
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pad

> PKCS#7 padding (RFC 5652 §6.3) — pad/strip for block modes without built-in padding (CBC, ECB).

**Module** `pad` | **Source** `packages/front/fw/src/crypto/utils/pad.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const pad = runtime.resolve('pad');
// Returns: { pad, strip, fast: { pad, strip } }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `pad(data)` | `(Uint8Array \| number[]) => Uint8Array \| false` | PKCS#7 padded, `false` if input invalid |
| `strip(data)` | `(Uint8Array \| number[]) => Uint8Array \| false` | Unpad, `false` if invalid (length, padding bytes) |
| `fast.pad(data)` | `(Uint8Array) => Uint8Array \| false` | Like `pad` but without element-by-element validation |
| `fast.strip(data)` | `(Uint8Array) => Uint8Array \| false` | Like `strip`, trusted Uint8Array input only |

> **Note**: block size is **fixed at 16** (AES). No `blockSize` parameter. `pad` never throws — returns `false` + `console.warn` on invalid input.

## Examples

```js
const { pad } = fw.runtime.resolveAll(['pad']);

const padded = pad.pad(new Uint8Array([1, 2, 3]));
// Uint8Array [1, 2, 3, 13, 13, ..., 13]  (13 bytes of PKCS#7 padding)
const back   = pad.strip(padded);   // Uint8Array [1, 2, 3]

// Fast variant (trusted Uint8Array input, no element-level validation)
const padded2 = pad.fast.pad(new Uint8Array([1, 2, 3]));
const back2   = pad.fast.strip(padded2);   // Uint8Array [1, 2, 3]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) { self.postMessage(libs.pad.pad(args[0])); },
    { dependencies: ['pad'], args: [new Uint8Array([1,2,3])] }
);
```

## Notes

- **Idempotence**: if the input already ends with a valid PKCS#7 block, `pad` appends a full extra 16-byte block — intentional behaviour per RFC 5652 §6.3.
- **`strip` constant-time**: verifies the `padLen` padding bytes via XOR-accumulation (branchless mask `(i >= BLOCK - padLen) ? 1 : 0`) — no early-exit on an invalid byte.
- **Padding oracle**: even with CT `strip`, authenticate the ciphertext before decryption (encrypt-then-MAC or use AEAD). Returning `false` remains observable if total timing is measured.
- **`fast.pad/strip`**: bypasses the `_isByteArray` validation — use only with `Uint8Array` inputs of controlled origin.

## See also

- [cbc](../mode/cbc.md), [aes_modes](./aes_modes.md), [aes_ctr](./aes_ctr.md) — consumers
