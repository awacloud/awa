---
module: wasmEcc
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmEcc

> WASM ECDSA + ECDH on NIST P-256/384/521 — Tier-2 fallback for the WebCrypto-covered prime curves.

**Module** `wasmEcc` | **Source** `packages/front/fw/src/crypto/wasm/ecc.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

WASM-backed elliptic-curve cryptography over the NIST prime curves **P-256, P-384, P-521**: keygen, ECDSA sign/verify, and ECDH shared-secret derivation. The binary frames [fiat-crypto](https://github.com/mit-plv/fiat-crypto) machine-verified field arithmetic with BearSSL's EC layer; signing is **deterministic** (RFC 6979).

This is the **Tier-2 fallback** for environments where `crypto.subtle` is unavailable (non-secure-context, locked-down workers). In secure contexts prefer [`../webcrypto/ecc.md`](../webcrypto/ecc.md), which is hardware-accelerated. The pure-JS [`../pkc/ecc.md`](../pkc/ecc.md) remains the universal default.

The binary ships **scalar-only** (`ecc.scalar.wasm`; `simd: false` in targets.json). The `{ variant: 'scalar' }` option is passed explicitly to `wasmRuntime.load` because the package's `selectVariant()` defaults to simd and has no automatic fallback.

## Resolve

```js
const wasmEcc = runtime.resolve('wasmEcc');
// Returns: { isAvailable, generateKey, sign, verify, deriveBits }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present |
| `generateKey` | `(curve?: Curve) => Promise<{publicKey: Uint8Array, privateKey: Uint8Array}\|false>` | Fresh random key pair |
| `sign` | `(privateKey: Uint8Array, data: Uint8Array, curve?: Curve, hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | Deterministic ECDSA, raw `r\|\|s` |
| `verify` | `(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array, curve?: Curve, hash?: 256\|384\|512) => Promise<boolean>` | `true` / `false` (no-throw) |
| `deriveBits` | `(privateKey: Uint8Array, publicKey: Uint8Array, curve?: Curve) => Promise<Uint8Array\|false>` | ECDH shared X-coordinate `Z` |

`Curve = 'P-256' | 'P-384' | 'P-521'` (default `'P-256'`). ECDSA `hash` defaults to `256`.

### Encodings

| Item | Encoding | Length (`flen` = 32 / 48 / 66) |
|---|---|---|
| `privateKey` | raw big-endian scalar `d` | `flen` bytes |
| `publicKey` | SEC1 **uncompressed** point `0x04 \|\| X \|\| Y` | `1 + 2·flen` bytes |
| `signature` | raw `r \|\| s` (**not DER**) | `2·flen` bytes |
| `deriveBits` output | raw shared X-coordinate `Z = X(d·Q)` (**no KDF**) | `flen` bytes |

All methods resolve `false` (or `verify` → `false`) when:
- the `curve` or `hash` is unsupported
- a key / signature has the wrong byte length, or `data` is not a `Uint8Array`
- `WebAssembly` is unavailable, or the binary fails to load (fetch error, ABI mismatch)
- the WASM entry returns a non-zero status (`verify` also returns `false` on a non-matching signature)

None of them ever reject.

## Examples

```js
const wasmEcc = runtime.resolve('wasmEcc');

if (!wasmEcc.isAvailable()) {
    // Fall back to webcrypto/ecc (secure contexts) or pure-JS pkc/ecc.
}

// Generate a P-256 key pair, sign, verify.
const { publicKey, privateKey } = await wasmEcc.generateKey('P-256');
const enc = new TextEncoder();
const msg = enc.encode('hello');

const sig = await wasmEcc.sign(privateKey, msg, 'P-256', 256); // raw r||s
const ok = await wasmEcc.verify(publicKey, sig, msg, 'P-256', 256);
// ok === true

// ECDH shared secret (raw Z; run through an HKDF before use as a key).
const A = await wasmEcc.generateKey('P-384');
const B = await wasmEcc.generateKey('P-384');
const zAB = await wasmEcc.deriveBits(A.privateKey, B.publicKey, 'P-384');
const zBA = await wasmEcc.deriveBits(B.privateKey, A.publicKey, 'P-384');
// zAB and zBA are byte-identical
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs }) {
        // wasmRuntime fetches the colocated .wasm by name inside the worker —
        // no main-thread closure is serialized.
        libs.wasmEcc.generateKey('P-256').then((kp) => {
            self.postMessage(kp !== false);
        });
    },
    { dependencies: ['wasmEcc'] }
);
```

## Notes

- **Prefer WebCrypto in secure contexts**: `webcrypto/ecc` is hardware-accelerated for the P-curves. Use `wasmEcc` only when `crypto.subtle` is unavailable.
- **Raw `r||s`, not DER**: signatures are the concatenation of the two `flen`-byte field elements, mirroring the pure-JS `pkc/ecc` and `webcrypto/ecc` raw form. Convert to/from DER at the protocol boundary if needed.
- **Deterministic signing**: ECDSA uses RFC 6979 deterministic `k`, so a `(privateKey, data, curve, hash)` tuple always yields the same `r||s` — this eliminates the catastrophic nonce-reuse failure class and reproduces the FIPS 186-5 DetECDSA / RFC 6979 vectors byte-for-byte.
- **`deriveBits` returns a raw secret**: the shared X-coordinate `Z` is **not** a key — run it through an HKDF (`crypto/kdf/hkdf` or `webcrypto/hkdf`) before using it as keying material.
- **Scalar-only**: `ecc.simd.wasm` is not shipped. The `{ variant: 'scalar' }` pin is mandatory; a default load would fail on the missing SIMD binary.
- **No-throw contract**: all methods resolve to a value or `false`; they never reject. Input validation (curve / hash / lengths, `instanceof Uint8Array`) happens before any WASM call.
- **Output is always a fresh copy**: `readBytes` copies out of WASM linear memory into a new `Uint8Array`. The caller owns the returned buffer.
- **Curve scope**: P-256/384/521 only. Curve25519 (Ed25519 / X25519) and secp256k1 are out of scope — see the pure-JS tier for the latter.

## See also

- [wasmRuntime](./runtime.md) — shared WASM loader adapter
- [webcrypto/ecc](../webcrypto/ecc.md) — HW-backed P-curve ECDSA/ECDH in secure contexts (prefer this)
- [pkc/ecc](../pkc/ecc.md) — pure-JS elliptic-curve crypto (universal default)
