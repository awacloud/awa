---
module: fontsFullBundle
category: bundles/fonts-full
dependencies: [fontsLargeBundle, extraTtHinting, extraShaperArabic, extraShaperIndic, extraShaperCjk, extraWoff2Write, extraDsig]
returns: object
worker-safe: true
status: complete
---

# fonts-full

> Bundle `fontsFullBundle` — 100% OpenType + RM05 hinting + complex shapers + WOFF2 write + DSIG.

**Module** `fontsFullBundle` | **Source** `packages/front/office/fonts/src/bundles/fonts-full.js` | **Deps** `fontsLargeBundle`, `extraTtHinting`, `extraShaperArabic`, `extraShaperIndic`, `extraShaperCjk`, `extraWoff2Write`, `extraDsig` | **Worker-safe** yes

A pure fw factory descriptor. Composes `fontsLargeBundle` with the heavy extras:

- TT bytecode hinting VM (RM05)
- Complex shapers: Arabic, Indic, CJK
- WOFF2 write encoder
- DSIG digital signature parser

Consumption is purely declarative — register the descriptor in a `ModuleRuntime` and call `runtime.resolve('fontsFullBundle')`. The runtime resolves `fontsLargeBundle` (and therefore the `fonts` core) before wiring the heavy extras into it.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `fontsFullBundle` | fw factory descriptor | `{ name: 'fontsFullBundle', dependencies: ['fontsLargeBundle', 'extraTtHinting', 'extraShaperArabic', 'extraShaperIndic', 'extraShaperCjk', 'extraWoff2Write', 'extraDsig'], deps, factory(fonts, ...extras) }` — resolves to the `fonts` API object further enriched with the heavy extras. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras, bundle } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras, ...bundle]) fw.runtime.register(m);
const fonts = fw.runtime.resolve('fontsFullBundle');
const font = fonts.read(bytes);   // bytes: Uint8Array of a .ttf or .otf file
```

The resolved object is the `fonts` API (`read`, `use`, `buildFont`, `KNOWN_HOOKS`, `SFNT_FLAVOR`) with the bundle's extras already attached through `use(...)`.

## Notes

- **Excludes**: Apple AAT (use `fonts-apple-aat`).
- Targets full-featured typographic tooling, font editors, WOFF2 round-trip conversion.

## See also

- [fonts-large](./fonts-large.md) [fonts-apple-aat](./fonts-apple-aat.md)
