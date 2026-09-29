---
module: sha3
category: crypto/hash
dependencies: [bitArray, utf8]
returns: object
worker-safe: true
status: complete
---

# sha3

> SHA-3 + SHAKE (FIPS 202) — single Keccak sponge exposing 4 SHA-3 + 2 SHAKE + 4 streaming HMAC-compatible sub-modules.

**Module** `sha3` | **Source** `packages/front/fw/src/crypto/hash/sha3.js` | **Deps** `bitArray`, `utf8` | **Worker-safe** yes

One-shot API for SHA-3 and SHAKE + 4 streaming `sha3_*_hash` sub-modules consumable by `hmac`/`hkdf`/`pbkdf2`.

## Resolve

```js
const sha3 = runtime.resolve('sha3');
// Returns: { name, sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256,
//             sha3_224_hash, sha3_256_hash, sha3_384_hash, sha3_512_hash }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `sha3_224(data)` | `(string \| bitArray) => bitArray` | 224-bit digest |
| `sha3_256(data)` | `(string \| bitArray) => bitArray` | 256-bit digest |
| `sha3_384(data)` | `(string \| bitArray) => bitArray` | 384-bit digest |
| `sha3_512(data)` | `(string \| bitArray) => bitArray` | 512-bit digest |
| `shake128(data, outBits)` | `(string \| bitArray, number) => bitArray` | XOF, outBits must be a multiple of 8 |
| `shake256(data, outBits)` | `(string \| bitArray, number) => bitArray` | XOF, outBits must be a multiple of 8 |
| `sha3_*_hash` | `{name, fn, hash}` | HMAC-compatible streaming sub-modules |

### Streaming sub-modules

`sha3.sha3_256_hash` (and 224/384/512) exposes `{name, fn, hash}` — directly consumable by `hmac.fn(key, sha3.sha3_256_hash)`.

## Examples

### One-shot

```js
const { sha3, hex, bitArray } = fw.runtime.resolveAll(['sha3', 'hex', 'bitArray']);

hex.fromBytes(bitArray.ba_to_ui8(sha3.sha3_256('abc')));
// "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532"
```

### SHAKE XOF (variable output)

```js
const out = sha3.shake128('hello', 1024);   // 1024 bits
hex.fromBytes(bitArray.ba_to_ui8(out));     // 128 hex chars
```

### HMAC-SHA3-256

```js
const { sha3, hmac } = fw.runtime.resolveAll(['sha3', 'hmac']);
const key = bitArray.ui8_to_ba(new TextEncoder().encode('secret'));
const tag = new hmac.fn(key, sha3.sha3_256_hash).encrypt('message');
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        self.postMessage(libs.sha3.sha3_512(args[0]));
    },
    { dependencies: ['sha3'], args: ['hello'] }
);
```

## Notes

- **One-shot only on `sha3_*` / `shake*`** — no direct streaming API (use `sha3_*_hash.fn` which exposes update/finalize).
- **SHAKE outBits**: must be a multiple of 8 (byte alignment); otherwise `false` + `console.warn('INVALID')`.
- **MCT byte-exact**: all SHA3-{224,256,384,512} variants tested 100/100 iterations × 1000 inner (Iteration H2).

## See also

- [hmac](./hmac.md), [hkdf](./hkdf.md), [pbkdf2](./pbkdf2.md) — consume `sha3_*_hash`
- [ml_kem](../pkc/ml_kem.md), [ml_dsa](../pkc/ml_dsa.md), [slh_dsa](../pkc/slh_dsa.md) — PQC primitives
- [Conformance sha3.acvp.md](../../../../src/crypto/hash/sha3.acvp.md)
