# Integration with bundlers

`@awacloud/fw` works in two modes — pick the one that matches your project.

| Mode | Entry | Build needed | When to pick |
|---|---|---|---|
| **Autonomous** | `@awacloud/fw` (default) | No | Static `<script type="module">`, no toolchain. Ship the whole catalogue or a pre-built standalone bundle from `dist/build/`. |
| **Bundler-integrated** | `@awacloud/fw/vite` (virtual modules) **or** direct subpath imports | Yes (Vite / Webpack / Rollup / esbuild) | You compose the runtime selectively, tree-shake aggressively, ship multiple chunks. |

The two modes coexist — choose per-project, not per-package.

`main.js` exports the core symbols (`ENV`, `log`, `runtime`, `createWorker`,
`domReady`) **without** registering any module. The user wires modules
explicitly. That single rule is what makes both modes work from the same
entry.

---

## Mode 1 — Autonomous (no build)

```html
<script type="module">
    import fw from 'https://example.cdn/@awacloud/fw';
    import modules from 'https://example.cdn/@awacloud/fw/core/modules.js';

    fw.runtime.registerAll(modules);

    fw.domReady.loaded(() => {
        const hex = fw.runtime.resolve('hex');
        console.log(hex.fromBytes(new Uint8Array([72, 105])));
    });
</script>
```

- `core/modules.js` has a single `default export [...]` listing every module.
  No named exports — `import { sanitize } from '@awacloud/fw/core/modules'` is
  **not** supported.
- `window.console` is replaced by the framework logger when `@awacloud/fw` is
  imported (side-effect of `main.js` → `logger.main`) — in a browser. Under
  bare Node (no `window`), the same import instead operates directly on
  `globalThis.console` and skips the Proxy install, so a Node-side SSR/tooling
  script can import `@awacloud/fw` without throwing.
- No tree-shaking — `registerAll(modules)` references every binding statically.

For zero-config consumers, a pre-built standalone is available at
`@awacloud/fw/dist/build/<preset>.js` (built by `tools/fw-bundler` (`bundle`)). Two variants exist
per preset :

| Variant | What it does | When |
|---|---|---|
| `pure` (default) | ESM only — `export { ENV, log, runtime, ... }`. | Modern apps, ESM consumers. |
| `classic` (opt-in per preset in `fw.config.json`) | ESM **plus** attaches `globalThis.fw = { ... }` for legacy `<script>` consumers. | Pages that mix module / non-module scripts. |

Beyond the curated presets, the synthetic `full` preset bundles **every**
module under `src/`. It is generated from the source-tree catalog at build
time — `fw.config.json` does not list it.

---

## Mode 2 — Vite (recommended)

```bash
npm i @awacloud/fw
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import fw from '@awacloud/fw/vite';

export default defineConfig({
    plugins: [
        fw({
            preset: 'site-interactive',
            sideBundles: ['crypto-basic'],
            sanity: 'base'
        })
    ]
});
```

```js
// src/main.js
import { runtime } from 'virtual:@awacloud/fw/preset/site-interactive';
const hex = runtime.resolve('hex');

async function onLogin() {
    const cryptoBasic = await import('virtual:@awacloud/fw/side-bundle/crypto-basic');
    cryptoBasic.install(runtime);
    const hmac = runtime.resolve('hmac');
    // ...
}
```

The plugin reads `fw.config.json` (the single source of truth for
presets and side-bundles) so the bundler output stays in sync with the
autonomous build.

See [`integrations/vite/README.md`](../../integrations/vite/README.md) for the
full plugin reference.

---

## Mode 2 — Manual composition (any bundler)

A plugin equivalent to the Vite one is planned for Webpack / Rollup /
esbuild. Until then — and any time you want maximal tree-shaking — compose
the runtime by hand using **direct subpath imports** :

```js
// src/main.js
import { ModuleRuntime } from '@awacloud/fw/core/runtime';
import { hex }      from '@awacloud/fw/io/codec/hex.js';
import { b64 }      from '@awacloud/fw/io/codec/b64.js';
import { utf8 }     from '@awacloud/fw/io/codec/utf8.js';
import { url }      from '@awacloud/fw/io/codec/url.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';

export const runtime = new ModuleRuntime();
runtime.registerAllDeep([hex, b64, utf8, url, sanitize]);
// → Rollup/Webpack pull in parser.js, render.js, secPolicy.js automatically
//   because each module's source file statically imports its siblings, and
//   the `deps` array mirrors those imports for `registerDeep` to walk.
```

Each subpath maps to `package.json#exports` :

| You import                                     | Resolves to                       |
|------------------------------------------------|-----------------------------------|
| `@awacloud/fw/core/runtime`                         | `src/core/runtime.js`             |
| `@awacloud/fw/io/codec/hex.js`                      | `src/io/codec/hex.js`             |
| `@awacloud/fw/dom/rendering/sanitize.js`            | `src/dom/rendering/sanitize.js`   |
| `@awacloud/fw/crypto/hash/sha256.js`                | `src/crypto/hash/sha256.js`       |
| `@awacloud/fw/process/rpc.js`                       | `src/process/rpc.js`              |

The `.js` extension is required for the `io/`, `dom/`, `crypto/`, `process/`
wildcard exports — drop it for the explicit `core/*` entries
(`@awacloud/fw/core/runtime`, `@awacloud/fw/core/logger`, …).

### Side-effecting modules

These paths have side effects (do **not** rely on tree-shaking to remove them) :

- `@awacloud/fw` (default entry — runs `logger.main` which replaces `window.console`)
- `@awacloud/fw/core/logger`
- `@awacloud/fw/dist/build/sanity-*-classic.min.js` (pre-built classic artifacts, self-applying on load)
- `@awacloud/fw/dist/build/*` (other pre-built standalone bundles)

Note: `@awacloud/fw/sanity/base` and `@awacloud/fw/sanity/community` are now **explicit-call ES modules** and are **not** side-effecting — they must be imported and called explicitly. The classic artifacts (`dist/build/sanity-*-classic.min.js`) are the pre-built side-applying variants.

`fwTurbopack()` computes its `resolveAlias` in memory; materialization
(`rmSync`+`mkdirSync`+writes into `outDir`, default `.fw-virtual` under
`process.cwd()`) happens lazily on first read of `resolveAlias` (property
access, `Object.keys`, spread) or via `materialize()`; pass an absolute
`outDir` you own. The other adapters (`vite`, `esbuild`, `rollup`, `webpack`,
`bun`) only read config.

---

## How tree-shaking actually works

Tree-shaking happens **at the preset / composition level**, not within a
preset. Once `registerAllDeep([a, b, c])` is reached, Rollup sees a static
reference to every binding in the array — it cannot drop `c` because
`runtime.resolve('c')` is never called downstream.

Three levels of granularity, from coarsest to finest :

| Pattern | What ends up in the bundle |
|---|---|
| `virtual:@awacloud/fw/preset/<name>` (Vite plugin) | The modules declared in the preset + their transitives via `deps`. **Tree-shaking is preset-vs-preset** — picking `core` instead of `spa` saves modules ; selecting a subset of `spa` does not. |
| Manual composition (direct subpath imports + `registerDeep`) | Only the modules you import + their transitives. **Maximal tree-shaking.** Recommended when bundle size matters. |
| `virtual:@awacloud/fw/preset/full` | Every module under `src/` (~180) + their transitives. Demo / audit / "see everything" — **not for production**. |

Inside any single level, the `deps` field on each module declares the direct
JS references its source file imports. `registerDeep` walks that graph
depth-first to guarantee dependencies are registered before their dependents
— it does **not** prune unused modules from the input array.

---

## Conditional exports

The package declares `browser`, `worker`, `import`, and `default` conditions.
Bundlers pick the right path automatically :

- `"browser"` is preferred by Vite / Webpack / Rollup with the browser target.
- `"worker"` is matched by bundlers configured to build Web Workers.
- `"import"` is used by Node ESM.
- `"default"` is the fallback.

DOM-specific paths (`@awacloud/fw/dom/*`) carry a `browser` condition only — Node
consumers receive an `ERR_PACKAGE_PATH_NOT_EXPORTED` to fail fast.
