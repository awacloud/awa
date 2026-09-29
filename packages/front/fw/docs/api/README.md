# API Reference

Complete reference for all framework modules and APIs.

| Section | Modules |
|---------|---------|
| [Entry points](./core/main.md) | `main` (the `@awacloud/fw` default + named exports — [main](./core/main.md)), [typed](./typed.md) (`@awacloud/fw/typed`: `asTyped`, `createRuntime`) |
| [Core](./core/README.md) | `runtime`, `logger`, `readyState` (domReady), `worker-helper` (createWorker), `modules` |
| [IO / Binary](./io/binary/README.md) | `binaryReader`, `binaryWriter` |
| [IO / Codec](./io/codec/README.md) | `hex`, `b64`, `base32`, `base58`, `utf8`, `buffer`, `cbor`, `msgpack`, `csv`, `url`, `mime`, `xml` |
| [IO / Compress](./io/compress/README.md) | `lz4`, `lzw`, `bitstream`, `huffman`, `lz77`, `deflate`, `gzip`, `zlib`, `zip`, `brotli`, `brotliShared`, `brotliFrame`, `brotliDict`, `brotliDictWords` |
| [IO / Calc](./io/calc/README.md) | `crc32`, `adler32`, `easing`, `bigint` |
| [IO / Utils](./io/utils/README.md) | `eventBus`, `queue`, `bitmap`, `ui8`, `frame`, `valid` |
| [IO / Timing](./io/timing/README.md) | `rateLimit`, `scheduler` |
| [IO / Sync](./io/sync/README.md) | `abort`, `mutex`, `semaphore`, `channel`, `atomics`, `cancellable`, `tokenBucket` |
| [IO / Structures](./io/structures/README.md) | `lruCache`, `heap`, `ringBuffer`, `trie`, `btree`, `treeWalker` |
| [IO / Time](./io/time/README.md) | `date` |
| [IO / i18n](./io/i18n/README.md) | `i18n` |
| [IO / Text](./io/text/README.md) | `ansi`, `semver`, `str`, `unicode`, `htmlEntities` |
| [IO / Math](./io/math/README.md) | `linalg`, `stats`, `geom`, `interp`, `fixedPoint` |
| [Crypto](./crypto/README.md) | **73 modules**: `aes`, `chacha20`, hashes (SHA-2/3, BLAKE2b, Poly1305, Argon2), modes (CBC/CTR/GCM/CMAC/KW + ChaCha20-Poly1305), PKC (RSA, ECC, Ed25519, X25519, ML-KEM, ML-DSA, SLH-DSA, hybridKem X-Wing, hybridSign composite), utils (random DRBG, rsaKeygen, bn, bitArray, pad, pem, asn1, asn1Oid, keyformat, jws, aes_modes, aes_ctr, uuid, totp), [WebCrypto](./crypto/webcrypto/README.md) (10 opt-in async `crypto.subtle` wrappers: digest, hmac, pbkdf2, hkdf, aes, aeskw, rsa, ecc, ed25519, x25519), [WASM](./crypto/wasm/README.md) (18 opt-in async WASM-SIMD accelerators over `@awacloud/fw-wasm-crypto`: runtime + argon2, ml_kem, ml_dsa, slh_dsa, sha3, blake2b, chacha20poly1305, cmac + Tier-2 sha2, hmac, pbkdf2, hkdf, aes, rsa, ecc, ed25519, x25519) |
| [Process](./process/README.md) | `processMessage`, `processRPC`, `workerPool` |
| [DOM / Rendering](./dom/rendering/README.md) | `parser`, `render`, `sanitize`, `template`, `themeTokens`, `uiSession`, `virtualScroll`, `chart` |
| [DOM / Query](./dom/query/README.md) | `dnd`, `dom`, `events`, `gesture`, `media` |
| [DOM / Display](./dom/display/README.md) | `animate`, `fullscreen` |
| [DOM / FS](./dom/fs/README.md) | `indexedDB`, `storage`, `download`, `fsAccess`, `remoteStore` |
| [DOM / Net](./dom/net/README.md) | `ajax`, `ws`, `sse`, `webrtc`, `broadcastChannel`, `network` |
| [DOM / Utils](./dom/utils/README.md) | `entropyCollector`, `clipboard`, `ua`, `permissions`, `notifications`, `focus`, `keybindings`, `leaderElection`, `webauthn` |
| [DOM / Sensors](./dom/sensors/README.md) | `geolocation`, `battery`, `networkInfo`, `sensors` |
| [DOM / Lifecycle](./dom/lifecycle/README.md) | `visibility`, `idle`, `wakeLock` |
| [DOM / SW](./dom/sw/README.md) | `backgroundSync`, `cache`, `push`, `serviceWorker`, `sharedWorker` |
| [Sanity](./sanity/base.md) | Security lockdown — [base](./sanity/base.md) (ESM, explicit call `applyBase()`, DOM/XSS denylist), [community](./sanity/community.md) (ESM, explicit call `applyCommunity()`, framework-friendly denylist), [lockdown](./sanity/lockdown.md) (ESM, explicit call `lockdown()`, SES-grade integrity + WebAssembly capability seam) · [lockdown.apply](./sanity/lockdown.md) (`@awacloud/fw/sanity/lockdown.apply` — self-applying wrapper, **documented by reference** inside the lockdown page; no separate page by design) · default tier: `lockdown()` (see [guide/security.md](../guide/security.md) § Recommended default) |
| Integrations | **Mirror boundary — declared.** The 11 `integrations/*` export keys (`./vite`, `./esbuild`, `./rollup`, `./bun`, `./webpack`, `./astro`, `./vitest/shim`, `./jest/shim`, `./next`, `./turbopack`, `./nest`) are bundler/test-runner adapters documented by their own `integrations/<name>/README.md` and by [Integration guide](../guide/integration-bundlers.md); they are not mirrored under `docs/api/` |
