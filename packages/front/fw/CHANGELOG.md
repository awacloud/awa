# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Added

- **Module runtime** — DI factory container with lifecycle management
  (`core/runtime`), a structured logger (`core/logger`), a DOM-ready gate
  (`core/readyState`), a Worker-creation helper (`core/worker-helper`), and
  the module registry (`core/modules`).
- **Typed facade** (`@awacloud/fw/typed`) — a typed entry point layered
  over the same runtime for TypeScript consumers.
- **IO family** (`./io/*`) — binary reader/writer, codecs (hex, base64,
  base32, base58, UTF-8, CBOR, MessagePack, CSV, URL, MIME, XML),
  compression (LZ4, LZW, Huffman, Deflate, gzip, zlib, zip, Brotli), CRC
  and math utilities, an event bus, timing and rate-limiting, sync
  primitives (mutex, semaphore, channel, atomics), data structures (LRU
  cache, heap, ring buffer, trie, B-tree), i18n, text utilities, and
  linear-algebra/statistics/geometry helpers.
- **Crypto family** (`./crypto/*`) — 73 modules: symmetric ciphers (AES,
  ChaCha20) and modes (CBC, CTR, GCM, CMAC, key wrap, ChaCha20-Poly1305),
  hashes (SHA-2, SHA-3, BLAKE2b, Poly1305, Argon2), and public-key crypto
  (RSA, ECC, Ed25519, X25519, ML-KEM, ML-DSA, SLH-DSA, and hybrid
  constructions), plus supporting utilities (DRBG, bignum, ASN.1, PEM, JWS,
  UUID, TOTP).
- **WebCrypto and WASM tiers** — opt-in async wrappers over the browser's
  `crypto.subtle` (digest, HMAC, PBKDF2, HKDF, AES, RSA, ECC, Ed25519,
  X25519) and WASM-SIMD accelerators over `@awacloud/fw-wasm-crypto`
  (Argon2, ML-KEM, ML-DSA, SLH-DSA, SHA-3, BLAKE2b, ChaCha20-Poly1305,
  CMAC, plus a Tier-2 set mirroring the WebCrypto surface).
- **Process family** (`./process/*`) — typed cross-context messaging
  (`processMessage`), an RPC layer over it (`processRPC`), and a Worker
  pool (`workerPool`).
- **DOM family** (`./dom/*`) — rendering (virtual DOM parser/renderer,
  sanitizer, templating, theming, charting), query helpers (drag-and-drop,
  DOM utilities, events, gestures, media), storage (IndexedDB, `storage`,
  downloads, File System Access, remote store), networking (`ajax`,
  WebSocket, SSE, WebRTC, `BroadcastChannel`), sensors (geolocation,
  battery, network info), lifecycle (visibility, idle, wake lock), and
  Service Worker integration (background sync, cache, push, shared
  worker).
- **Security lockdown** (`./sanity/*`) — three composable tiers (`base`,
  `community`, `lockdown`) hardening the DOM/XSS surface up to SES-grade
  realm integrity.
- **Bundler and test-runner integrations** (`./vite`, `./esbuild`, …) —
  first-party plugins for Vite, esbuild, Rollup, Webpack, Bun, Astro,
  Next.js, Turbopack and NestJS, plus Vitest/Jest compatibility shims.
- **Prebuilt bundles and types** (`dist/build`, `dist/types`, `types/`) —
  minified preset bundles (core, minimal, site, SPA, PWA, full) and
  generated `.d.ts` declarations for the full public surface.

### Changed

- **Compression primitives rewritten clean-room** — `io/compress/huffman`,
  `bitstream` (RFC 1951 §3.1.1/§3.2.2, RFC 7932) and `lz4` (LZ4 Block Format)
  re-implemented from the specifications with byte-identical public APIs
  except an additive lz4 option (below); the fflate- and node-lz4-derived
  code is gone; `huffman.buildTree` no longer caps frequency sums.
  Benchmarks in each module's doc page.
- **Provenance** — SJCL-derived crypto files (`aes`, `sha256`, `sha512`,
  `ecc`, `bitArray`, `bn`) now state their BSD-2-Clause origin; the
  public-domain-era wording was withdrawn (see `docs/dev/provenance.md`).
- **lz4 compression modes** — `compress(src, len, opts?)` and
  `Lz4CompressStream(ondata, opts?)` take `opts.mode`: `'speed'` (default) or
  `'ratio'` (denser output, slower encode); an unknown mode throws
  `RangeError`. The default lz4 output bytes differ from the previous
  release (never larger on the benchmark corpora); `decompress` is
  unchanged.

### Fixed

- **brotli** — the decoder mis-decoded prefix codes longer than 9 bits (a
  16-bit peek window), and the encoder could emit an empty trailing command
  after static-dictionary substitution; realistic inputs now round-trip and
  interoperate with reference implementations.
