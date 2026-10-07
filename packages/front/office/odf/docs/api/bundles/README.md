# API — Bundles

Per-format coverage bundles for `@awacloud/odf`. Each is a pure fw factory descriptor that resolves to the enriched core orchestrator (`odt` / `ods` / `odp`) with a curated set of opt-in extras already wired in.

## Declarative bundles (legacy)

These descriptors declare every odf-local extra as a dependency and rely on the host `ModuleRuntime` to resolve them :

| Bundle | Source |
|--------|--------|
| [`odtLargeBundle`](./odt-large.md) | `src/bundles/odt-large.js` |
| [`odtFullBundle`](./odt-full.md)   | `src/bundles/odt-full.js`  |
| [`odsLargeBundle`](./ods-large.md) | `src/bundles/ods-large.js` |
| [`odsFullBundle`](./ods-full.md)   | `src/bundles/ods-full.js`  |
| [`odpLargeBundle`](./odp-large.md) | `src/bundles/odp-large.js` |
| [`odpFullBundle`](./odp-full.md)   | `src/bundles/odp-full.js`  |

The host application must register the core odf modules **and** every transitively referenced extra before resolving the bundle name.

## Pre-built bundles (`dist/build/` + `dist/standalone/`)

See [**`prebuilt/`**](./prebuilt/README.md) for the single-factory flattened variants — one self-contained factory per bundle that inlines all odf-local modules. Two surfaces per logical bundle, shipped side by side under `dist/` :

- `dist/standalone/<root>.js` (`*Bundled` export) : zero dependencies — fw modules inlined too.
- `dist/build/<root>.js` (`*Package` export) : 6 fw modules as dependencies — odf-local inlined.

A `dist/build/index.js` barrel re-exports the whole `@awacloud/odf` namespace for bulk registration. Regenerate via `bun run gen:bundles`. Both surfaces coexist with the legacy declarative bundles above.
