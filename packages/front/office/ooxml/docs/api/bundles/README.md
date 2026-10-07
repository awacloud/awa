# API — Bundles

Pre-wired collections of [extra modules](../extra/README.md), exposed as pure fw factory descriptors. Each bundle declares the core format module (`docx` / `xlsx` / `pptx`) plus the relevant extras as dependencies. Register the descriptor in a `ModuleRuntime` and resolve it — the runtime wires every dependency transitively and the factory returns the enriched core instance.

**Reading the Coverage column.** "~95%" is an estimate of real-world usage, not a measurement. A `full` bundle means every element of the ECMA-376 Part 1 schemas is either typed or preserved as a catalogued passthrough (see the [coverage guide](../../guide/coverage.md)); it is not a conformance measurement.

| Bundle | Coverage | Resolve key | Source |
|--------|----------|-------------|--------|
| [`docx-large`](./docx-large.md) | docx ~95% | `'docxLargeBundle'` | [`src/bundles/docx-large.js`](../../../src/bundles/docx-large.js) |
| [`docx-full`](./docx-full.md) | docx, every element typed or preserved | `'docxFullBundle'` | [`src/bundles/docx-full.js`](../../../src/bundles/docx-full.js) |
| [`xlsx-large`](./xlsx-large.md) | xlsx ~95% | `'xlsxLargeBundle'` | [`src/bundles/xlsx-large.js`](../../../src/bundles/xlsx-large.js) |
| [`xlsx-full`](./xlsx-full.md) | xlsx, every element typed or preserved | `'xlsxFullBundle'` | [`src/bundles/xlsx-full.js`](../../../src/bundles/xlsx-full.js) |
| [`pptx-large`](./pptx-large.md) | pptx ~95% | `'pptxLargeBundle'` | [`src/bundles/pptx-large.js`](../../../src/bundles/pptx-large.js) |
| [`pptx-full`](./pptx-full.md) | pptx, every element typed or preserved | `'pptxFullBundle'` | [`src/bundles/pptx-full.js`](../../../src/bundles/pptx-full.js) |

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
- [`@awacloud/fw` runtime](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/api/core/runtime.md)
