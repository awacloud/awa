# @awacloud/fw

> JavaScript browser framework — full stack control, security by default, zero npm dependencies.

`@awacloud/fw` is a standalone framework for websites and web applications of moderate complexity. It takes the opposite stance from the modern toolchain (mandatory bundler, opaque dependency tree, supply chain to audit) by providing **202 autonomous modules** (`src/core/modules.js` registry, measured) organised around an explicit resolution runtime and a global-lockdown layer that runs **before any other code**.

For complex multi-screen applications, fw serves as the foundation for the `sd-common` layer (app patterns) and `sde`/`sdc` (multi-app / mono-app runtimes).

## Why `@awacloud/fw`

| Concern | fw's answer |
|---|---|
| **Supply chain** | Zero external dependencies. Everything is read, audited, and written in this repo. |
| **JS attack surface** | `sanity/base.js` blocks `eval`, `Function`, `Reflect`, `Math.random`, `crypto.randomUUID`, `performance.now`, `history.pushState/replaceState`; redirects `innerHTML` → `innerText`; freezes native prototypes. Loaded **before** any other script. The `sanity/lockdown` tier adds SES-grade transitive freezing of the intrinsic graph. |
| **Mandatory bundler** | None. Import-map in dev; in prod, `sanity.min.js` (classic, loaded first) plus one or more ESM `fw.<preset>.min.js` bundles per the chosen preset. |
| **Blind tree-shaking** | Strict factory pattern: each module declares its dependencies. The runtime resolves on demand. No module is loaded until requested. |
| **Workers as second-class citizens** | Serializable factories (`.toString()` → string sendable to the worker). Every module flagged `worker-safe` instantiates identically in a worker. |
| **Browser cryptography** | Own implementations of SHA-2/3, AES modes, ChaCha20-Poly1305, RSA, Ed25519/X25519, ML-KEM, ML-DSA, SLH-DSA, plus a WebCrypto tier and a WASM tier. **Early release**: the tier is validated against the NIST ACVP / RFC vectors listed in [`src/crypto/NIST_CONFORMANCE.md`](./src/crypto/NIST_CONFORMANCE.md) and is scheduled for a full rework against the `service-acvp` harness in the next program; treat it as pre-audit software. |
| **DOM clobbering, XSS** | `parser → render → template → uiSession` pipeline with explicit sanitisation, URL attribute allowlist, CSP-nonce, silent redirection of dangerous sinks. |

## Use cases

### Static website

Global locking, DOM helpers, hash-based routing, i18n, forms, accessibility, animations. No bundler.

Paths below assume `node_modules/` is reachable from the HTTP docroot (the
default after `npm install`); adjust the prefix to wherever you serve
`node_modules/@awacloud/fw/` from.

```html
<!doctype html>
<script src="/node_modules/@awacloud/fw/dist/build/sanity.min.js"></script>       <!-- lock before any JS -->
<script type="importmap">
{ "imports": { "@awacloud/fw": "/node_modules/@awacloud/fw/src/main.js" }}
</script>
<script type="module">
    import fw from '@awacloud/fw';
    import modules from '@awacloud/fw/core/modules.js';
    const { runtime, domReady } = fw;
    runtime.registerAll(modules);

    const route = runtime.resolve('route');
    const i18n = runtime.resolve('i18n');

    route.on('home', '/', () => render('home'));
    route.on('contact', '/contact', () => render('contact'));

    domReady.loaded(() => route.start());
</script>
```

### Web application (SPA / multi-view)

Declarative rendering pipeline, reactive state (`signal`), event bus, virtual lists, scoped UI sessions, SSR hydration.

```js
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';
const { runtime } = fw;
runtime.registerAll(modules);

const tpl = runtime.resolve('template');
const uiSession = runtime.resolve('uiSession');   // factory: (containerName) => UISession
const signal = runtime.resolve('signal');
const ajax = runtime.resolve('ajax');             // factory: (baseUrl?, defaults?) => AjaxInstance
tpl.init('todos', { to: '#app' });
const ui = uiSession('todos');
const items = signal.create([]);

ui.add([{ id: 'list', block: ui.parse('<ul>${items}</ul>'), data: {} }]);
const rows = ui.list('list', 'items', { keyFn: i => i.id, block: ui.parse('<li>#{title}</li>') });
items.subscribe(data => rows.sync(data));
items.set(await ajax(location.origin).get('/api/todos', { type: 'json' }));
```

### Offline app / PWA

Service worker, IndexedDB, BroadcastChannel, Cache API, push notifications, background sync, multi-tab leader election.

```js
const sw = runtime.resolve('serviceWorker');
const idb = runtime.resolve('indexedDB');
const leader = runtime.resolve('leaderElection');

await sw.register('/sw.js');
const db = await idb.open('app', 1, (d) => { d.createObjectStore('inbox', { keyPath: 'id' }); d.createObjectStore('outbox', { keyPath: 'id' }); });
leader.create({ channel: 'sync-leader' }).onLeader(() => syncOutbox(db));
```

### High-requirement app (crypto / workers)

E2EE, signatures, hashing, post-quantum, parallel workers with RPC.

```js
const ed = runtime.resolve('ed25519');
const aead = runtime.resolve('chacha20poly1305');
const worker = fw.createWorker(
    function ({ libs, args }) {
        const sig = libs.ed25519.sign(args[0], args[1]);
        self.postMessage(sig);
    },
    { dependencies: ['ed25519'], args: [secretKey, message] }   // ed25519.sign(privateKey, message)
);
```

## Architecture

```
sanity/         global and prototype lockdown (loaded FIRST)
  base.js       blocks eval/Function/Reflect/random; freezes prototypes
  community.js  framework-friendly degraded layer (optional)
  lockdown.js   SES-grade integrity tier (composes base.js); lockdown-apply.js self-applies it; wasm-gate.js gates WebAssembly

core/           runtime, logger, readyState, worker-helper, modules (barrel)
process/        message, rpc, workerPool — inter-context communication

io/             DOM-free primitives
  binary, calc, codec, compress, i18n, math,
  structures, sync, text, time, timing, utils

crypto/         FIPS / RFC primitives, post-quantum ML-*, SLH-DSA
  cipher, hash, mode, pkc, utils, webcrypto, wasm

dom/            everything touching the DOM
  display, fs, lifecycle, net, query,
  rendering, sensors, sw, utils
```

Each module follows the strict factory pattern:

```js
export const myModule = {
    name: 'myModule',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: ['hex', 'utf8'],
    factory({ hex, utf8 }) {
        return {
            encode: (s) => hex.fromBytes(utf8.toBytes(s)),
        };
    },
};
```

The `factory` is called **once** by the runtime, after dependency resolution. The body of `factory` must be self-contained (no references to module-scope bindings) to remain serializable to a Worker.

## Installation

```bash
npm install @awacloud/fw
```

### Statically served HTML

```html
<script src="/node_modules/@awacloud/fw/dist/build/sanity.min.js"></script>
<script type="importmap">
{ "imports": {
    "@awacloud/fw":  "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/": "/node_modules/@awacloud/fw/src/"
}}
</script>
<script type="module">
    import fw from '@awacloud/fw';
    // ...
</script>
```

## Production build

The `sanity.min.js` bundle is **always isolated** and loaded as a classic script to guarantee the lockdown runs before any other code, without depending on the `defer` of modules or the import map. The rest of the framework is served via one (or more) ESM bundle built according to the chosen preset.

### Build presets

Six cascading prebuilt presets (`minimal ⊂ core ⊂ site ⊂ site-interactive ⊂ spa ⊂ pwa`), defined in **`fw.config.json`** (package root). Each preset can be emitted in two variants:

- **pure** (default) — ESM-only, no side effects (`<script type="module">`, strict CSP, audit, embed).
- **classic** — automatically attaches `fw` to `globalThis.fw` (useful for non-module `<script>`).

See [`docs/tools/bundler.md`](./docs/tools/bundler.md) for the full list, CLI flags, and the procedure for adding a preset.

| Preset              | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `minimal`           | Core runtime only (0 fw modules).                                                                          |
| `core`              | Shared glue (`errors`, `eventBus`, `signal`, `valid`, `ui8`, `abort`, `clock`).                            |
| `site`              | `core` + DOM/render/route/a11y/essential codecs/i18n. Static site.                                         |
| `site-interactive`  | `site` + AJAX, components, forms, UI structures, interactions. Dynamic site.                               |
| `spa`               | `site-interactive` + virtualScroll, chart, IndexedDB, workers, math, binary codecs. Reactive SPA.          |
| `pwa`               | `spa` + service worker, cache, push, fsAccess, broadcastChannel, gzip/deflate. Offline app.                |

```sh
bun run prebuild                       # all (presets + side-bundles + sanity)
bun run prebuild:presets               # all presets
bun run prebuild:side-bundles          # all side-bundles
bun run prebuild:minimal               # targeted build
bun run prebuild:core
bun run prebuild:site
bun run prebuild:site-interactive
bun run prebuild:spa
bun run prebuild:pwa
bun run prebuild:sanity                # sanity.min.js only
```

Outputs in `dist/build/`:

- Presets: `fw.<preset>.{min.js,js,meta.json}` (classic) and `fw.<preset>.pure.{min.js,js,meta.json}` (pure).
- Packs (when `minimal` is built): `fw.pack.<group>.{min.js,js,meta.json}` and `fw.pack.<group>.pure.{min.js,...}` for `realtime`, `crypto-basic`, `crypto-identity`, `crypto-advanced`, `compress-heavy`, `sensors`, `text-advanced`, `structures-advanced`.

Typical HTML loading order — **classic** (simplest):

```html
<script src="/dist/build/sanity.min.js"></script>
<script type="module" src="/dist/build/fw.site.min.js"></script>
<script type="module" src="/dist/build/fw.pack.crypto-basic.min.js"></script>
<script type="module">
    const sha = window.fw.runtime.resolve('sha256');
</script>
```

**pure** variant (no global pollution, the user reassembles the pieces):

```html
<script src="/dist/build/sanity.min.js"></script>
<script type="module">
    import fw from '/dist/build/fw.site.pure.min.js';
    import cryptoModules from '/dist/build/fw.pack.crypto-basic.pure.min.js';
    fw.runtime.registerAll(cryptoModules);
    const sha = fw.runtime.resolve('sha256');
</script>
```

## Companion tools

Three helpers shipped with the package for specific use cases:

- **`fw-bundler standalone`** (`tools/fw-bundler`) — Generates a self-contained ESM file for any fw module (e.g. `aes_modes` without the framework). `bun run build:standalone <moduleName>`. Details: [docs/tools/standalone.md](./docs/tools/standalone.md).
- **`tools/rendering/precompilation/`** — Pre-compiles HTML templates into `ParseResult` JSON, importable directly at runtime (zero parsing cost at first-paint). `bun run build:parseresult <input>`. Details: [docs/tools/precompilation.md](./docs/tools/precompilation.md).
- **`tools/rendering/aot/`** — AOT-compiles HTML templates into imperative JS factory functions (direct DOM, no parser or renderer at runtime). `bun run build:aot <input>`. Details: [docs/tools/aot.md](./docs/tools/aot.md).

See [docs/tools/](./docs/tools/) for details on all three tools.

## Integrations

**Optional** bridges to the ecosystem, in a scope separate from the core ([`integrations/`](./integrations/README.md)) — `@awacloud/fw` remains dependency-free; each integration is opt-in.

| Category | Available |
|---|---|
| **Bundlers** (virtual modules `virtual:@awacloud/fw/preset/*`) | [Vite](./integrations/vite/README.md), [esbuild](./integrations/esbuild/README.md), [Rollup](./integrations/rollup/README.md), [Bun](./integrations/bun/README.md), [Webpack](./integrations/webpack/README.md), [Turbopack](./integrations/turbopack/README.md) |
| **Frameworks** | [Astro](./integrations/astro/README.md) (SSR + islands), [Next.js](./integrations/nextjs/README.md) (via the Webpack plugin), [NestJS](./integrations/nestjs/README.md) (environment-agnostic modules as Nest providers) |
| **Runtime targets** (compat pages, not plugins) | [Node.js](./integrations/nodejs/README.md), [Deno](./integrations/deno/README.md) |
| **Tests** | [Vitest](./integrations/vitest/README.md) (recommended, run the suite under Node), [Jest](./integrations/jest/README.md) |
| **Lint** | [ESLint](./integrations/eslint/) (rules encoding framework invariants) |
| **Docs** | [TypeDoc](./integrations/typedoc/README.md) (HTML API reference generated from the framework types) |
| **Node build** | backend [esbuild](./integrations/esbuild/README.md) / [Rollup](./integrations/rollup/README.md) — produces `dist/build/*` without bun |

Third-party tools (esbuild, rollup, vitest, …) are **not** committed dependencies: they are installed on demand (`bun run setup:e2e` / `setup:vitest`). See [dev runtime](./docs/dev/runtime.md) for the bun/Node choice.

## Security (`sanity` tiers)

New applications call `lockdown()` once at startup: in a browser realm it also applies the `base` DOM/XSS denylist, so `lockdown()` is a **superset** of `applyBase()` — there is no reason to call both.

```js
import { lockdown } from '@awacloud/fw/sanity/lockdown';
lockdown();   // default tier — composes base in a browser realm
```

`sanity/base.js` (composed by the default tier, or usable alone on hosts that patch prototypes) runs **before** any other script and enforces:

| API | Behaviour after lockdown |
|---|---|
| `eval`, `new Function`, `Reflect` (property access) | `throw` |
| `Math.random` | `throw` (force usage of `crypto.getRandomValues`) |
| `crypto.randomUUID` | `throw` (force usage of the framework's `uuid`, which is traceable) |
| `performance.now` | `throw` (timing vector — use the framework's `clock`) |
| `history.pushState`, `replaceState`, `go`, `back`, `forward` | `throw` (use the framework's `route`) |
| `Element.innerHTML`, `outerHTML`, `insertAdjacentHTML` (setters) | redirect to `innerText`/`outerText`/`insertAdjacentText` (no parse, no XSS) |
| Native prototypes (`Array.prototype`, `Object.prototype`, …) | `Object.freeze` |

Consequence: any third-party code attempting these APIs **fails loudly**, which is both a safety net and an incompatibility detector. The fw modules that need them (e.g. `uuid`, `route`, `clock`, `random`) go through controlled channels.

See [`docs/guide/security.md`](./docs/guide/security.md) for the full tier spectrum (`community` / `base` / `lockdown`) and [`docs/guide/worker-confinement.md`](./docs/guide/worker-confinement.md) for the confinement half (Workers, capability grants).

## Crypto tier — early release

- **Green today**: functional KAT against NIST ACVP / RFC vectors — see [`src/crypto/NIST_CONFORMANCE.md`](./src/crypto/NIST_CONFORMANCE.md); the PQC hybrid combiners additionally carry [`docs/evidence/pqc-hybrid-evidence.md`](./docs/evidence/pqc-hybrid-evidence.md).
- **Not claimed**: no constant-time attestation for the pure-JS tier, no third-party audit.
- **Rework**: the whole crypto tier is redone against a dedicated ACVP validation harness in the next program.
- **Recommendation**: prefer the WebCrypto tier (`crypto/webcrypto/`) where the browser natively provides the algorithm.

## Documentation

- [General index](./docs/README.md) — exhaustive module table
- [Module API reference](./docs/api/README.md) — one file per module, strict structure
- [Guides](./docs/guide/README.md) — concepts, patterns, recipes
- [DX sheets (`docs/dev/`)](./docs/dev/README.md) — running tests, bun/Node runtime, types
- [Integrations](./integrations/README.md) — bundlers, frameworks, runners
- [Security](./docs/guide/security.md) — sanity tier spectrum and honest threat model
- [NIST/RFC conformance](./src/crypto/NIST_CONFORMANCE.md) — crypto vector status

## Playground

Runnable examples for `@awacloud/fw` — see [`playground/README.md`](https://github.com/awacloud/awa/blob/main/packages/front/fw/playground/README.md) (not part of the published npm package; browse it in the source repository). Currently one axis: [`playground/integrations/`](https://github.com/awacloud/awa/blob/main/packages/front/fw/playground/integrations/README.md) (one example per integration). Serve the **package root** and open `/playground/`: `npx serve --no-clean-urls .`.

The `starters/` and `usecases/` axes (and the `create-fw-app` scaffolding CLI, currently parked) are planned to return after the first publication.

## Development & tests

`@awacloud/fw` is **self-contained**: the public monorepo (this package's directory) can be cloned and developed **standalone**, under **bun** (default dev runtime) or **Node** — tests, KAT and vectors included. The **published npm package is lean** (code + dist min + types) and does not ship the test suite; develop and audit against the source repository (see [publishing.md](docs/dev/publishing.md)).

```sh
cd packages/front/fw            # or the root of a standalone clone
bun install
bun run test                    # suite under bun (= bun test src/)
bun run setup:vitest && bun run test:vitest   # same suite under Node, without touching the tests
```

Detailed DX sheets in **[`docs/dev/`](docs/dev/README.md)**:

- [Running the tests](docs/dev/testing.md) — categories, extended crypto (`CRYPTO_FULL=1`), KAT/ACVP vectors.
- [Dev runtime — bun vs Node](docs/dev/runtime.md) — which task under which runtime, prerequisites, lean install policy.
- [Type generation](docs/dev/types.md) — `.d.ts`, typed registry, audit.

## Upper layers

`@awacloud/fw` is usable standalone. For more complex applications, the mono-repo provides:

- **`sd-common`** — application patterns above fw (auth flows, complex forms, etc.)
- **`sde`** — multi-application runtime (shell + embedded apps)
- **`sdc`** — mono-application runtime

Each layer **includes** fw; it does not replace it. A site with no application complexity can stop at fw.

## Licence

Apache-2.0 — see [`LICENSE`](./LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/fw`](https://github.com/awacloud/awa/tree/main/packages/front/fw)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each published release.
Both SBOM files are attached to the release as assets, and their SHA-256
digests are listed in the release's signed digest manifest.

Developed by AwaCloud.
