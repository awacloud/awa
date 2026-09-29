# Framework — Documentation

Lightweight DI (Dependency Injection) system for browser JS applications. Modules are pure factory functions, resolvable on demand, serializable for Web Workers. No external dependencies, no bundler required.

**Package:** `@awacloud/fw`

| Entry | When to use |
|---|---|
| `@awacloud/fw` (`src/main.js`) | Self-contained mode — named exports `{ ENV, log, runtime, createWorker, domReady }`. The user registers modules: `runtime.registerAll(modules)` (catalogue) or `runtime.registerDeep(x)` (selective). |
| `@awacloud/fw/core/runtime` + subpath modules | Bundler selective mode — `import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js'` then `runtime.registerDeep(sanitize)`. Maximum tree-shaking. |
| `@awacloud/fw/vite` | Official Vite plugin — exposes `virtual:@awacloud/fw/preset/<name>` and `virtual:@awacloud/fw/side-bundle/<name>`. |

See [Bundler integration](./guide/integration-bundlers.md) and [TypeScript](./guide/typescript.md).

## Quick Start — standalone

> **Since the refactor** — `@awacloud/fw` no longer auto-registers modules when `main.js` loads. The user must explicitly call `runtime.registerAll(modules)` (or `registerAllDeep`, or register module by module via subpath).

```js
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';

const { runtime, createWorker, domReady } = fw;
runtime.registerAll(modules);

// Resolve a module
const hex = runtime.resolve('hex');
console.log(hex.fromBytes(new Uint8Array([72, 101, 108]))); // "48656c"

// Wait for the DOM
domReady.loaded(() => {
    const ui = runtime.resolve('uiSession');
    // ...
});
```

For a minimal graph (bundler-side tree-shaking), import the module directly via its subpath and use `registerDeep`:

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(sanitize); // pulls parser, render, secPolicy via JS imports
```

## Quick Start — bundler-integrated (Vite)

```js
// vite.config.js
import fw from '@awacloud/fw/vite';
export default { plugins: [ fw({ preset: 'site-interactive' }) ] };
```

```js
// src/main.js
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
const hex = runtime.resolve('hex');
```

## Navigation map

| Section | Content |
|---------|---------|
| [Guides](./guide/README.md) | Concepts, patterns, recipes |
| [Dev / DX (`docs/dev/`)](./dev/README.md) | Running tests, bun/Node runtime, type generation |
| [Tools (`docs/tools/`)](./tools/README.md) | Bundler, standalone, AOT, types |
| [Integrations](../integrations/README.md) | Bundlers, frameworks, test runners |
| [API / Core](./api/core/README.md) | Runtime, logger, domReady, workers |
| [API / IO](./api/io/README.md) | Codecs, compression, calculation, utilities |
| [API / Crypto](./api/crypto/README.md) | FIPS 140-3 / SP 800 / RFC cryptography (cipher, hash, mode, PKC, utils, webcrypto, wasm) |
| [API / DOM](./api/dom/README.md) | Rendering, query, storage, network |
| [API / Process](./api/process/README.md) | Inter-context messages, RPC |
| [API / Sanity](./api/sanity/base.md) | Security lockdown — base, community, lockdown (all three ESM, explicit call) · default tier: `lockdown()` |
| [Evidence (`docs/evidence/`)](./evidence/pqc-hybrid-evidence.md) | Evaluation-evidence dossiers — pqc-hybrid combiners (vectors, provenance, reproducibility) |

> **Generated API reference** (HTML, exhaustive signatures from types): `bun run docs:api` → `docs/api-generated/` (generated on demand, distinct from the editorial pages `docs/api/`). See [`../integrations/typedoc`](../integrations/typedoc/README.md).

## All modules

| Module | Category | Quick description |
|--------|-----------|-------------------|
| `processMessage` | process | Inter-worker message routing |
| `processRPC` | process | Promise-based RPC over MessageChannel |
| `workerPool` | process | Homogeneous pool of N workers — FIFO dispatch, respawn, AbortSignal |
| `clock` | io/timing | Monotonic clock + wall-clock — performance.now() replacement |
| `rateLimit` | io/timing | Debounce + throttle (lodash-compat) |
| `scheduler` | io/timing | Cron parsing + interval + job scheduler |
| `sse` | dom/net | EventSource (SSE) + exponential retry |
| `webrtc` | dom/net | RTCPeerConnection wrapper (signaling-agnostic) |
| `broadcastChannel` | dom/net | BroadcastChannel cross-tab/worker |
| `network` | dom/net | Online/offline detection (navigator + ping) |
| `backgroundSync` | dom/sw | Background Sync API — offline-first task registration via SyncManager (Chrome only) |
| `cache` | dom/sw | Cache API wrapper |
| `push` | dom/sw | PushManager wrapper — VAPID subscription, subscription, permission state |
| `serviceWorker` | dom/sw | SW lifecycle (window-side) |
| `sharedWorker` | dom/sw | SharedWorker cross-tab connection + bidirectional RPC |
| `date` | io/time | Date helpers + timezone (Intl) |
| `i18n` | io/i18n | Catalogues + interpolation + plurals (Intl) |
| `ansi` | io/text | ANSI / VT100 / xterm parser + serialiser (CSI, OSC, SGR, cursor) |
| `htmlEntities` | io/text | WHATWG HTML5 entities decoder (2,125 entries, CommonMark §6.2) |
| `semver` | io/text | Validation, parsing and range matching for strict semver 2.0.0 |
| `str` | io/text | Case conversions, slug, truncate, format |
| `unicode` | io/text | Normalization + collation + graphemes |
| `lruCache` | io/structures | Bounded LRU cache O(1) |
| `heap` | io/structures | Binary heap / priority queue |
| `ringBuffer` | io/structures | FIFO ring buffer O(1) |
| `trie` | io/structures | Prefix tree (autocompletion) |
| `btree` | io/structures | m-way B-tree (ordered map + range) |
| `treeWalker` | io/structures | Generic linked-tree visitor — iterative DFS, cycle-guard, filters |
| `abort` | io/sync | AbortController helpers |
| `mutex` | io/sync | Async binary lock (FIFO) |
| `semaphore` | io/sync | Counting semaphore with N permits |
| `channel` | io/sync | Buffered CSP-style channel |
| `atomics` | io/sync | SharedArrayBuffer + Atomics helpers (cross-worker) |
| `cancellable` | io/sync | Cancellable tasks (LIFO cleanup hooks) |
| `tokenBucket` | io/sync | Token bucket rate limiter (HTTP, backpressure) |
| `binaryReader` | io/binary | Cursor reader over Uint8Array, endianness-aware — typed primitives, strings, zero-copy sub-reader |
| `binaryWriter` | io/binary | Auto-growing endianness-aware writer — typed primitives, strings, seek-based patch |
| `easing` | io/calc | Easing functions for animations |
| `crc32` | io/calc | CRC-32 checksum (incremental) |
| `adler32` | io/calc | Adler-32 checksum (incremental) |
| `bigint` | io/calc | BigInt conversions + modular arithmetic + Miller-Rabin |
| `linalg` | io/math | Vectors + matrices 2D/3D/4D (column-major) |
| `stats` | io/math | Descriptive statistics (mean, median, quantiles, ...) |
| `geom` | io/math | 2D geometry (Rect, Circle, Line, Polygon, hit-test) |
| `interp` | io/math | Spatial interpolation (linear, bicubic, Bézier, ...) |
| `fixedPoint` | io/math | Fixed-point ↔ float conversions (Fixed16.16, F2Dot14, FUnit) for binary I/O |
| `geolocation` | dom/sensors | GPS / wifi position (Geolocation API) |
| `battery` | dom/sensors | Battery Status API wrapper |
| `networkInfo` | dom/sensors | Network Information API wrapper |
| `sensors` | dom/sensors | Gyro/accel/orientation (Generic Sensor + DeviceMotion fallback) |
| `a11y` | dom/utils | Accessibility primitives — ARIA live regions, `aria-*` attributes, `role`, `prefers-reduced-motion` |
| `focus` | dom/utils | Focus trap, tab order, stash/restore, onChange |
| `form` | dom/utils | Bidirectional input ↔ state binding + complete form state machine (values, dirty, touched, errors, submit) |
| `formKit` | dom/utils | Thin ergonomic layer over `form` — RHF-style API with JSON-Schema resolver |
| `keybindings` | dom/utils | Keyboard shortcuts: simple bindings, chords, stackable contexts, priority |
| `leaderElection` | dom/utils | Single-leader cross-tab election (Web Locks + BC heartbeat fallback) |
| `notifications` | dom/utils | Web Notifications API (window + SW) |
| `permissions` | dom/utils | Permissions API query + watch |
| `route` | dom/utils | Hash-based router — `:param` / `*wildcard` patterns, query parsing, managed lifecycle |
| `webauthn` | dom/utils | WebAuthn Level 3 — Passkeys / FIDO2 registration and authentication |
| `visibility` | dom/lifecycle | Page Visibility API |
| `idle` | dom/lifecycle | IdleDetector + timer-based fallback |
| `wakeLock` | dom/lifecycle | Wake Lock API + auto-reacquire on visibility |
| `lz4` | io/compress | LZ4 compression |
| `bitstream` | io/compress | LSB-first bit read/write (primitive) |
| `huffman` | io/compress | Canonical Huffman codes (primitive) |
| `lz77` | io/compress | LZ77 hash-chain matching (primitive) |
| `lzw` | io/compress | LZW dynamic dictionary (GIF/TIFF/.Z) |
| `deflate` | io/compress | Deflate compression (RFC 1951) |
| `gzip` | io/compress | Gzip compression (RFC 1952) |
| `zlib` | io/compress | Zlib compression (RFC 1950) |
| `zip` | io/compress | ZIP archiving |
| `brotliDict` | io/compress | Brotli — tables + 121 transforms (RFC 7932 Appendix B) |
| `brotliDictWords` | io/compress | Brotli — static dictionary blob (RFC 7932 Appendix A, lazy) |
| `brotli` | io/compress | Brotli codec RFC 7932 (full decoder + dynamic encoder) |
| `brotliShared` | io/compress | RFC 9841 extensions (large window, shared dictionary §3.1/§3.2, parser §5) |
| `brotliFrame` | io/compress | RFC 9841 §8 Shared Brotli Framing Format parser |
| `b64` | io/codec | Base64 RFC 4648 encode/decode/validate |
| `base32` | io/codec | Base32 RFC 4648 (A–Z 2–7) |
| `base58` | io/codec | Base58 Bitcoin/IPFS alphabet |
| `buffer` | io/codec | Binary object codec (awacloud notation) |
| `cbor` | io/codec | CBOR RFC 8949 (deterministic encoding) |
| `csv` | io/codec | CSV RFC 4180 tabular import/export |
| `hex` | io/codec | Hex ↔ Uint8Array |
| `mime` | io/codec | HTTP headers + multipart (form-data, mixed) |
| `msgpack` | io/codec | MessagePack (timestamp ext, BigInt) |
| `url` | io/codec | Robust querystring + URL helpers |
| `utf8` | io/codec | String ↔ UTF-8 bytes |
| `xml` | io/codec | Tolerant minimal XML parser/serialiser (OOXML, ODF, XMP, SVG, RSS) |
| `errors` | io/utils | Standalone fw error handling primitives: structured logger, guard, UI boundary |
| `eventBus` | io/utils | Typed application pub/sub by topic (sticky, wildcards, scopes) |
| `bitmap` | io/utils | Bits ↔ bytes conversion |
| `queue` | io/utils | Queue with concurrency |
| `signal` | io/utils | Lightweight reactive signals — mutable cells with subscriptions, derived values, auto-tracking effects |
| `ui8` | io/utils | Uint8Array utilities |
| `uuid` | crypto/utils | UUID v1/v4 (RFC 4122 / RFC 9562) — compact or canonical formats |
| `valid` | io/utils | Type guards + schema validation (JSON Schema) |
| `chart` | dom/rendering | Canvas 2D charts — line, area, bar, sparkline (internal observability) |
| `component` | dom/rendering | Reusable component primitive on top of `uiSession` — template + state + lifecycle + automatic cleanup |
| `parser` | dom/rendering | HTML ↔ elm-array |
| `reactiveBind` | dom/rendering | Explicit signal-to-DOM binding controller: patch nodes, never re-render |
| `render` | dom/rendering | Data transformer (no DOM) |
| `sanitize` | dom/rendering | Allowlist-based HTML sanitiser — XSS protection |
| `secPolicy` | dom/rendering | Low-level security primitives shared by the rendering pipeline — URL safety, DOM-clobbering, `on*` attributes, blocked tags, dangerous CSS |
| `template` | dom/rendering | DOM engine: elm-array materialisation |
| `themeTokens` | dom/rendering | CSS Custom Properties design tokens (light/dark/highContrast/reducedMotion variants) |
| `devtools` | dom/rendering | Read-only introspection of a uiSession + lightweight profiler + readable elm-array dump |
| `devtoolsUI` | dom/rendering | Opt-in read-only inspector — session, module-registry and signal-graph views |
| `uiSession` | dom/rendering | High-level facade (parse+render+template+dom) |
| `uiSessionCore` | dom/rendering | Core methods mixin for `UISession` — lifecycle, lookup, structural mutations |
| `uiSessionDirect` | dom/rendering | Direct DOM mutators mixin for `UISession` — text, attr, on, bind |
| `uiSessionList` | dom/rendering | Keyed-list controller (`UIList`) + session-level `list()` method for `UISession` |
| `virtualScroll` | dom/rendering | Virtualised list — O(visible) rendering for 10⁴–10⁶ items |
| `dnd` | dom/query | SDE-internal Drag & Drop via Pointer Events — draggable, dropTarget, preview |
| `dom` | dom/query | Coherent DOM API (attrs, classes, styles, form) |
| `events` | dom/query | Named event manager |
| `gesture` | dom/query | Unified touch/pointer gestures (tap, swipe, pan, pinch) |
| `media` | dom/query | Camera, microphone, screen access, stream management |
| `animate` | dom/display | Animation utilities |
| `fullscreen` | dom/display | Fullscreen API |
| `download` | dom/fs | File download |
| `fsAccess` | dom/fs | File System Access API + OPFS — pick, read, write, list (partial worker-safe) |
| `indexedDB` | dom/fs | IndexedDB wrapper |
| `remoteStore` | dom/fs | Remote key-value store — HTTP/WS transport, watch, batch, auto-reconnect |
| `storage` | dom/fs | LocalStorage / SessionStorage |
| `ajax` | dom/net | XHR / Fetch requests |
| `ws` | dom/net | WebSocket |
| `entropyCollector` | dom/utils | Entropy collector (DOM events) |
| `clipboard` | dom/utils | Clipboard API |
| `ua` | dom/utils | User agent detection |
| `bitArray` | crypto/utils | Bit-precise bitArray (SJCL convention) — module pivot — origin: [docs/dev/provenance.md](./dev/provenance.md) |
| `asn1` | crypto/utils | ASN.1 DER (X.690) — primitive tag serialisation |
| `asn1Oid` | crypto/utils | ASN.1 base OIDs — bidirectional name ↔ OID resolution (≥ 186 OIDs, 12 categories: PKCS, X.509, ECC, AES, PAdES…) |
| `pem` | crypto/utils | PEM (RFC 7468) — Base64 encode/decode + headers |
| `aes_modes` | crypto/utils | Uniform Uint8Array wrapper over all AES modes |
| `bn` | crypto/utils | Big Number (SJCL-derived) — ECDSA/RSA arithmetic — origin: [docs/dev/provenance.md](./dev/provenance.md) |
| `pad` | crypto/utils | PKCS#7 padding (RFC 5652 §6.3) |
| `random` | crypto/utils | CTR_DRBG-AES-256 (SP 800-90A) + RCT/APT (SP 800-90B) |
| `aes_ctr` | crypto/utils | **`@deprecated`** legacy AES-CTR + PKCS#7 wrapper |
| `sha256` | crypto/hash | SHA-256 (FIPS 180-4 §6.2) |
| `sha224` | crypto/hash | SHA-224 (FIPS 180-4 §6.3) — sha256 wrapper |
| `sha512` | crypto/hash | SHA-512 (FIPS 180-4 §6.4) + parametric builder |
| `sha512_224` | crypto/hash | SHA-512/224 (FIPS 180-4 §5.3.6.1) |
| `sha512_256` | crypto/hash | SHA-512/256 (FIPS 180-4 §5.3.6.2) |
| `sha384` | crypto/hash | SHA-384 (FIPS 180-4 §6.5) — sha512 wrapper |
| `hmac` | crypto/hash | Polymorphic HMAC (RFC 2104 / FIPS 198-1) |
| `pbkdf2` | crypto/hash | PBKDF2 (RFC 2898 / SP 800-132), default 600,000 iter |
| `hkdf` | crypto/hash | HKDF (RFC 5869 / SP 800-56C Rev. 2) |
| `sha3` | crypto/hash | SHA-3 + SHAKE (FIPS 202) one-shot + streaming |
| `adf` | crypto/hash | KeePass AES-DF (KDBX 3.x) — legacy interop |
| `poly1305` | crypto/hash | Poly1305 (RFC 8439 §2.5) — one-time MAC |
| `blake2b` | crypto/hash | BLAKE2b (RFC 7693); salt/person; keyed mode |
| `argon2` | crypto/hash | Argon2id (RFC 9106); Argon2d/i explicit reject |
| `aes` | crypto/cipher | AES-128/192/256 (FIPS 197) + constant-time bitsliced variant |
| `chacha20` | crypto/cipher | ChaCha20 IETF (RFC 8439) — stream cipher |
| `ctr` | crypto/mode | AES-CTR (SP 800-38A §6.5) — stream |
| `cbc` | crypto/mode | AES-CBC (SP 800-38A §6.2) |
| `gcm` | crypto/mode | AES-GCM (SP 800-38D) AEAD + GMAC + nonceTracker |
| `cmac` | crypto/mode | AES-CMAC (SP 800-38B / RFC 4493); TDES rejected |
| `kw` | crypto/mode | AES-KW + KWP (SP 800-38F / RFC 3394 / RFC 5649) |
| `chacha20poly1305` | crypto/mode | AEAD ChaCha20-Poly1305 (RFC 8439 §2.8) |
| `ecc` | crypto/pkc | ECDSA P-{224,256,384,521}+K-curves (FIPS 186-5 + RFC 6979) |
| `x25519` | crypto/pkc | X25519 DH (RFC 7748) + isLowOrderPoint helper |
| `ed25519` | crypto/pkc | Ed25519 + ph + ctx (RFC 8032 / FIPS 186-5 §7.6) |
| `rsa` | crypto/pkc | RSA-OAEP + RSA-PSS (FIPS 186-5); PKCS#1 v1.5 reject |
| `ml_kem` | crypto/pkc | ML-KEM Kyber post-quantum KEM (FIPS 203) |
| `ml_dsa` | crypto/pkc | ML-DSA Dilithium post-quantum signatures (FIPS 204) |
| `slh_dsa` | crypto/pkc | SLH-DSA SPHINCS+ stateless hash-based (FIPS 205, 12 variants) |
| `hybridKem` | crypto/pkc | X-Wing hybrid KEM (X25519+ML-KEM-768, draft-connolly-cfrg-xwing-kem -06) |
| `hybridSign` | crypto/pkc | Composite signatures (LAMPS, AND-verify): MLDSA65-Ed25519 + MLDSA65-ECDSA-P256 |
| `rsaKeygen` | crypto/utils | RSA 2048+ key generation (FIPS 186-5 §A.1.3) |
| `jws` | crypto/utils | JSON Web Signature (RFC 7515) — HS*/EdDSA |
| `keyformat` | crypto/utils | EC/Ed/X/RSA key serialisation (PKCS#8 + SPKI + SEC1) |
| `totp` | crypto/utils | TOTP RFC 6238 + HOTP RFC 4226 — time-based OTP codes |
| `webcryptoDigest` | crypto/webcrypto | Opt-in async SHA-1/256/384/512 over `crypto.subtle.digest` |
| `webcryptoHmac` | crypto/webcrypto | Opt-in async HMAC sign/verify (SHA-256/384/512 + SHA-1 legacy) |
| `webcryptoPbkdf2` | crypto/webcrypto | Opt-in async PBKDF2 deriveBits/deriveKey (default 600,000 iter) |
| `webcryptoHkdf` | crypto/webcrypto | Opt-in async HKDF deriveBits/deriveKey (RFC 5869) |
| `webcryptoAes` | crypto/webcrypto | Opt-in async AES-GCM/CBC/CTR + key generate/import/export |
| `webcryptoAesKw` | crypto/webcrypto | Opt-in async AES-KW key wrap/unwrap (RFC 3394) |
| `webcryptoRsa` | crypto/webcrypto | Opt-in async RSA-OAEP/PSS/PKCS1 + keypair generate/import/export |
| `webcryptoEcc` | crypto/webcrypto | Opt-in async ECDSA + ECDH (P-256/384/521), raw r\|\|s signatures |
| `webcryptoEd25519` | crypto/webcrypto | Opt-in async Ed25519 sign/verify + import/export (RFC 8032) |
| `webcryptoX25519` | crypto/webcrypto | Opt-in async X25519 key agreement + import/export (RFC 7748) |
| `wasmRuntime` | crypto/wasm | Shared WASM loader/marshalling adapter over `@awacloud/fw-wasm-crypto` (ABI, SIMD select, no-throw) |
| `wasmArgon2` | crypto/wasm | WASM Argon2id memory-hard KDF (RFC 9106) — opt-in accelerator |
| `wasmMlKem` | crypto/wasm | WASM ML-KEM keygen/encaps/decaps (FIPS 203) |
| `wasmMlDsa` | crypto/wasm | WASM ML-DSA keygen/sign/verify (FIPS 204) |
| `wasmSlhDsa` | crypto/wasm | WASM SLH-DSA keygen/sign/verify (FIPS 205) |
| `wasmSha3` | crypto/wasm | WASM SHA-3 / SHAKE (FIPS 202) |
| `wasmBlake2b` | crypto/wasm | WASM BLAKE2b keyed/unkeyed (RFC 7693) |
| `wasmChacha20poly1305` | crypto/wasm | WASM ChaCha20-Poly1305 AEAD (RFC 8439) |
| `wasmCmac` | crypto/wasm | WASM AES-CMAC (SP 800-38B / RFC 4493) |
| `wasmSha2` | crypto/wasm | WASM SHA-2 digests (FIPS 180-4) — Tier-2 fallback |
| `wasmHmac` | crypto/wasm | WASM HMAC over SHA-2 (FIPS 198-1) — Tier-2 fallback |
| `wasmPbkdf2` | crypto/wasm | WASM PBKDF2 (SP 800-132) — Tier-2 fallback |
| `wasmHkdf` | crypto/wasm | WASM HKDF (RFC 5869) — Tier-2 fallback |
| `wasmAes` | crypto/wasm | WASM AES-GCM/CBC/CTR software speed (SP 800-38A) — Tier-2 fallback |
| `wasmRsa` | crypto/wasm | WASM RSA-OAEP/PSS/PKCS1 (PKCS#1) — Tier-2 fallback |
| `wasmEcc` | crypto/wasm | WASM ECDSA + ECDH P-256/384/521 (FIPS 186-5 / RFC 6979) — Tier-2 fallback |
| `wasmEd25519` | crypto/wasm | WASM Ed25519 keygen/sign/verify (RFC 8032) — Tier-2 fallback |
| `wasmX25519` | crypto/wasm | WASM X25519 keygen/deriveBits key agreement (RFC 7748) — Tier-2 fallback |

## Key concepts

- [The module pattern (pure factory)](./guide/module-pattern.md) — including `version` (semver) and `type` (taxonomy) validated at register
- [Using workers](./guide/workers.md)
- [Rendering pipeline](./guide/rendering-pipeline.md)
- [Security (sanity)](./guide/security.md)

### Multi-version & discovery (runtime)

`runtime` natively supports multi-version coexistence of the same `name`: `resolve('foo')` returns the highest version (semver); `resolve('foo@1.0.0')` returns the exact version. `runtime.list({type, name, version})` enables filtered discovery. See [ModuleRuntime API](./api/core/runtime.md).

## Contributing a module

- [Full workflow](./guide/module-creation-workflow.md) — step-by-step plan (discovery → implementation → tests → doc → README cascade)
- [Test format](./guide/test-format.md)
- [Documentation format](./guide/doc-format.md)
