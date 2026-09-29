---
module: modules
category: core
dependencies: []
returns: object
worker-safe: true
status: complete
---

# modules

> Aggregated catalogue exported as `default` — flat array of all ~175 fw module descriptors, to pass to `runtime.registerAll(...)`.

**Module** `modules` | **Source** `packages/front/fw/src/core/modules.js` | **Deps** none | **Worker-safe** yes (individual descriptors remain worker-safe according to their own status)

`src/core/modules.js` is not a module in the runtime sense (no `name`, `factory`, `dependencies`) — it is not resolved via `runtime.resolve()`. Its role is to import each framework module and export the flat array (`export default [...]`) to facilitate batch registration via `runtime.registerAll(...)` (or `runtime.registerAllDeep(...)`).

> **Recent change** — this file no longer exposes **named exports**. `import { sanitize } from '@awacloud/fw/core/modules.js'` is broken. For an isolated module, use the direct subpath: e.g. `import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js'`.

## Resolve

```js
// This file is not a runtime module — import its default:
import modules from '@awacloud/fw/core/modules.js';

import fw from '@awacloud/fw';
fw.runtime.registerAll(modules);
// (or fw.runtime.registerAllDeep(modules) if you want to traverse the `deps` field)
```

## API

This file provides no API of its own. Its sole export is an **array** of module descriptors, in a deterministic order.

| Export | Description |
|--------|-------------|
| `default` | `ModuleDefinition[]` — concatenation of all fw descriptors |

### Catalogue (summary by category)

| Descriptor | Category | Short description |
|-------------|-----------|-------------------|
| `processMessage` | process | Inter-worker message routing |
| `processRPC` | process | Promise-based RPC over MessageChannel |
| `workerPool` | process | Homogeneous worker pool |
| `clock`, `rateLimit`, `scheduler` | io/timing | Timers, rate limiting, scheduling |
| `sse`, `webrtc`, `broadcastChannel`, `network` | dom/net | Real-time networking |
| `backgroundSync`, `cache`, `push`, `serviceWorker`, `sharedWorker` | dom/sw | Service Workers |
| `date` | io/time | Date manipulation |
| `i18n` | io/i18n | Internationalisation |
| `ansi`, `htmlEntities`, `semver`, `str`, `unicode` | io/text | Text manipulation |
| `lruCache`, `heap`, `ringBuffer`, `trie`, `btree`, `treeWalker` | io/structures | Data structures |
| `abort`, `mutex`, `semaphore`, `channel`, `atomics`, `cancellable`, `tokenBucket` | io/sync | Synchronisation |
| `binaryReader`, `binaryWriter` | io/binary | Binary read/write |
| `easing`, `crc32`, `adler32`, `bigint` | io/calc | Calculations |
| `linalg`, `stats`, `geom`, `interp`, `fixedPoint` | io/math | Mathematics |
| `geolocation`, `battery`, `networkInfo`, `sensors` | dom/sensors | Sensors |
| `a11y`, `focus`, `form`, `keybindings`, `leaderElection`, `notifications`, `permissions`, `route`, `webauthn` | dom/utils | DOM utilities |
| `visibility`, `idle`, `wakeLock` | dom/lifecycle | Page lifecycle |
| `lz4`, `deflate`, `gzip`, `zlib`, `zip`, `brotli`, ... | io/compress | Compression (12 exports) |
| `b64`, `base32`, `base58`, `buffer`, `cbor`, `csv`, `hex`, `mime`, `msgpack`, `url`, `utf8`, `xml` | io/codec | Codecs |
| `errors`, `eventBus`, `bitmap`, `queue`, `signal`, `ui8`, `uuid`, `valid` | io/utils | Miscellaneous utilities |
| `chart`, `component`, `parser`, `render`, `sanitize`, `secPolicy`, `template`, `themeTokens`, `devtools`, `uiSession`, `uiSessionCore`, `uiSessionDirect`, `uiSessionList`, `virtualScroll` | dom/rendering | UI rendering |
| `dnd`, `dom`, `events`, `gesture`, `media` | dom/query | DOM query |
| `animate`, `fullscreen` | dom/display | Display |
| `download`, `fsAccess`, `indexedDB`, `remoteStore`, `storage` | dom/fs | Files / storage |
| `ajax`, `ws` | dom/net | Classic networking |
| `entropyCollector`, `clipboard`, `ua` | dom/utils | Browser utilities |
| `bitArray`, `asn1`, `asn1Oid`, `pem`, `aes_modes`, `bn`, `pad`, `random`, `aes_ctr` | crypto/utils | Cryptographic utilities |
| `sha256`, `sha224`, `sha512`, `sha512_224`, `sha512_256`, `sha384`, `hmac`, `pbkdf2`, `hkdf`, `sha3`, `adf`, `poly1305`, `blake2b`, `argon2` | crypto/hash | Hashing |
| `aes`, `chacha20` | crypto/cipher | Symmetric encryption |
| `ctr`, `cbc`, `gcm`, `cmac`, `kw`, `chacha20poly1305` | crypto/mode | Cipher modes |
| `ecc`, `x25519`, `ed25519`, `rsa`, `ml_kem`, `ml_dsa`, `slh_dsa` | crypto/pkc | Asymmetric cryptography |
| `jws`, `keyformat`, `totp` | crypto/utils | JWS, key formats, TOTP |

## Examples

### Register all fw modules in one line

```js
import modules from '@awacloud/fw/core/modules.js';
import fw from '@awacloud/fw';

fw.runtime.registerAll(modules);
// All modules are now resolvable via fw.runtime.resolve(...)
```

Or starting from a bare runtime:

```js
import modules from '@awacloud/fw/core/modules.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime';

const runtime = new ModuleRuntime();
runtime.registerAll(modules);
```

### Selective imports for tree-shaking

The `modules.js` file references **all** descriptors: using `registerAll(modules)` prevents Rollup/esbuild from eliminating those that are never resolved. For a minimal bundle, import each module **by its subpath** and compose manually (ideally via `registerDeep` to pull its transitive dependencies via the JS import graph):

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

const runtime = new ModuleRuntime();
runtime.registerDeep(sanitize); // pulls parser, render, secPolicy, ... via JS imports
const s = runtime.resolve('sanitize');
```

## Notes

- The file only executes static `import` statements (no invocation side-effects), but loads **all** descriptors — tree-shaking cannot remove even one once `registerAll(modules)` is called.
- Modules commented with `/* dev_only */` are not included in the array in production (sources commented out by `tools/fw-bundler/src/bundle/lib/strip-dev.js`).
- Each descriptor retains its own `worker-safe` declaration — some (e.g. `dom`, `template`) are not usable inside a Worker.
- The exact number of descriptors may vary as the framework evolves — refer to the source for the exhaustive list.
- For an isolated import, **use the canonical subpath** (`@awacloud/fw/dom/rendering/sanitize.js`, `@awacloud/fw/io/codec/hex.js`, …) rather than reintroducing a barrel.

## See also

- [runtime](./runtime.md) — module registration and resolution
- [worker-helper](./worker-helper.md) — automatic module serialisation for workers
- [process/README](../process/README.md) — process modules
