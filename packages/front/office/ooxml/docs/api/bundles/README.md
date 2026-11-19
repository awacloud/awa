# API — Bundles

Pre-wired collections of [extra modules](../extra/README.md), exposed as pure fw factory descriptors. Each bundle declares the core format module (`docx` / `xlsx` / `pptx`) plus the relevant extras as dependencies. Register the descriptor in a `ModuleRuntime` and resolve it — the runtime wires every dependency transitively and the factory returns the enriched core instance.

**Reading the Coverage column.** A bundle's extras are of two kinds: those that **type a read** (a walker hook runs on every `read()` / `write()`) and **toolkits** (parse / render functions one calls on raw nodes, which a read never calls). The extras of the first kind are `docx-large`'s `wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties`, `wmlSettings` and `dmlWpDrawing`, `docx-full`'s `wmlStyleDetails` and `wmlDocumentDetails`, `pptx-full`'s `dmlTextDetails`, `pmlPartDetails` and `pmlPackageParts`, and `xlsx-full`'s `smlWorkbookDetails`, `dmlTextDetails` and `smlPackageParts`; every other extra of the six bundles is a toolkit, so a read through `xlsx-large` or `pptx-large` types what the core types. What the core does not type it keeps verbatim (`_extras`, kept sources), so a round trip loses little either way — the coverage scorecards measure it.

| Bundle | Coverage | Resolve key | Source |
|--------|----------|-------------|--------|
| [`docx-large`](./docx-large.md) | docx: 5 extras type a read + toolkits | `'docxLargeBundle'` | [`src/bundles/docx-large.js`](../../../src/bundles/docx-large.js) |
| [`docx-full`](./docx-full.md) | `docx-large` + 2 extras that type a read (styles and numbering; body, sections, settings) + further toolkits | `'docxFullBundle'` | [`src/bundles/docx-full.js`](../../../src/bundles/docx-full.js) |
| [`xlsx-large`](./xlsx-large.md) | xlsx: toolkits only | `'xlsxLargeBundle'` | [`src/bundles/xlsx-large.js`](../../../src/bundles/xlsx-large.js) |
| [`xlsx-full`](./xlsx-full.md) | `xlsx-large` + 3 extras that type a read (workbook details; a drawing's text; the calculation chain, external links, XML maps, connections, query tables, pivot caches and tables) + further toolkits | `'xlsxFullBundle'` | [`src/bundles/xlsx-full.js`](../../../src/bundles/xlsx-full.js) |
| [`pptx-large`](./pptx-large.md) | pptx: toolkits only | `'pptxLargeBundle'` | [`src/bundles/pptx-large.js`](../../../src/bundles/pptx-large.js) |
| [`pptx-full`](./pptx-full.md) | `pptx-large` + 3 extras that type a read (text details, theme script fonts; part-level transition, timing, header / footer; notes slides, notes and handout masters, unused layouts) + further toolkits | `'pptxFullBundle'` | [`src/bundles/pptx-full.js`](../../../src/bundles/pptx-full.js) |

> **Looking for a single-factory entrypoint that does not require registering 40+ ooxml modules first?** See [pre-built bundles](./prebuilt/README.md) — each logical bundle ships in two pre-built surfaces under `dist/`: `dist/standalone/<root>.js` (`-bundled`, everything inlined) and `dist/build/<root>.js` (`-package`, the 6 fw modules injected by DI).

## Common pattern

Consumption is **exclusively declarative** — register the bundle descriptor alongside the core ooxml `modules` and the relevant extras, then resolve.

`ModuleRuntime` lives at `@awacloud/fw/core/runtime.js` (the `@awacloud/fw` root only
exports `ENV`, `log`, `runtime`, `createWorker`, `domReady`). The extras are
**not** re-exported by name from the `@awacloud/ooxml` root — import the whole
`extras` array, or reach an individual descriptor through the
`@awacloud/ooxml/extra/<file>` sub-path.

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';

const runtime = new ModuleRuntime();
// `register` takes ONE descriptor per call — use `registerAll` for an array.
runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
runtime.registerAll(modules);
runtime.registerAll(extras);
runtime.register(docxLargeBundle);

const word = runtime.resolve('docxLargeBundle'); // enriched docx instance
const result = word.read(bytes);
// Runs / paragraphs / tables / settings now expose typed extra fields.
```

Registering the whole `extras` array is the simplest option; a bundle only
resolves the extras it actually declares, so nothing else is instantiated.

> **Breaking change.** The previous imperative helpers `buildDocxLarge`, `buildDocxFull`, `buildXlsxLarge`, `buildXlsxFull`, `buildPptxLarge`, `buildPptxFull` have been removed. The bundles are now pure factory descriptors and must be wired through a `ModuleRuntime`.

## See also

- [Extra modules](../extra/README.md)
- [Getting started](../../guide/getting-started.md)
- [`@awacloud/fw` runtime](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.3.0/packages/front/fw/docs/api/core/runtime.md)
