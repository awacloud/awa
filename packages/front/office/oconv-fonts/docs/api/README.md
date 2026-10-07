# API `@awacloud/oconv-fonts`

Per-module reference, mirroring `src/`. `@awacloud/oconv-fonts` exposes
exactly **3 public functions**, re-exported from a single entry point
(`src/main.js`): the `oconvDefaultFaces` fw descriptor builder
(`createOconvDefaultFaces`) and the two loader-side functions
(`loadDefaultFaces`, `registerDefaultFaces`).

## Boundary note

The package's `exports` map declares four keys: `"."` → `./src/main.js` (the
entry point, re-exporting all three functions — no fw descriptor/manifest
arrays of its own, unlike `@awacloud/oconv`'s `src/main.js`), `"./faces.js"`
→ `./src/faces.js`, `"./loader.js"` → `./src/loader.js` (both also directly
resolvable, matching the browser
import-map convention — `@awacloud/oconv-fonts/faces.js` /
`@awacloud/oconv-fonts/loader.js`) and `"./package.json"` → `./package.json`
(metadata only, not a module). No other `src/` path resolves. The public
surface is reached by importing from `"."` (or the two named subpaths) —
never by resolving an fw descriptor by name for the loader functions; only
the built descriptor itself (`oconvDefaultFaces`) is reached that way, from
`@awacloud/oconv`'s side, by NAME (`runtime.resolve('oconvDefaultFaces')`),
as documented in [`../descriptor.md`](../descriptor.md).

## Modules

| Page | Member | Source | Summary |
|---|---|---|---|
| [`create-oconv-default-faces`](./create-oconv-default-faces.md) | `createOconvDefaultFaces` | `src/faces.js` | Builds the frozen `oconvDefaultFaces` fw descriptor around a validated face map. |
| [`load-default-faces`](./load-default-faces.md) | `loadDefaultFaces` | `src/loader.js` | The explicit async byte path — fetches the five vendored Liberation faces the default route uses. |
| [`register-default-faces`](./register-default-faces.md) | `registerDefaultFaces` | `src/loader.js` | Loads the default faces and registers the `oconvDefaultFaces` descriptor on an `@awacloud/fw` `ModuleRuntime`. |

## Row-count derivation

3 rows above = the package's entire public surface, re-derived against
`src/main.js`'s re-exports (`export { createOconvDefaultFaces } from
'./faces.js';` + `export { loadDefaultFaces, registerDefaultFaces } from
'./loader.js';` — 2 statements, 3 bindings). No fw descriptor other than the
one `createOconvDefaultFaces` builds is registered by this package; internal
helpers (`freezeFaces` in `src/faces.js`, `baseUrlOf`/`readFace`/
`FACE_FILES`/`FACE_KEYS` in `src/faces.js`/`src/loader.js`) are not exported
and have no page.

## Licence preservation

**Never pre-subset or otherwise modify the vendored faces.** OFL 1.1
condition 3 forbids distributing a Modified Version under a Reserved Font
Name, and the licence defines "Modified Version" to include any change to
the font's format — which includes subsetting. See the [package
README](../../README.md#licence) for the full reasoning and the licence
files.

## Typical usage pattern

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
await registerDefaultFaces(runtime);

const api = runtime.resolve('oconvDefaultFaces');
// { defaultFaces, family: 'Liberation', release: '2.1.5' }
```

## See also

- [`../descriptor.md`](../descriptor.md) — the frozen `oconvDefaultFaces`
  contract: resolved API, frozen surface, the per-style-class precedence
  rule and worked examples. This page's per-member pages restate and link
  it; they do not re-derive the precedence rule.
- [`../../README.md`](../../README.md) — package overview, coverage table,
  licence.
