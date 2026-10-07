---
module: fontsLargeBundle
category: bundles/fonts-large
dependencies: [fonts, extraMath, extraJstf]
returns: object
worker-safe: true
status: complete
---

# fonts-large

> Bundle `fontsLargeBundle` — core `fonts` + the most-used read-path extras.

**Module** `fontsLargeBundle` | **Source** `packages/front/office/fonts/src/bundles/fonts-large.js` | **Deps** `fonts`, `extraMath`, `extraJstf` | **Worker-safe** yes

A pure fw factory descriptor. Declares the core `fonts` orchestrator and the most-used read-path extras (`extraMath`, `extraJstf`) as dependencies. The runtime resolves every dependency transitively and passes the already-constructed instances to the factory, which wires them into the `fonts` core via `fonts.use(...)` and returns the enriched instance.

Consumption is purely declarative — register the descriptor in a `ModuleRuntime` and call `runtime.resolve('fontsLargeBundle')`.

Coverage (versus the core already provided by the `fonts` factory and its transitive `table/*` / `sfnt/*` / `variable/*` / `embed-pdf` / `standard14` / `encodings` dependencies, registered alongside it — e.g. via `main.js`'s full `modules` array):

- BASE / JSTF / MATH metadata

Excludes (use `fontsFullBundle` for those):

- TT bytecode hinting VM (RM05)
- Apple AAT
- Complex shapers (Arabic / Indic / CJK)
- WOFF2 write encoder
- DSIG signature parsing

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `fontsLargeBundle` | fw factory descriptor | `{ name: 'fontsLargeBundle', dependencies: ['fonts', 'extraMath', 'extraJstf'], deps, factory(fonts, extraMath, extraJstf) }` — resolves to the `fonts` API object enriched with the `extraMath` + `extraJstf` hooks. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras, ...bundle]) fw.runtime.register(m);
const fonts = fw.runtime.resolve('fontsLargeBundle');
const font = fonts.read(bytes);   // bytes: Uint8Array of a .ttf or .otf file
```

The resolved object is the `fonts` API (`read`, `use`, `buildFont`, `KNOWN_HOOKS`, `SFNT_FLAVOR`) with the bundle's extras already attached through `use(...)`.

## Notes

- Excludes RM05 hinting, AAT, shapers, WOFF2 write, DSIG — use `fonts-full` for those.
- Targets PDF/web applications reading modern fonts without a hinter or a complex shaper.

## See also

- [fonts-full](./fonts-full.md) [fonts-apple-aat](./fonts-apple-aat.md)
- [../fonts](../fonts.md)
