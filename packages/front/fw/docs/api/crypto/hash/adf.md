---
module: adf
category: crypto/hash
dependencies: [sha256, aes]
returns: object
worker-safe: true
status: complete
---

# adf

> AES-DF (KeePass KDBX 3.x) — KDF interop legacy, NOT RECOMMENDED for new code.

**Module** `adf` | **Source** `packages/front/fw/src/crypto/hash/adf.js` | **Deps** `sha256`, `aes` | **Worker-safe** yes

Format-spec interop for KeePass v1 / KDBX 3.x databases. For new password hashing, use [`argon2`](./argon2.md) (RFC 9106). For generic KDF, use [`hkdf`](./hkdf.md) or [`pbkdf2`](./pbkdf2.md).

## Resolve

```js
const adf = runtime.resolve('adf');
// Returns: { fn, partial, MIN_RECOMMENDED_ROUNDS, MAX_ROUNDS }
```

## API

Inputs and outputs are bitArrays (`number[]` words, see [bitArray](../utils/bitArray.md)).

| Member | Signature | Returns |
|---------|-----------|---------|
| `fn(master, transform, rounds, composite)` | `(number[], number[], number, number[]) => number[] \| false` | The KDBX 3.x final key: `SHA-256(partial(…))` |
| `partial(master, transform, rounds, composite)` | `(number[], number[], number, number[]) => number[] \| false` | `master ‖ SHA-256(transformed)`, the key before the last hash |
| `MIN_RECOMMENDED_ROUNDS` | `number` | KeePass's recommended minimum round count |
| `MAX_ROUNDS` | `number` | The largest accepted round count |

`master` is the master seed (32 bytes), `transform` the transform seed (32 bytes, the AES-256 key), `composite` the composite key (the hash of the credentials). Any invalid input returns `false` with a warning.

## Examples

```js
const { adf, bitArray } = fw.runtime.resolveAll(['adf', 'bitArray']);

const key = adf.fn(
    bitArray.ui8_to_ba(masterSeed),
    bitArray.ui8_to_ba(transformSeed),
    600000,
    bitArray.ui8_to_ba(compositeKey),
);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.adf.fn(args[0], args[1], args[2], args[3]));
    },
    { dependencies: ['adf'], args: [master, transform, 600000, composite] }
);
```

## Notes

- **Format interop only**: used to open KDBX 3.x databases. **Do not use for new code**.
- **Exhaustive bindings** tested (M/T/C/R) + invariant `fn = SHA256 ∘ partial`.
- **Underlying primitives** validated ACVP (AES-256-ECB + SHA-256).

## See also

- [argon2](./argon2.md) — modern alternative for password hashing
- [Conformance adf.acvp.md](../../../../src/crypto/hash/adf.acvp.md)
