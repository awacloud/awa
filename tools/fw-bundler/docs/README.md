# `@awacloud/tool-fw-bundler` — package docs index

Co-located documentation for `tools/fw-bundler` (fw production build tools).
This index gives the exhaustive module table for `src/` and freezes the
`bundle` / `standalone` / `modlib` slice of the fw-tools-mutualization call
contract.

## Module table

### `src/` — CLI dispatch

| Module | Purpose |
|---|---|
| `src/index.ts` | CLI dispatch: routes `bundle` \| `standalone`; exit 2 on unknown/missing command. Discoverable via `fw-bundler --help`. |

### `src/bundle/` — production build orchestrator

| Module | Purpose |
|---|---|
| `bundle/index.js` | Orchestrator: `parseArgs(argv)` + programmatic `runBundle(opts)`. Presets × variants + side-bundles + sanity via `Bun.build`. |
| `bundle/lib/config.js` | Loads `fw.config.json`, resolves `extends` cascades, validates cited module names against the source-tree catalog. |
| `bundle/lib/entry-gen.js` | Generates preset / side-bundle entry files from scratch (no regex surgery on `main.js`). |
| `bundle/lib/strip-dev.js` | Mirrors `src/` with `/* dev_only */ … /* !dev_only */` blocks stripped (production builds). |
| `bundle/lib/validate-deps.js` | Enforces the `deps` ↔ `dependencies` invariant + `modules.js` consistency. |
| `bundle/lib/bundler.js` | Build backend selector (`bun` default, `esbuild`/`rollup` on-demand); stable `buildOne`/`buildClassical` contract. |
| `bundle/lib/banner.js` | Opt-in legal-comment banner: `renderBanner(text)`, `loadBannerFile(path)`, `applyBanner(file, banner, backend)` (post-minify, byte 0, idempotent), `measure(buf, backend)`. |

### `src/standalone/` — standalone factory generator

| Module | Purpose |
|---|---|
| `standalone/index.js` | Topo-sorts a module's transitive `dependencies`, inlines factories into one self-contained ESM, optional `Bun.build` minify; `generateStandalone(name, opts)`. |

### `src/modlib/` — shared fw-tools substrate (`./modlib` subpath)

| Module | Purpose |
|---|---|
| `modlib/scan-modules.js` | Tolerant fw-module scanner: `scanAll`, `parseFile`, `listSourceFiles`, `relativeImport`. |
| `modlib/cli-help.js` | Shared CLI helpers: `printHelp`, `wantsHelp`, `isMainModule`. |
| `modlib/index.js` | Re-exports the frozen `./modlib` surface. |

## Path-resolution seam (`--pkg`)

The only logic adaptation vs the fw originals: every fw-relative default derives
from `PKG_ROOT = --pkg ?? cwd`. fw's build scripts run at the fw package root,
so the cwd default keeps fw green; `--pkg <dir>` retargets the machinery at any
fw-shaped package (`src/`, `dist/`, `fw.config.json` resolve under it).

## Frozen call contract

The surface downstream freezes bind to (graphic-anim-packaging, office-harmonization)
and P2 must preserve or supersede via a human-reviewed plan change. Ratified
verbatim from the mutualization design proposal.

### `bundle` (CLI + API)

- **CLI:** `fw-bundler bundle [target] [flags]` where `target` ∈
  `preset` | `side-bundle name` | `all` | `presets` | `side-bundles`, and flags:
  `--dev --no-log --no-sanity --sanity-only --no-sanity-log --config <path>
  --classic --endpoint <name> --backend <bun|esbuild|rollup> --pkg <dir> --help`.
- **API:** `parseArgs(argv) → opts`; programmatic `runBundle(opts)`.
- **Additive extension (2026-09-23):** `--banner-file <path>` (API:
  `opts.bannerFile`, or `opts.banner` = the text itself; mutually exclusive).
  Opt-in and purely additive: the frozen surface above is unchanged, and a run
  without it is byte-identical to a run before it existed. See the README
  § *Licence banner*.

### `standalone` (CLI + API)

- **CLI:** `fw-bundler standalone <moduleName> [--out <path>] [--min]
  [--classic] [--endpoint <name>] [--no-source-comments] [--pkg <dir>]`.
- **API:** `generateStandalone(moduleName, { out, min, sourceComments, classic,
  endpoint, pkg }) → { outPath, bytes, moduleCount, modules, validate, minified, endpoint }`.

### `./modlib` exports

`scanAll, parseFile, listSourceFiles, relativeImport` (scan-modules) +
`printHelp, wantsHelp, isMainModule` (cli-help).

**Shared-lib home (ratified):** `@awacloud/tool-fw-bundler/modlib` — a subpath export
of this package, NOT a standalone `@awacloud/tool-fw-modlib`. `@awacloud/tool-fw-codegen`
dev-depends on this package and imports `@awacloud/tool-fw-bundler/modlib`.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | ok (incl. `--help`) |
| `1` | error (subcommand parse error / build failure) |
| `2` | usage (unknown or missing command) |

## Golden-compare method (how the port is verified)

- **standalone:** byte-identical emitted ESM vs the real fw original
  (`--pkg packages/front/fw`) — RAW, no normalizer: the `// Built:` timestamp
  that used to be excused is no longer emitted (see
  [Determinism](../README.md#determinism-of-the-emitted-artifacts)). Plus
  re-import smoke and byte-idempotence.
- **bundle:** parity vs the fw original (identical behaviour); the full
  Bun.build path is driven to byte-idempotence against an fw-shaped fixture.
  See `tests/` for details, and the batch report for the one environmental
  caveat (fw's committed tree currently fails its own `validate-deps`).
  `*.min.js` goldens are compared RAW; `*.meta.json` goldens still neutralize
  the dev-derived sizes/hashes, the one build-location-dependent field class
  left.
