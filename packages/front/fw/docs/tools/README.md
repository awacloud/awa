# `@awacloud/fw` — Tooling

Build-time tools for `@awacloud/fw`, **categorised by usage**. The bundler,
standalone-generator, catalog, registry, audit and deps tools are the
packages `@awacloud/tool-fw-bundler` and `@awacloud/tool-fw-codegen`
(devDependencies here). They are invoked through the `package.json` scripts
(`bun run prebuild`, `bun run types:registry`, …) or their bins directly
(`fw-bundler <command>`, `fw-codegen <command>`). `tools/rendering/**` (aot,
jsx, precompilation) and `tools/_lib/cli-help.js` are fw-private, unchanged,
still in this package's own tree.

```
packages/front/fw/tools/
├── _lib/        # cli-help.js (still consumed by rendering/aot) — the shared
│                #   scan-modules.js scanner moved to tools/fw-bundler/src/modlib/
└── rendering/   # template pre-compilation (fw-private)
    ├── aot/          → HTML → imperative JS factory
    ├── jsx/          → .jsx → ParseResult JSON
    └── precompilation/ → HTML → ParseResult JSON

tools/fw-bundler/   # repo-level, mutualized — @awacloud/tool-fw-bundler
└── src/
    ├── bundle/      → presets + side-bundles → dist/build/
    ├── standalone/  → self-contained fw module (without runtime)
    └── catalog/     → integrations catalog artifact (fw-bundler catalog)

tools/fw-codegen/   # repo-level, mutualized — @awacloud/tool-fw-codegen
└── src/
    ├── registry/    → generates the narrow type registry
    ├── audit/       → factory @returns audit
    └── deps/        → deps: [...] companion-field injector
```

**Ecosystem integrations** (Vite, esbuild, Rollup, Bun, Webpack, Astro, Vitest, ESLint…) live outside `tools/`, in the dedicated [`integrations/`](../../integrations/) scope — they are bridges to community tools, not internal fw tooling.

| Sub-tool                                | Purpose                                                              | Entry                          | npm script           |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------ | -------------------- |
| [`bundler.md`](./bundler.md)            | Prebuild orchestrator — emits framework bundles into `dist/build/`. | `tools/fw-bundler` (`bundle`)               | `bun run prebuild`   |
| [`standalone.md`](./standalone.md)      | Self-contained ESM bundle for a fw module (without runtime).        | `tools/fw-bundler` (`standalone`)            | `bun run build:standalone` |
| [`precompilation.md`](./precompilation.md) | Pre-compiles HTML templates into `ParseResult` JSON.             | `tools/rendering/precompilation/`        | `bun run build:parseresult` |
| [`aot.md`](./aot.md)                    | AOT-compiles HTML templates into imperative JS factory functions.   | `tools/rendering/aot/`                   | `bun run build:aot`  |
| [`jsx.md`](./jsx.md)                    | Compiles `.jsx` templates to `ParseResult` JSON (blessed path, no runtime JSX). | `tools/rendering/jsx/`         | —                    |
| [`audit.md`](./audit.md)                | Audit of factory `@returns` annotations.                           | `tools/fw-codegen` (`audit`)           | `bun run types:audit` |
| [`codegen.md`](./codegen.md)            | Generates `types/registry.generated.d.ts` (narrow resolve).        | `tools/fw-codegen` (`registry`)         | `bun run types:registry` |

Each page follows the same structure: purpose, CLI usage + flags, example, runtime integration if applicable, limitations, cross-links.

## Runtime: bun (default) or Node

Scripts use **bun** by default, but **all tools also run under Node**:

- **bundler**: `dist/build/*` under Node via `--backend esbuild`/`rollup` (see [`bundler.md`](./bundler.md)).
- **standalone**: `--min` via `esbuild.transform` under Node (otherwise `Bun.build`).
- **aot / precompilation / codegen / audit**: `node:*` APIs only → Node-capable as-is.

Under Node, the fw-private `tools/rendering/**` scripts target `index.js` explicitly (`node tools/rendering/<sub>/index.js`); the mutualized `fw-bundler`/`fw-codegen` tools run via their exported `runCli` entry points — the shipped form is `bun run prebuild:node` — or, inside the awa monorepo, its own task router. Full task table + prerequisites: [`../dev/runtime.md`](../dev/runtime.md).
