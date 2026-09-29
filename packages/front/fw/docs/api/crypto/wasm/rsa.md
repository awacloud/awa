---
module: wasmRsa
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmRsa

> WASM RSA Tier-2 fallback: OAEP encrypt/decrypt, PSS & PKCS#1-v1.5 sign/verify, keygen. Async, `Uint8Array`, no-throw.

**Module** `wasmRsa` | **Source** `packages/front/fw/src/crypto/wasm/rsa.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

RSA over WASM, as an **opt-in Tier-2 fallback** for environments where `crypto.subtle` is unavailable (non-secure context, locked-down workers). In a secure context, prefer [`webcrypto/rsa`](../webcrypto/rsa.md) — the browser runs RSA in hardware-backed native code. This module loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `rsa` binary (vendored BearSSL i31 big-integer core + an EMSA-PSS padding layer) through [`wasmRuntime`](./runtime.md). The `rsa` target ships **scalar only**; the wrapper forces the scalar variant on load.

Three schemes are exposed: **RSA-OAEP** (`encrypt`/`decrypt`), **RSA-PSS** and **RSASSA-PKCS#1-v1.5** (`sign`/`verify`). Supported digests are SHA-256/384/512 (default 256); moduli are 2048/3072/4096 bits (default 2048); the public exponent is fixed at 65537. PKCS#1-v1.5 **encryption** is intentionally not exposed (insecure). PEM/DER conversion is out of scope (use the pure-JS asn1/`pem` modules).

## Key encoding

Keys cross the ABI as the **BearSSL big-integer wire format** — there is no DER parser in the delivered binary:

- **public key**: `u16be nLen | n | u16be eLen | e` (minimal big-endian)
- **private key**: `u32be nBitLen | u16be pLen | p | u16be qLen | q | u16be dpLen | dp | u16be dqLen | dq | u16be iqLen | iq` (CRT parameters; `iq = q⁻¹ mod p`)

`generateKey` returns this form; `encrypt`/`decrypt`/`sign`/`verify` consume it. The surface is self-consistent: a key pair from `generateKey` is directly usable by the other members.

## Resolve

```js
const wasmRsa = runtime.resolve('wasmRsa');
// Returns: { isAvailable, generateKey, encrypt, decrypt, sign, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `generateKey` | `(scheme: 'OAEP'\|'PSS'\|'PKCS1', modulusBits?: 2048\|3072\|4096, hash?: 256\|384\|512) => Promise<{publicKey: Uint8Array, privateKey: Uint8Array}\|false>` | A key pair (wire format), or `false` |
| `encrypt` | `(publicKey: Uint8Array, data: Uint8Array, label?: Uint8Array, hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | RSA-OAEP ciphertext (`k` bytes), or `false` |
| `decrypt` | `(privateKey: Uint8Array, ct: Uint8Array, label?: Uint8Array, hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | The recovered plaintext, or `false` |
| `sign` | `(privateKey: Uint8Array, data: Uint8Array, scheme: 'PSS'\|'PKCS1', hash?: 256\|384\|512) => Promise<Uint8Array\|false>` | The signature (`k` bytes), or `false` |
| `verify` | `(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array, scheme: 'PSS'\|'PKCS1', hash?: 256\|384\|512) => Promise<boolean>` | `true` iff the signature is valid |

`sign`/`verify` take the **raw message**: the wrapper digests it with `crypto.subtle` (SHA-256/384/512) before the WASM call. `encrypt` and PSS `sign` are **randomized** (OAEP seed / PSS salt drawn from `crypto.getRandomValues`), so repeated calls produce different outputs that all verify/decrypt correctly.

Members resolve `false` (never throw) when:

- `scheme`, `hash`, or `modulusBits` is outside the supported set (`[crypto] INVALID: …` logged);
- a key/ciphertext/signature/data argument has the wrong type or an obviously bad length;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch (`[crypto] FAIL: …` logged by `wasmRuntime.load`);
- the WASM call returns a non-zero status (bad padding, invalid signature, OAEP unpad failure).

`verify` additionally resolves `false` whenever the signature does not validate (tampered signature, tampered message, wrong scheme, wrong hash, or wrong key).

## Examples

### Generate a key pair, sign with PSS, verify

```js
const enc = new TextEncoder();
const kp = await wasmRsa.generateKey('PSS', 2048, 256);
if (kp === false) { /* WASM unavailable — fall back to pure-JS rsa */ }

const msg = enc.encode('hello rsa');
const sig = await wasmRsa.sign(kp.privateKey, msg, 'PSS', 256);     // randomized salt
const ok = await wasmRsa.verify(kp.publicKey, sig, msg, 'PSS', 256); // → true
```

### RSA-OAEP encrypt / decrypt

```js
const ct = await wasmRsa.encrypt(kp.publicKey, msg, undefined, 256); // k bytes
const pt = await wasmRsa.decrypt(kp.privateKey, ct, undefined, 256); // → msg
```

### Legacy PKCS#1-v1.5 signatures (interop only)

```js
// Emits "[crypto] DEPRECATED: … prefer PSS". Use only for interop with
// systems that mandate RSASSA-PKCS1-v1_5.
const sig = await wasmRsa.sign(kp.privateKey, msg, 'PKCS1', 256);
const ok = await wasmRsa.verify(kp.publicKey, sig, msg, 'PKCS1', 256);
```

### Tamper detection

```js
const bad = Uint8Array.from(sig);
bad[0] ^= 0xff;
await wasmRsa.verify(kp.publicKey, bad, msg, 'PSS', 256);  // → false
```

## Notes

- **Prefer WebCrypto in secure contexts.** `crypto.subtle` runs RSA in hardware-backed native code; this WASM tier only wins where `crypto.subtle` is absent. Pure-JS [`rsa`](../pkc/rsa.md) remains the universal default.
- **Keys are BearSSL wire format, not DER.** See *Key encoding* above. The delivered ABI has no DER/PEM parser; conversion is a separate concern.
- **PKCS#1-v1.5 signatures are legacy.** `sign(... 'PKCS1' ...)` warns DEPRECATED; prefer PSS for new signatures. PKCS#1-v1.5 **encryption** is not exposed at all (insecure).
- **Randomized by design.** OAEP encryption and PSS signing draw fresh randomness per call from `crypto.getRandomValues`; outputs are non-deterministic but always verify/decrypt. PKCS#1-v1.5 signatures are deterministic.
- **NIST-anchored.** The test suite verifies a genuine NIST RSA-SigGen-FIPS186-5 PKCS#1-v1.5 signature byte-for-byte against the delivered binary, plus OAEP/PSS/PKCS1 round-trips on a fixed NIST DecryptionPrimitive key.
- **Scalar only.** The `rsa` target ships `rsa.scalar.wasm` (no SIMD build); the wrapper passes `{ variant: 'scalar' }` to `wasmRuntime.load`.
- **Output is copied OUT** of WASM linear memory into fresh `Uint8Array`s (never a view that could alias reused memory).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; nothing rejects.

## See also

- [crypto/webcrypto/rsa](../webcrypto/rsa.md) — the hardware-backed WebCrypto RSA (preferred in secure contexts)
- [crypto/pkc/rsa](../pkc/rsa.md) — the pure-JS RSA reference (universal default)
- [crypto/wasm/ecc](./ecc.md) — WASM elliptic-curve signatures/ECDH, the other classical PKC accelerator
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
- [crypto/wasm README](./README.md) — the WASM primitive family overview
