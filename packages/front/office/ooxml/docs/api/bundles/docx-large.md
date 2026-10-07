---
module: docxLargeBundle
category: bundles
dependencies: [docx, wmlRunFormatting, wmlParagraphFormatting, wmlTableProperties, wmlNumberingDetails, wmlSettings, wmlFields, wmlTrackedChanges, mathAdvanced, dmlWpPositioning, dmlEffects, dmlFillsAdvanced]
returns: object
worker-safe: true
status: complete
---

# docxLargeBundle

> Pre-wired bundle: docx core + P0 + P1 extras (~95% real-world docx coverage).

**Module** `docxLargeBundle` | **Source** `packages/front/office/ooxml/src/bundles/docx-large.js` | **Deps** `docx` + 11 extras | **Worker-safe** yes

Returns the core `docx` surface enriched with the **P0 + P1 opt-in extras** that matter for WordprocessingML. Use this when you want typed access to most modern docx features without paying for the full ECMA-376 long tail.

## Included

- [`wmlRunFormatting`](../extra/wml-run-formatting.md) — `<w:rPr>` (caps, kern, position, lang, …)
- [`wmlParagraphFormatting`](../extra/wml-paragraph-formatting.md) — `<w:pPr>` (tabs, framePr, kinsoku, outlineLvl, …)
- [`wmlTableProperties`](../extra/wml-table-properties.md) — `tblPr` / `trPr` / `tcPr`
- [`wmlNumberingDetails`](../extra/wml-numbering-details.md) — advanced numbering.xml
- [`wmlSettings`](../extra/wml-settings.md) — advanced settings.xml
- [`wmlFields`](../extra/wml-fields.md) — field instruction tokenizer
- [`wmlTrackedChanges`](../extra/wml-tracked-changes.md) — moveFrom / rPrChange / cellIns / …
- [`mathAdvanced`](../extra/math-advanced.md) — eqArr / groupChr / mathPr / phant
- [`dmlWpPositioning`](../extra/dml-wp-positioning.md) — wp:anchor + wrap*
- [`dmlEffects`](../extra/dml-effects.md) — shadow / glow / blur / 3D
- [`dmlFillsAdvanced`](../extra/dml-fills-advanced.md) — gradient / image / pattern fills

## Resolve

```js
const word = runtime.resolve('docxLargeBundle');
// Returns the enriched `docx` instance — same shape as resolving 'docx'.
```

## API

`docxLargeBundle` is a pure fw factory descriptor — there is no imperative helper. Register the descriptor alongside its dependencies in a `ModuleRuntime` and resolve `'docxLargeBundle'`. The factory calls `docx.use(...)` internally and returns the enriched `docx` instance.

| Resolve key | Returns | Dependencies (auto-wired) |
|-------------|---------|---------------------------|
| `'docxLargeBundle'` | enriched `docx` API (same shape as [`docx`](../docx/docx.md)) | `docx`, plus every extra listed under [Included](#included) |

## Examples

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';

// 1. Register the fw modules, the core ooxml modules, the extras and the bundle.
const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(docxLargeBundle);

// 2. Resolve — the runtime wires every dependency transitively and the
//    bundle factory calls `docx.use(...)` on each extra before returning
//    the enriched instance.
const word = runtime.resolve('docxLargeBundle');

// 3. Read.
const inputBytes = await fetch('/sample.docx').then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
const result     = word.read(inputBytes);

// Typed run-formatting fields are now available:
const firstRun = result.document.body[0].children[0];
console.log(firstRun.rPr?.caps, firstRun.rPr?.lang);

// 4. Mutate and write back — `write` takes the DOCUMENT, not the read result.
firstRun.rPr = { ...firstRun.rPr, caps: true, lang: { val: 'en-US' } };
const outBytes = word.write(result.document, { styles: result.styles });
```

## Notes

- The bundle descriptor only declares dependencies; the core ooxml modules and the extras **must** be registered on the same runtime before resolving (`runtime.registerAll(fw_require)`, then `runtime.registerAll(modules)` and `runtime.registerAll(extras)`).
- `ModuleRuntime.register` takes a single descriptor. Use `registerAll(array)` for the `modules` / `extras` arrays — it is not variadic.
- Of the 11 extras above, only `wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties` and `wmlSettings` expose `hydrate*` / `dehydrate*` hooks that [`docxWalker`](../docx/docx.md) applies automatically on read/write. The others are wired in but are consumed through their own parse/render helpers.
- To also type or preserve the long tail of the schema, use [`docx-full`](./docx-full.md) instead, which depends on `docxLargeBundle` plus the long-tail extras.

## Breaking change

The previous `buildDocxLarge(docx, { xml, props })` imperative helper has been removed. Replace any call sites with the `ModuleRuntime` pattern shown above.

## See also

- [docx-full](./docx-full.md) — adds VML legacy + advanced shapes + transitional + misc
- [docx core](../docx/docx.md)
- [Read+write docx guide](../../guide/read-write-docx.md)
