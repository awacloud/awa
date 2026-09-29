---
module: adf
category: crypto/hash
dependencies: [aes, sha256]
returns: object
worker-safe: true
status: complete
---

# adf

> AES-DF (KeePass KDBX 3.x) — KDF interop legacy, NOT RECOMMENDED for new code.

**Module** `adf` | **Source** `packages/front/fw/src/crypto/hash/adf.js` | **Deps** `aes`, `sha256` | **Worker-safe** yes

Format-spec interop for KeePass v1 / KDBX 3.x databases. For new password hashing, use [`argon2`](./argon2.md) (RFC 9106). For generic KDF, use [`hkdf`](./hkdf.md) or [`pbkdf2`](./pbkdf2.md).

## Resolve

```js
const adf = runtime.resolve('adf');
// Returns: { transform }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `transform(masterKey, transformSeed, rounds)` | `(Uint8Array(32), Uint8Array(32), number) => Uint8Array(32)` | Composite key |

## Examples

```js
const { adf, hex } = fw.runtime.resolveAll(['adf', 'hex']);

const masterKey     = hex.toBytes('...32 bytes...');
const transformSeed = hex.toBytes('...32 bytes...');
const out = adf.transform(masterKey, transformSeed, 600000);
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.adf.transform(args[0], args[1], args[2]));
    },
    { dependencies: ['adf'], args: [masterKey, transformSeed, 600000] }
);
```

## Notes

- **Format interop only**: used to open KDBX 3.x databases. **Do not use for new code**.
- **Exhaustive bindings** tested (M/T/C/R) + invariant `fn = SHA256 ∘ partial`.
- **Underlying primitives** validated ACVP (AES-256-ECB + SHA-256).

## See also

- [argon2](./argon2.md) — modern alternative for password hashing
- [Conformance adf.acvp.md](../../../../src/crypto/hash/adf.acvp.md)
