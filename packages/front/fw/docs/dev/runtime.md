# Dev runtime: bun (default) or Node

`@awacloud/fw` is developed **under bun by default** (zero additional tooling: `bun test`, `bun run prebuild`, `bun tools/…`). Everything is also doable **under Node**, some tasks requiring an on-demand installed tool. The framework *targets* both bun **and** Node (cf. [`../../integrations/nodejs/README.md`](../../integrations/nodejs/README.md)).

## Task table

| Task | bun (default) | Node (alternative) | Node prerequisites |
|---|---|---|---|
| **Tests** | `bun run test` | `bun run test:vitest` | `bun run setup:vitest` (vitest) |
| **Build bundles** (`dist/build/*`) | `bun run prebuild` | `bun run prebuild:node` | `bun run setup:e2e` (esbuild) |
| **Build — alternative backend** | `bun run prebuild:rollup` | `node --input-type=module -e "import('@awacloud/tool-fw-bundler/bundle').then(m => m.runCli(process.argv.slice(1))).then(c => process.exit(c))" -- --backend rollup` | `setup:e2e` (rollup + terser) |
| **Types** (`dist/types/*.d.ts`) | `bun run types` | `npx tsc -p tsconfig.types.json` | `typescript` (committed devDep) |
| **Lint** | `bun run lint` | `npx eslint .` | eslint devDeps (committed) |
| **Standalone** (self-contained module) | `bun run build:standalone <m>` | `node --input-type=module -e "import('@awacloud/tool-fw-bundler/standalone').then(m => m.runCli(process.argv.slice(1))).then(c => process.exit(c))" -- <m>` | `--min` → `setup:e2e` (esbuild) |
| **AOT / precompilation** | `bun run build:aot` / `build:parseresult` | `node tools/rendering/{aot,precompilation}/index.js <in>` | — (Node-only APIs) |
| **Registry / types audit** | `bun run types:registry` / `types:audit` | `node --input-type=module -e "import('@awacloud/tool-fw-codegen/{registry,audit}').then(m => m.runCli(process.argv.slice(1))).then(c => process.exit(c))" --` | — (Node-only APIs) |

The bun-default `package.json` scripts (`types:registry`, `integrations:catalog`,
`prebuild*`, `build:standalone`) run the declared devDependencies' bins
(`fw-codegen`/`fw-bundler`, put on `PATH` by `bun run`) directly — the
awa monorepo's own task router is also available there, and is what
those bins execute under the hood.

## Build under Node — how it works

The bundler, standalone, registry and audit tools are mutualized:
they now live at the repo level in
`tools/fw-bundler` (`@awacloud/tool-fw-bundler`) and `tools/fw-codegen`
(`@awacloud/tool-fw-codegen`), consumed as devDependencies. Under bun, the
`package.json` scripts invoke their declared bins (`fw-bundler <command>` /
`fw-codegen <command>`, resolved from `node_modules/.bin` by `bun run`).
Under bare Node, the same entry points are reached via each package's own
`exports` map (`@awacloud/tool-fw-bundler/bundle`,
`@awacloud/tool-fw-bundler/standalone`, `@awacloud/tool-fw-codegen/registry`,
`@awacloud/tool-fw-codegen/audit` — declared in each tool's `package.json`)
and their exported `runCli(argv)`, invoked from a small `node --input-type=module -e`
one-liner (see the task table). Only `tools/rendering/**` (aot,
precompilation) stays fw-private.

The only bun-specific part of the builder (`Bun.build`/`Bun.gzipSync`) is abstracted behind a **backend selector** (`tools/fw-bundler/src/bundle/lib/bundler.js`):

- **bun** (default under bun), **esbuild** (recommended under Node), **rollup** (alternative).
- Selection: `--backend <name>` > `FW_BUILD_BACKEND` > auto (bun if present, otherwise esbuild).
- Node backends: `node:zlib` (gzip) + `node:crypto` (hash) — see [`../../integrations/esbuild/backend.js`](../../integrations/esbuild/README.md) and [rollup](../../integrations/rollup/README.md).

> **Node invocation via `runCli`**: `import('@awacloud/tool-fw-bundler/bundle').then(m => m.runCli(process.argv.slice(1))).then(c => process.exit(c))` under `node -e` puts the resolved specifier at `process.argv[1]` (the first arg after the `--` separator), so the `isMainModule` guard (`modlib/cli-help.js`) stays silent and no double run occurs — this is the form measured and wired as `prebuild:node`. Under bun, the declared `fw-bundler bundle` bin is enough.

## Installation policy (stay lean)

| Category | Installed by default | How |
|---|---|---|
| bun test runner, lint, types, happy-dom | **yes** (committed devDeps) | `bun install` |
| esbuild / rollup / webpack / vitest / terser | **no** | on demand: `bun run setup:e2e` (build/integration), `bun run setup:vitest` (Node tests) — `bun add --no-save`, so neither `package.json` nor the lockfile is modified |

Bundlers are **not** committed dependencies: a `bun install` stays lean, and the integration harnesses auto-skip whatever is not installed.

## All tools run under Node

Since the Node coverage, **no tool is bun-only anymore**:

- `tools/fw-bundler` (`standalone`): minification (`--min`) goes through `Bun.build` under bun, otherwise `esbuild.transform` under Node (esbuild = on-demand peer). Without `--min`, no dependency.
- `tools/rendering/aot`, `tools/rendering/precompilation`, `tools/fw-codegen` (`registry`/`audit`): use only `node:*` APIs → Node-capable as-is.

> **Node invocation**: target `index.js` (`node tools/<…>/index.js`), not the directory — the `isMainModule` guard compares `argv[1]` to `import.meta.url`, and `node <dir>` does not resolve `argv[1]` to the `index.js`. Under bun, `bun tools/<…>/` is enough.
