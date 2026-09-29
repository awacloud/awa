# `tools/fw-bundler` (`bundle`) — Prebuild

> Mutualized: the implementation no longer lives
> under `packages/front/fw/tools/build/bundler/` — it was ported
> logic-verbatim to the repo-level `tools/fw-bundler` package
> (`tools/fw-bundler/src/bundle/`), consumed here as a devDependency
> (`@awacloud/tool-fw-bundler`) and invoked via its `fw-bundler bundle` bin.

## Purpose

Zero-dependency prebuild orchestrator based on `Bun.build`. Produces minified/unminified ESM bundles for the presets and side-bundles declared in **`fw.config.json`**, as well as `sanity.min.js`.

## CLI usage

```sh
bun run prebuild                       # everything (presets + side-bundles + sanity)
bun run prebuild:presets               # all presets (no side-bundles)
bun run prebuild:side-bundles          # all side-bundles
bun run prebuild:minimal               # a specific preset
bun run prebuild:core
bun run prebuild:site
bun run prebuild:site-interactive
bun run prebuild:spa
bun run prebuild:pwa
bun run prebuild:sanity                # only sanity.min.js
```

Direct form:

```sh
fw-bundler bundle [target] [flags]             # from the package root
```

`target` can be:
- A preset name (`minimal`, `core`, `site`, …)
- A side-bundle name (`crypto-basic`, `realtime`, …)
- `presets` — all presets only
- `side-bundles` — all side-bundles only
- `all` (default) — everything

### Flags

| Flag                | Effect |
| ------------------- | ------ |
| `--dev`             | `ENV.DEV = true` and preserves `/* dev_only */` blocks. |
| `--no-log`          | `ENV.LOG = false` — no main logger. |
| `--no-sanity-log`   | Patches `sanity/base.js` with `LOG_ATTEMPTS = false` (silent in production). |
| `--sanity-only`     | Builds only `dist/build/sanity.min.js`. |
| `--no-sanity`       | Does not emit `sanity.min.js`. |
| `--config <path>`   | Overrides the path to `fw.config.json`. |
| `--classic`         | Forces emission of the `classic` variant on **all** targets in the run (union with the config's `variants`). |
| `--endpoint <name>` | Name of the global property attached by the `classic` variant (overrides config; default `fw`). |
| `--backend <name>`  | Build backend: `bun` (default under bun), `esbuild` or `rollup` (Node-capable). Auto-selected if omitted. |

## Build backends (bun by default, or Node)

The builder drives `Bun.build`/`Bun.gzipSync` via a **selector** (`lib/bundler.js`) with a single contract. Three backends:

| Backend | Runtime | Selection |
|---|---|---|
| `bun` | bun | default under bun |
| `esbuild` | Node (recommended) | `--backend esbuild` / `FW_BUILD_BACKEND` / auto if bun absent |
| `rollup` | Node (alternative, + terser) | `--backend rollup` |

To produce `dist/build/*` **under pure Node** (without bun):

```sh
bun run setup:e2e         # installs esbuild (and rollup/terser) on demand
bun run prebuild:node     # = node ../../../tools/fw-bundler/src/bundle/index.js --backend esbuild
# rollup alternative:
node ../../../tools/fw-bundler/src/bundle/index.js --backend rollup
```

> Under Node, target `index.js` explicitly (`node .../bundle/index.js`), not the directory — otherwise the `isMainModule` guard does not execute `main()`. Under bun, the declared `fw-bundler bundle` bin is enough. Details: [`../dev/runtime.md`](../dev/runtime.md), backends [esbuild](../../integrations/esbuild/README.md) / [rollup](../../integrations/rollup/README.md).

## Configuration

The configuration lives in **`fw.config.json`**. Single source of truth, consumed by the self-contained build **and** by the Vite plugin — no risk of drift.

Shape:

```json
{
    "defaults": {
        "variants": ["pure"]
    },
    "presets": {
        "minimal": {
            "description": "...",
            "modules": []
        },
        "core": {
            "description": "...",
            "modules": ["errors", "eventBus", "..."]
        },
        "site": {
            "extends": "core",
            "modules": ["dom", "events", "..."],
            "variants": ["pure", "classic"]
        }
    },
    "sideBundles": {
        "realtime": {
            "description": "...",
            "modules": ["ws", "sse", "webrtc"]
        }
    }
}
```

**Cascading** via the `extends` field (cycle-detected). The preset inherits the parent's `modules` and merges them (deduplication + stable order).

**Variants**: `pure` or `classic`. By default, only `pure` is emitted. For a preset/side-bundle to also emit the `classic` variant, explicitly declare `"variants": ["pure", "classic"]` on the relevant entry — or globally via `defaults.variants`.

**Endpoint**: the `classic` variant attaches the framework to `globalThis.<endpoint>` (default `fw`). Configurable at three levels, from highest to lowest priority:

1. CLI `--endpoint <name>` (global run override);
2. `endpoint` per entry (`presets.<name>.endpoint` / `sideBundles.<name>.endpoint`);
3. `defaults.endpoint`.

The name must be a valid JS identifier (dot-access in generated code). Example config:

```json
{
    "defaults": { "variants": ["pure"], "endpoint": "fw" },
    "presets": {
        "site": { "extends": "core", "modules": ["dom"], "variants": ["pure", "classic"], "endpoint": "awa" }
    }
}
```

## pure vs classic variants

| Variant | Effect |
|---|---|
| **pure** (default) | `export default fw;` — no side effects. The app imports the bundle as ESM. |
| **classic** | Additionally: `if (!globalThis.<endpoint>) globalThis.<endpoint> = fw;` — useful for `<script type="module" src="...">` when you want to access the framework from non-module code. `<endpoint>` = `fw` by default, configurable (see above). |

Side-bundles follow the same logic: `pure` exports `default _mods` (the descriptor array) + `install(runtime)` + `modules`; `classic` self-installs onto `globalThis.<endpoint>.runtime` via `registerAllDeep` (same endpoint as the preset loaded upstream).

## Outputs

Everything is written to `dist/build/`. Naming convention:

| Variant   | Preset                                         | Side-bundle                                              |
|-----------|------------------------------------------------|----------------------------------------------------------|
| `pure`    | `fw.<preset>.pure.min.js` (+ `.pure.js`)       | `fw.pack.<name>.pure.min.js` (+ `.pure.js`)              |
| `classic` | `fw.<preset>.min.js` (+ `.js`)                 | `fw.pack.<name>.min.js` (+ `.js`)                        |

Each bundle has a paired `.meta.json` with: description, modules listed, env, bytes (min/gz), sha256, builtAt.

## Architecture

```
fw.config.json                    # source of truth — pure data (package root)
tools/fw-bundler/src/bundle/      # repo-level, mutualized — @awacloud/tool-fw-bundler
├── index.js               # CLI orchestrator (dispatched via the `fw-bundler bundle` bin)
└── lib/
    ├── config.js          # load fw.config.json + cascade extends + validate
    ├── entry-gen.js       # generates the entry from scratch (preset + side-bundle)
    ├── validate-deps.js   # invariants: deps↔dependencies, modules.js consistency, dep-string lookup
    ├── strip-dev.js       # mirrors src/ with dev_only blocks removed
    └── bundler.js         # wrapper over Bun.build
```

`fw.config.json` lives at the **package root** (alongside `package.json`, like `tsconfig.types.json`) — it is cross-cutting editorial data, consumed by the bundler **and** the Vite plugin, not owned by a single tool.

The shared scanner `tools/fw-bundler/src/modlib/scan-modules.js` is the source of truth for module discovery: all tools (bundler, validate-deps, standalone) consume it, never `src/core/modules.js` directly (the latter serves the self-contained mode).

## Pipeline

1. **Load** `fw.config.json` + scan `src/` (single walk).
2. **Validate**: source-tree invariants (3 checks from `validate-deps.js`) + preset/side-bundle references.
3. **Strip-dev** (production only): mirror `src/` → `dist/_tmp/_src/` with `/* dev_only */` blocks removed.
4. **Sanity**: emits `sanity.min.js`.
5. **Assets**: copies `brotli_dict.bin` and other binary assets.
6. **Presets**: for each preset × variant, generates the entry from scratch and bundles.
7. **Side-bundles**: same.

## Customising

### Adding a module to a preset

Edit `fw.config.json`, add the name to the preset's `modules` array. The name must exist in `src/` (a module-shaped `export const X = { name, factory, ... }`). If the reference is invalid, the build fails at the `loadConfig` phase:

```
[config] preset "site" references unknown modules: foo, bar
```

### Creating a preset

Add an entry in `fw.config.json#presets`, optionally with `extends: "<parent>"`. Add a `prebuild:<name>` script in `package.json` (optional — `fw-bundler bundle <name>` already works).

### Adding a side-bundle

Add an entry in `fw.config.json#sideBundles`: `{ "description": "...", "modules": [...] }`. Variants inherit from `defaults.variants` unless explicitly overridden.

### Editorial pruning

With the `deps` field (cf. [`docs/guide/module-pattern.md`](../guide/module-pattern.md)) and `registerAllDeep`, presets no longer need to list the transitive closure: only the top-level conceptual modules are needed. The bundler pulls in deps via each module's JS imports. You can freely shorten existing lists.

## Technical constraints

- Zero npm dependencies — only `Bun.build`, `Bun.gzipSync`, `node:fs`, `node:path`, `node:crypto`.
- Browser target (`target: 'browser'`, `format: 'esm'`).
- External source maps (`.map`) for preset and pack bundles.
- `sanity.min.js` is a classic script (no module syntax).

## See also

- [`standalone.md`](./standalone.md) — self-contained ESM bundle for an individual fw module.
- [`precompilation.md`](./precompilation.md) — HTML → `ParseResult` JSON precompilation.
- [`aot.md`](./aot.md) — AOT HTML → imperative JS factory compilation.
- [`../guide/integration-bundlers.md`](../guide/integration-bundlers.md) — self-contained vs Vite/Webpack.
- [`../../integrations/vite/README.md`](../../integrations/vite/README.md) — Vite plugin.
