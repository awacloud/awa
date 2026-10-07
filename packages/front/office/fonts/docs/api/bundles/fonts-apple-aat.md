---
module: fontsAppleAatBundle
category: bundles/fonts-apple-aat
dependencies: [fontsFullBundle, aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat]
returns: object
worker-safe: true
status: complete
---

# fonts-apple-aat

> Bundle `fontsAppleAatBundle` — `fontsFullBundle` + Apple AAT (morx/kerx/ankr/prop/lcar/feat).

**Module** `fontsAppleAatBundle` | **Source** `packages/front/office/fonts/src/bundles/fonts-apple-aat.js` | **Deps** `fontsFullBundle`, `aatMorx`, `aatKerx`, `aatAnkr`, `aatProp`, `aatLcar`, `aatFeat` | **Worker-safe** yes

A pure fw factory descriptor. Use this bundle for tooling that targets macOS-distributed fonts or needs AAT-only features (Apple system emoji, advanced Type1 substitutions).

Consumption is purely declarative — register the descriptor in a `ModuleRuntime` and call `runtime.resolve('fontsAppleAatBundle')`. The runtime resolves `fontsFullBundle` (and therefore the full chain back to the `fonts` core) before wiring the six AAT factories into it.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `fontsAppleAatBundle` | fw factory descriptor | `{ name: 'fontsAppleAatBundle', dependencies: ['fontsFullBundle', 'aatMorx', 'aatKerx', 'aatAnkr', 'aatProp', 'aatLcar', 'aatFeat'], deps, factory(fonts, ...aat) }` — resolves to the `fonts` API object further enriched with the six AAT extras. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras, ...bundle]) fw.runtime.register(m);
const fonts = fw.runtime.resolve('fontsAppleAatBundle');
const font = fonts.read(bytes);   // bytes: Uint8Array of a .ttf or .otf file
```

The resolved object is the `fonts` API (`read`, `use`, `buildFont`, `KNOWN_HOOKS`, `SFNT_FLAVOR`) with the bundle's extras already attached through `use(...)`.

## Notes

- Most complete bundle; higher memory cost than `fonts-large` (AAT scaffolding included).
- AAT tables are parsed at the metadata level, not fully executed as state machines — per the [errors](../errors.md) vocabulary, most `morx-*`/`kerx-*`/`ankr-*`/`lcar-*`/`prop-*` paths stay stub-level (structural decode, no glyph-substitution engine). Don't rely on this bundle for a full AAT shaping pipeline.

## See also

- [fonts-large](./fonts-large.md) [fonts-full](./fonts-full.md)
- [../extra/apple-aat/README](../extra/apple-aat/README.md)
