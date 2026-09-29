---
module: wasmCmac
category: crypto/wasm
dependencies: [wasmRuntime]
returns: object
worker-safe: true
status: complete
---

# wasmCmac

> WASM-loaded AES-CMAC (SP 800-38B / RFC 4493): MAC compute and verify over AES-128/192/256. Async, `Uint8Array`, no-throw.

**Module** `wasmCmac` | **Source** `packages/front/fw/src/crypto/wasm/cmac.js` | **Deps** `wasmRuntime` | **Worker-safe** yes

AES-CMAC is **not** in WebCrypto; this WASM tier (or the pure-JS [`cmac`](../mode/cmac.md) module) is the only path. This wrapper loads the delivered [`@awacloud/fw-wasm-crypto`](https://www.npmjs.com/package/@awacloud/fw-wasm-crypto) `cmac` binary — own SP 800-38B framing (`csrc/cmac/cmac.c`) over the vendored constant-time BearSSL `aes_ct64` block cipher — through [`wasmRuntime`](./runtime.md) and exposes an async surface for MAC computation and constant-time verification.

The `cmac` target is **scalar-only** (`simd:false` in `targets.json` — the AES block is bitsliced ct64, not simd128). There is no `cmac.simd.wasm`; `wasmCmac` forces `{ variant: 'scalar' }` when loading.

## Resolve

```js
const wasmCmac = runtime.resolve('wasmCmac');
// Returns: { isAvailable, mac, verify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `isAvailable` | `() => boolean` | `true` when `WebAssembly` is present (mirrors `wasmRuntime`) |
| `mac` | `(key: Uint8Array, message: Uint8Array, tagLen?: number) => Promise<Uint8Array\|false>` | The AES-CMAC tag (`tagLen` bytes, default 16), or `false` |
| `verify` | `(key: Uint8Array, message: Uint8Array, tag: Uint8Array) => Promise<boolean>` | Recompute tag then **constant-time** compare against `tag` |

### Parameter constraints

| Parameter | Constraint |
|-----------|-----------|
| `key` | `Uint8Array`, length `16` / `24` / `32` (AES-128 / 192 / 256) |
| `message` | `Uint8Array`, any byte length including `0` |
| `tagLen` | Integer in `[1, 16]`, default `16` |
| `tag` (verify) | `Uint8Array`, length `1..16`; verify recomputes `mac(key, message, tag.length)` |

`mac`/`verify` resolve `false` (never throw) when:

- a parameter is invalid (`[crypto] INVALID: …` logged): `key` not a `Uint8Array`, `key.length ∉ {16,24,32}`, `message` not a `Uint8Array`, `tagLen ∉ [1,16]`;
- the binary cannot load — `WebAssembly` unavailable, fetch/compile failure, or ABI mismatch (`[crypto] FAIL: …` logged by `wasmRuntime.load`);
- the WASM call returns a non-zero status (`[crypto] FAIL: wasmCmac.mac: aes_cmac status <n>`).

`verify` additionally returns `false` when `tag` is not a `Uint8Array` or when the constant-time comparison fails.

## Examples

### Compute an AES-128 CMAC tag

```js
const key = new Uint8Array(16); // fill from crypto.getRandomValues
const message = new TextEncoder().encode('authenticated payload');
const tag = await wasmCmac.mac(key, message);
if (tag === false) {
    // Invalid params or WASM unavailable — fall back to the pure-JS tier.
}
// tag is a 16-byte Uint8Array.
```

### Truncated tag (SP 800-38B §6.4)

```js
const tag8 = await wasmCmac.mac(key, message, 8); // 8-byte (64-bit) tag
```

### Constant-time verify

```js
const ok = await wasmCmac.verify(key, message, storedTag);
// true only if the recomputed tag matches storedTag byte-for-byte.
```

### RFC 4493 §4 published example vectors (AES-128)

```js
const rfcKey = Uint8Array.from('2b7e151628aed2a6abf7158809cf4f3c'.match(/../g).map(x => parseInt(x, 16)));

// Example 1: empty message → bb1d6929e95937287fa37d129b756746
const t1 = await wasmCmac.mac(rfcKey, new Uint8Array(0));

// Example 4: 64-byte message → 51f0bebf7e3b9d92fc49741779363cfe
const t4 = await wasmCmac.mac(rfcKey, msgBytes);
```

## Worker Usage

```js
// wasmCmac is worker-safe: all constants are inside factory() and the
// binary is fetched by wasmRuntime's package loader via import.meta.url.
const worker = fw.createWorker(() => {
    const wasmCmac = runtime.resolve('wasmCmac');
    self.onmessage = async ({ data }) => {
        const { key, message } = data;
        const tag = await wasmCmac.mac(key, message);
        self.postMessage(tag);
    };
});
```

## Notes

- **Not in WebCrypto.** `crypto.subtle` has no AES-CMAC; this WASM tier (or the pure-JS [`cmac`](../mode/cmac.md)) is the only path.
- **Scalar-only binary.** The AES block is bitsliced constant-time ct64 (not simd128); `wasmCmac` forces `{ variant: 'scalar' }` because there is no `cmac.simd.wasm`.
- **AES-128 / 192 / 256.** Key length selects the AES variant; all three are supported by the same binary.
- **Empty message is valid.** `msgLen=0` is a well-specified SP 800-38B case and is handled correctly by the WASM implementation.
- **Constant-time verify.** The byte comparison scans the full tag without early exit; a length mismatch returns `false` immediately (length is not secret).
- **Output is copied OUT** of WASM linear memory into a fresh `Uint8Array` (never a view that could alias reused memory).
- **No-throw contract.** Every failure path resolves to `false` after a `console.error`; nothing rejects.

## See also

- [crypto/mode/cmac](../mode/cmac.md) — the pure-JS AES-CMAC reference (same algorithm, universal default)
- [crypto/wasm/runtime](./runtime.md) — the shared WASM loader adapter
