# @awacloud/tool-fw-bundler

Production build tools for `@awacloud/fw`-shaped packages: the `bundle` orchestrator
(presets × variants + side-bundles + sanity, via `Bun.build`), the
`standalone` factory generator (one self-contained ESM per module), and the
`catalog` emitter (deterministic module-catalog artifact + `--check` drift
gate). `bundle`/`standalone` are generalised to any fw-shaped package via a
`--pkg` seam; `catalog` reads a package's modules and emits its catalog
artifact.

## Consumption shape

**Autonomous — standalone `bin`.** This package ships its own `fw-bundler`
executable (`bin/fw-bundler.ts`, a thin delegate to `src/index.ts` — no
argument parsing duplicated), so it runs directly once installed:

```bash
bunx fw-bundler bundle site --pkg packages/front/fw
```

## Installation

```bash
npm install --save-dev @awacloud/tool-fw-bundler
```

Runs under Bun (the `bin` is TypeScript executed by Bun).

## Quick Start

```bash
# Build a preset of a fw-shaped package (defaults to the current directory)
bunx fw-bundler bundle site --pkg packages/front/fw

# Build every preset + side-bundle
bunx fw-bundler bundle --pkg packages/front/fw

# Emit one self-contained ESM for a single module
bunx fw-bundler standalone hex --pkg packages/front/fw --out dist/hex.js

# Emit the module-catalog artifact (defaults to packages/front/fw)
bunx fw-bundler catalog
```

`--pkg <dir>` selects the package root (`src/`, `dist/`, `fw.config.json`
resolve under it). When omitted, `bundle`/`standalone` default to the working
directory, so a consuming package's own build scripts — which run at its own
package root — keep working unchanged. `catalog` is the exception: it
defaults `--pkg` to `packages/front/fw` when invoked with no implied cwd
(see below).

Direct invocation without the `bin` is equivalent:

```bash
bun node_modules/@awacloud/tool-fw-bundler/src/bundle/index.js site --pkg packages/front/fw
bun node_modules/@awacloud/tool-fw-bundler/src/standalone/index.js hex --pkg packages/front/fw
bun node_modules/@awacloud/tool-fw-bundler/src/catalog/index.js --check --pkg packages/front/fw
```

## `catalog` subcommand

`bunx fw-bundler catalog [--check] [--pkg <dir>]`

Emits `<pkg>/integrations/_shared/catalog.generated.json` — the deterministic
module-catalog artifact fw's shipped `integrations/_shared/core.js` reads
instead of re-scanning `src/` at consumer build time. Shape:

```json
{
  "comment": "AUTO-GENERATED — do not edit. Regenerate after adding/renaming fw modules.",
  "modules": {
    "hex": { "bindingName": "hex", "subpath": "io/codec/hex.js" }
  }
}
```

- `modules` keys are lexicographically sorted; `subpath` is POSIX-separated,
  relative to `<pkg>/src`, `.js` extension kept; 2-space indent; trailing
  newline; no timestamp/version field, so the artifact is byte-idempotent
  across regenerations of an unchanged source tree.
- **Fail-closed**: if any module file is unparseable, `catalog` prints the
  file list, writes nothing, and exits 1 — the same semantics `core.js` has
  today when it can't scan `src/`.
- `--check` regenerates in memory and byte-compares against the committed
  file: identical → exit 0; missing or different → prints what changed
  (missing / added / changed module names) and exits 1, without writing.

**When to regenerate**: after adding, removing, or renaming an fw module (any
change to a `src/**/*.js` file's `export const <name> = { ... }` shape). Run
`bunx fw-bundler catalog` and commit the updated artifact; a `--check` gate
catches a forgotten regeneration.

## Licence banner (`bundle --banner-file`)

Minifiers drop ordinary comments, so a bundle loses the per-file licence
header its sources carry. `bundle` can re-attach one statement, opt-in:

```bash
bunx fw-bundler bundle --pkg packages/front/fw --banner-file tmp/licence-banner.txt
```

The file holds **plain text**, one banner line per line (e.g. a copyright
line, an author line, an `SPDX-License-Identifier:` line). `bundle` dresses
it as ONE legal comment and writes it at **byte 0 of every emitted JS
bundle** of the run — `*.min.js`, the non-minified `*.js`, the sanity tier
artifacts and the `sanity.min.js` alias:

```js
/*!
 * Copyright (c) 2026 Example Org
 * Author: Jane Doe
 * SPDX-License-Identifier: Apache-2.0
 */
```

- **After minification.** The banner is a post-step on the final output
  file, so no minifier or backend setting (`bun`, `esbuild`, `rollup`) can
  strip it.
- **Meta on the final bytes.** `*.meta.json` `bytes` / `hashSha256`
  describe the bannered files.
- **Deterministic.** The rendered banner is a pure function of the text: EOLs
  are normalised to LF, trailing whitespace and leading/trailing blank lines
  are dropped, and nothing else (no timestamp, no path) is added. Applying it
  twice never stacks a second copy.
- **Refused inputs.** An empty file, or text containing `*/` (which would
  close the comment early), fails the run with exit 1 before anything is
  written.
- **Omitted = unchanged.** Without the flag every emitted byte is exactly
  what it was before the option existed (the committed goldens pin this).

Programmatic twin: `runBundle({ ...parseArgs(argv), banner: '<text>' })`
(`banner` and `bannerFile` are mutually exclusive). The path is resolved
against the working directory. This tool carries no licence of its own into
the banner: the caller decides the text. The monorepo's export pipeline
(`pkg-export build`) passes each `fw`-shaped row's per-file header lines.

## Determinism of the emitted artifacts

The emitted artifacts carry **no build stamp**: `bundle` writes no `builtAt`
field into `*.meta.json`, `standalone` writes no `// Built: <ISO>` banner, and
neither emits Bun's path-derived `//# debugId=` trailer — both `Bun.build`
sites pin `sourcemap: 'none'`, so no `.map` sidecars are produced either
(the trailer was the only link between a bundle and its map: Bun emits no
`sourceMappingURL` comment). Re-running a build changes nothing unless the
source changed.

Reproducibility is **path-scoped**, not absolute:

| Scope | Guarantee |
|---|---|
| Same build path (same cwd, same `--pkg`) | Byte-identical — `*.min.js`, the non-minified bundle and `*.meta.json` alike. |
| Different path, non-minified bundle + meta | **Differ.** The non-minified bundle embeds one `// <path>` comment per module, resolved relative to the build process's cwd; the meta inherits it through its `dev`/`devGz` sizes and `hashSha256.dev`. Two builds of the same tree from their own cwds are still identical — it is the cwd-relative layout that must match, not the absolute location. |
| Different path, `*.min.js` | Byte-identical in the measured cases, but **not guaranteed**: Bun's minifier allocates identifiers path-dependently. Measured at fw scale: 32 of 629 blobs differed when the build directory path changed. |

That last row is a known, deliberately-unfixed **residual** — do not read the
stamp removal as a claim of full build reproducibility. All three rows are
pinned by `tests/bundle.integration.test.js`.

`standalone` output has one more dependency: each factory is serialized with
`Function.prototype.toString`, which returns the source **as the running Bun's
transpiler served it**, not the file text. The output is byte-stable for a
given Bun version and transpiler mode, and no further. `bun test --coverage`
is such a mode switch: Bun then serves an uncompacted transpile (braced `if`s,
`new Error`, unmerged `const`s), so the same generator emits different bytes.
For that reason `tests/standalone.integration.test.js` runs its golden compare
in a child `bun` process outside coverage.

## Structure

```
src/
  index.ts            CLI dispatch: `bundle` | `standalone` | `catalog`
  bundle/
    index.js          orchestrator (parseArgs, runBundle)
    lib/
      config.js       fw.config.json loader + preset resolution
      entry-gen.js    generates preset / side-bundle entry files
      strip-dev.js    strips /* dev_only */ blocks into a mirror tree
      validate-deps.js  deps ↔ dependencies + modules.js invariants
      bundler.js      Bun.build backend selector (bun | esbuild | rollup)
      banner.js       opt-in legal-comment banner (--banner-file), post-minify
  standalone/
    index.js          topo-sort + factory inlining + optional minify
  catalog/
    index.js          scan → render → write/--check the module-catalog artifact
  modlib/             the shared fw-tools substrate (see below)
    scan-modules.js   tolerant fw-module scanner
    cli-help.js       help printing + main-module detection
    index.js          re-exports the frozen `./modlib` surface
tests/                golden / equivalence integration tests + fixture
```

### The `./modlib` shared substrate

This package hosts the reuse nucleus both it and `@awacloud/tool-fw-codegen` consume,
exported under the `./modlib` subpath:

```js
import { scanAll } from '@awacloud/tool-fw-bundler/modlib';
```

The shared `_lib` lives at `@awacloud/tool-fw-bundler/modlib`, **not** a
standalone `@awacloud/tool-fw-modlib` package.

## Build

Not applicable — the tool is executed directly by Bun (no build step). The
`bundle`/`standalone` subcommands ARE the build machinery for downstream fw-shaped
packages.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (incl. `--help`) |
| 1 | subcommand error (parse error, build failure) |
| 2 | usage error (unknown / missing command) |

## Tests

```bash
bun test tools/fw-bundler/
```

The suite golden-compares `standalone` output byte-for-byte against the real fw
original, asserts `bundle` parity vs the fw original, and drives the full
`bundle` pipeline (with byte-idempotence) against an fw-shaped fixture. See
`docs/README.md` for the frozen call contract.

## Documentation

- [`docs/README.md`](./docs/README.md) — module map + the frozen call contract.
- [`CHANGELOG.md`](./CHANGELOG.md).

## See also

- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/main/packages/front/fw) — the framework whose build tools this package ports.
- [`@awacloud/tool-fw-codegen`](https://github.com/awacloud/awa/tree/main/tools/fw-codegen) — the codegen sibling that consumes `./modlib`.

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`tools/fw-bundler`](https://github.com/awacloud/awa/tree/main/tools/fw-bundler)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each published release.

Developed by AwaCloud.
