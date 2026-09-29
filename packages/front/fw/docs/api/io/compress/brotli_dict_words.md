---
module: brotliDictWords
category: io/compress
dependencies: []
returns: object
worker-safe: true
status: complete
---

# brotliDictWords

> Lazy loader for the Brotli static dictionary (RFC 7932 Appendix A).

**Module** `brotliDictWords` | **Source** `packages/front/fw/src/io/compress/brotli_dict_words.js` | **Deps** none | **Worker-safe** yes

Lazy-load wrapper around the binary file **`brotli_dict.bin`** (122 784 bytes) co-located in `src/io/compress/`. The blob is **not** inlined in the JS — embedding it as base64 would add ~33% overhead (163 712 chars) and prevent the browser from sharing the asset via HTTP cache across pages and workers.

The module only:
1. Validates the size + CRC-32 of a supplied blob.
2. Stores the blob and exposes it via `blob` / `isLoaded`.
3. Optionally downloads it via `fetch(url)`.

It is then up to the consumer (typically the `brotli` codec) to call `brotliDict.setWords(words.blob)` to enable the lookups.

## Resolve

```js
const words = runtime.resolve('brotliDictWords');
// Returns: { blob: null, isLoaded: false, EXPECTED_SIZE, EXPECTED_CRC32, setBlob, load }
```

## API

| Method / field | Signature / type | Description |
|----------------|------------------|-------------|
| `blob` | `Uint8Array \| null` | Dictionary blob (122 784 bytes) after loading |
| `isLoaded` | `boolean` | `true` once `setBlob` / `load` succeeds |
| `EXPECTED_SIZE` | `number` | `122784` — canonical RFC 7932 size |
| `EXPECTED_CRC32` | `number` | `0x5136CB04` — expected CRC-32 (zlib poly) |
| `setBlob` | `(buf: Uint8Array) => Uint8Array` | Synchronous validation + storage |
| `load` | `(url: string) => Promise<Uint8Array>` | `fetch(url)` then `setBlob`. Idempotent. |

### `setBlob(buf)`

Verifies that `buf` is a `Uint8Array` of the correct size and CRC-32, then updates `blob` / `isLoaded`. Throws on mismatch. Used by Node/Bun tests (which read `.bin` via `fs`) and by any consumer that already has the bytes in hand.

### `load(url)`

`fetch(url) → arrayBuffer → setBlob`. Idempotent: if the blob is already loaded, returns the current blob immediately without re-fetching.

| Case | Behaviour |
|------|-----------|
| Already loaded | Returns cached `blob` (no-op) |
| `url` falsy | Throws `'url required'` |
| HTTP non-2xx | Throws `'HTTP <status>'` |
| Wrong size / CRC | Throws (via `setBlob`) |

## Examples

### Browser / Worker

```js
const dict  = runtime.resolve('brotliDict');
const words = runtime.resolve('brotliDictWords');

// Path convention under the framework's default importmap
await words.load('/packages/front/fw/src/io/compress/brotli_dict.bin');
dict.setWords(words.blob);
```

Adjust the URL to match your bundle / asset pipeline layout. The `.bin` is listed in `package.json` `files`, so it is included on publish.

### Node / Bun (tests, tooling)

```js
import fs from 'fs';
const bytes = new Uint8Array(fs.readFileSync('.../src/io/compress/brotli_dict.bin'));
words.setBlob(bytes);
```

## Asset

| Property | Value |
|----------|-------|
| Canonical spec | RFC 7932 Appendix A — hex dump of the `DICT` table |
| Vendored from | `https://raw.githubusercontent.com/google/brotli/master/c/common/dictionary.bin` |
| Local path | `packages/front/fw/src/io/compress/brotli_dict.bin` |
| Size | 122 784 bytes (= `DICTSIZE` RFC 7932) |
| CRC-32 | `0x5136CB04` (value given by Appendix A) |
| SHA-256 | `20e42eb1b511c21806d4d227d07e5dd06877d8ce7b3a817f378f313653f35c70` |
| First 4-letter word | `"time"` |
| First 5-letter word | `"first"` |

The current `.bin` comes from `google/brotli` (master commit) for convenience, but **the spec is the authoritative source**: the `DICT` table is given verbatim in RFC 7932 Appendix A as hex lines (32 bytes / 64 characters per line). Both representations are bit-for-bit identical — verified by the CRC-32 that the RFC states explicitly.

### Re-vendoring

Fast method (upstream asset):

1. Download `c/common/dictionary.bin` from `google/brotli`.
2. Overwrite `packages/front/fw/src/io/compress/brotli_dict.bin`.
3. Verify `CRC-32 == 0x5136CB04` and `size == 122 784`.

Authoritative method (from the RFC, air-gapped):

1. Extract the hex lines from `references/SPEC/RFC/brotli/rfc7932.txt` (Appendix A, ~lines 2421-6898, regex `^      [0-9a-f]{64}$`).
2. Concatenate then hex-decode → `Uint8Array(122784)`.
3. Verify size + CRC-32.
4. Write to `brotli_dict.bin`.

If the upstream value diverges from the RFC CRC, **the RFC asset takes precedence**.

## Worker Usage

```js
const worker = fw.createWorker(
    async function ({ libs, args }) {
        const w = libs.brotliDictWords;
        await w.load(args[0]);                // fetch inside the worker
        libs.brotliDict.setWords(w.blob);
        self.postMessage({ ready: libs.brotliDict.hasWords() });
    },
    {
        dependencies: ['brotliDict', 'brotliDictWords'],
        args: ['/packages/front/fw/src/io/compress/brotli_dict.bin'],
    }
);
```

## Notes

- The CRC-32 (zlib poly) is inlined — this module is an asset loader, not a codec. No dependency on `crc32`.
- All constants (`EXPECTED_SIZE`, `EXPECTED_CRC32`, helpers) live in the factory body: correct worker serialization via `factory.toString().replace(/^factory/, 'function')`.
- `factory.toString()` is intentionally small (< 5 KB) — verified by a test. This is the main indicator that the blob is properly externalized.
- `load(url)` is idempotent: safe for concurrent calls from multiple sites — the 2nd call immediately returns the blob from the 1st (provided it has completed). For perfect concurrency, cache the promise on the consumer side.
- The sentinels `"time"` (length 4) and `"first"` (length 5) are canonical invariants — a corrupted or foreign-source blob will fail them.

## See also

- [brotliDict](./brotli_dict.md) — primary consumer via `setWords(blob)`
- [brotli](./brotli.md) — codec that orchestrates the end-to-end wiring
- [brotliShared](./brotli_shared.md) — reuses the blob for RFC 9841 §3.1 custom dicts
