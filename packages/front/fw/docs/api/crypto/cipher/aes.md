---
module: aes
category: crypto/cipher
dependencies: []
returns: object
worker-safe: true
status: complete
---

# aes

> AES-128/192/256 (FIPS 197) — single block (16 bytes), constant-time by default + opt-in fast T-table path.

**Module** `aes` | **Source** `packages/front/fw/src/crypto/cipher/aes.js` | **Deps** none | **Worker-safe** yes

Low-level module: one block at a time. For streaming/multi-block, pass `cipher` to `mode/{cbc,ctr,gcm,cmac,kw}.js`.

## Resolve

```js
const aes = runtime.resolve('aes');
// Returns: { name, fn, ttable, bitsliced }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `fn` | `(key: number[], full?: boolean) => {encrypt, decrypt?} \| false` | **Constant-time default** cipher (secure; encrypt + decrypt unless `full=false`) |
| `ttable.fn` | `(key: number[], full?: boolean) => {encrypt, decrypt?} \| false` | Fast T-table cipher, opt-in — **NOT constant-time** |
| `bitsliced.fn` | `(key: number[], full?: boolean) => {encrypt, decrypt?} \| false` | Deprecated alias of `fn` (constant-time) |

### `aes.fn(key, full=true)`

Schedules an AES key (32-bit words) and returns the **constant-time default** cipher: SubBytes runs through a masked-lookup S-box (256 uniform reads per byte, branchless mask `((diff-1)>>>8) & 1`), MixColumns via branchless `xtime`. `key.length` must be 4 (AES-128), 6 (AES-192) or 8 (AES-256). Returns `false` + `console.warn('INVALID')` on invalid size.

This is secure by default against Bernstein-style cache-timing (the access pattern is independent of the key/state), at a cost of ~50-100× the T-table throughput.

`full=false` exposes only `encrypt` (memory saving for CTR/GCM/KW which only need the forward path).

```js
cipher.encrypt([w0, w1, w2, w3]);   // → 4-word ciphertext
cipher.decrypt([w0, w1, w2, w3]);   // → 4-word plaintext
```

### `aes.ttable.fn(key, full=true)`

**Opt-in fast path.** Routes block ops through 5 precomputed T-tables (one indexed lookup per SubBytes ∘ MixColumns). **NOT constant-time** — T-table lookups are vulnerable to cache-timing key recovery (Bernstein 2005). Use only on a trusted, non-shared host. Output is byte-identical to `aes.fn` on all FIPS-197 + ACVP-AES-ECB-1.0 vectors.

### `aes.bitsliced.fn(key, full=true)`

**Deprecated alias** of `aes.fn` (both are constant-time now). Kept one cycle for back-compat; prefer `aes.fn` directly. `aes.bitsliced.fn === aes.fn`.

## Examples

### KAT FIPS-197 Appendix B (AES-128)

```js
const aes = runtime.resolve('aes');
const bitArray = runtime.resolve('bitArray');
const hex = runtime.resolve('hex');

const key   = Array.from(bitArray.ui8_to_ba(hex.toBytes('2b7e151628aed2a6abf7158809cf4f3c')));
const plain = Array.from(bitArray.ui8_to_ba(hex.toBytes('3243f6a8885a308d313198a2e0370734')));
const cipher = aes.fn(key);            // constant-time by default (secure)
const ct = cipher.encrypt(plain);
hex.fromBytes(bitArray.ba_to_ui8(ct));   // "3925841d02dc09fbdc118597196a0b32"
```

### Opt-in fast path (T-table, NOT constant-time)

```js
// Trusted, non-shared host only — vulnerable to cache-timing (Bernstein 2005).
const fast = aes.ttable.fn(key);
const ct = fast.encrypt(plain);        // byte-identical to aes.fn, ~50-100× faster
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const cipher = libs.aes.fn(args[0]);
        self.postMessage(cipher.encrypt(args[1]));
    },
    { dependencies: ['aes'], args: [keyWords, ptWords] }
);
```

## Notes

- **Constant-time by default**: `aes.fn` is constant-time (masked-lookup S-box), safe in shared-cache environments. The opt-in `aes.ttable.fn` is the fast path but is **NOT constant-time** (Bernstein 2005) — use it only on a trusted, non-shared host.
- **Key size validation**: `[1, 2, 3]` (3 words) → `false` + `console.warn('INVALID: aes: invalid key size')`.
- **Block size**: `cipher.encrypt([1, 2, 3])` → `false` + `console.warn('INVALID: aes: invalid block size')`.
- **No mode/padding**: this module handles only the raw block. Use `mode/cbc.js` (PKCS#7), `mode/ctr.js` (stream), `mode/gcm.js` (AEAD), `mode/kw.js` (key wrapping).

## See also

- [chacha20](./chacha20.md) — alternative stream cipher (RFC 8439)
- [Mode](../mode/README.md) — AEAD / multi-block wrappers
- [Conformance ACVP-AES-ECB-1.0](../../../../src/crypto/cipher/aes.acvp.md)
