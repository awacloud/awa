# API `@awacloud/oconv`

Per-module reference, mirroring `src/`. `@awacloud/oconv` composes format-aware
readers (`<fmt>ToIr`) and writers (`irTo<fmt>`) around a frozen pivot IR
(`oconvIr`) through a single public facade (`oconv` — `toMd`/`fromMd`/
`convert`), reached from a `@awacloud/fw` `ModuleRuntime` exactly like every
other member below.

## Boundary note

The package's `exports` map declares **two** keys: `"."` → `./src/main.js`
(the [manifest](./main.md)) and `"./src/worker.js"` → `./src/worker.js`
(the [worker](./worker.md)); every other `src/` path stays non-resolvable. The public API is reached by resolving the
descriptors listed below from a `@awacloud/fw` `ModuleRuntime` built from
that manifest's `fw_require` + `modules` arrays — never by importing a `src/`
path directly. `src/worker.js` (the [worker](./worker.md)) is loaded by its
own URL/path (or its `@awacloud/oconv/src/worker.js` specifier), not through
`runtime.resolve()`.

`mdFrontmatter` is registered inside this package's `modules` array (needed
by [`md-to-ir`](./read/md-to-ir.md)'s own dependency list) but it belongs to
`@awacloud/md`, not to `@awacloud/oconv` — it is documented on that package's
own index, not here.

Internal helpers (`write/anchors.js`, `write/image-header.js`,
`read/sheet-grid.js`, `read/slide-section.js`,
`read/pdf/paragraph-group.js`) and the test helper
`write/pdf/_test-runtime.js` are not public surface (no fw descriptor, no
`exports` entry) and have no page.

## Modules

| Page | Member | Source | Summary |
|---|---|---|---|
| [`manifest`](./main.md) | manifest (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`) | `src/main.js` | The package entry point — five arrays, nothing else. |
| [`oconv`](./oconv.md) | `oconv` | `src/oconv.js` | The public facade — `toMd`, `fromMd`, `convert`. |
| [`worker`](./worker.md) | worker (`./src/worker.js` sub-path) | `src/worker.js` | The Worker entry — one conversion per message, three message kinds. |
| [`ir/ir`](./ir/ir.md) | `oconvIr` | `src/ir/ir.js` | The frozen `oconv-ir/v1` pivot document model. |
| [`read/docx-to-ir`](./read/docx-to-ir.md) | `oconvDocxToIr` | `src/read/docx-to-ir.js` | `.docx` → IR, tier 2. |
| [`read/odt-to-ir`](./read/odt-to-ir.md) | `oconvOdtToIr` | `src/read/odt-to-ir.js` | `.odt` → IR, tier 2. |
| [`read/xlsx-to-ir`](./read/xlsx-to-ir.md) | `oconvXlsxToIr` | `src/read/xlsx-to-ir.js` | `.xlsx` → IR, tier 2 — one heading + table per sheet. |
| [`read/ods-to-ir`](./read/ods-to-ir.md) | `oconvOdsToIr` | `src/read/ods-to-ir.js` | `.ods` → IR, tier 2 — one heading + table per `<table:table>`. |
| [`read/pptx-to-ir`](./read/pptx-to-ir.md) | `oconvPptxToIr` | `src/read/pptx-to-ir.js` | `.pptx` → IR, tier 1 — one heading + N paragraphs per slide. |
| [`read/odp-to-ir`](./read/odp-to-ir.md) | `oconvOdpToIr` | `src/read/odp-to-ir.js` | `.odp` → IR, tier 1 — one heading + N paragraphs per slide, notes reachable. |
| [`read/pdf-to-ir`](./read/pdf-to-ir.md) | `oconvPdfToIr` | `src/read/pdf-to-ir.js` | `.pdf` → IR, tier 1, text-first — tagged fast path + untagged fall-back. |
| [`read/pdf/font-decoder`](./read/pdf/font-decoder.md) | `oconvPdfFontDecoder` | `src/read/pdf/font-decoder.js` | Per-font character decoder for the tier-1 pdf reader. |
| [`read/pdf/text-extract`](./read/pdf/text-extract.md) | `oconvPdfTextExtract` | `src/read/pdf/text-extract.js` | Page-level positioned-text extraction for the tier-1 pdf reader. |
| [`read/pdf/struct`](./read/pdf/struct.md) | `oconvPdfStruct` | `src/read/pdf/struct.js` | Tagged-PDF structure reader — the tier-1 pdf reader's fast-path detector. |
| [`read/md-to-ir`](./read/md-to-ir.md) | `oconvMdToIr` | `src/read/md-to-ir.js` | Markdown text → IR — the `fromMd`/`convert` read side. |
| [`write/ir-to-md`](./write/ir-to-md.md) | `oconvIrToMd` | `src/write/ir-to-md.js` | `oconv-ir/v1` → structured-markdown profile v1, the frozen wire contract. |
| [`write/ir-to-docx`](./write/ir-to-docx.md) | `oconvIrToDocx` | `src/write/ir-to-docx.js` | IR → `.docx` bytes writer, tier 2, composing `@awacloud/ooxml`'s typed write model. |
| [`write/ir-to-odt`](./write/ir-to-odt.md) | `oconvIrToOdt` | `src/write/ir-to-odt.js` | IR → `.odt` bytes writer, tier 2, composing `@awacloud/odf`'s typed body model and typed named styles. |
| [`write/ir-to-pdf`](./write/ir-to-pdf.md) | `oconvIrToPdf` | `src/write/ir-to-pdf.js` | IR → `.pdf` bytes writer — the bounded typesetter's facade, the only module in the family that talks to `@awacloud/pdf`. |
| [`write/pdf/default-faces`](./write/pdf/default-faces.md) | `oconvDefaultFacesAbsent` | `src/write/pdf/default-faces.js` | The `oconvDefaultFaces` stand-in descriptor — an optional default-face pack seam, resolved by name. |
| [`write/pdf/metrics`](./write/pdf/metrics.md) | `oconvPdfMetrics` | `src/write/pdf/metrics.js` | Style-class → face resolution and advance measurement for the pdf typesetter. |
| [`write/pdf/box`](./write/pdf/box.md) | `oconvPdfBox` | `src/write/pdf/box.js` | Page geometry and typographic options of the pdf typesetter — the single validator of `opts.pdf`. |
| [`write/pdf/linebreak`](./write/pdf/linebreak.md) | `oconvPdfLinebreak` | `src/write/pdf/linebreak.js` | Style-tagged tokenizer and greedy space-breaking for the pdf typesetter. |
| [`write/pdf/stack`](./write/pdf/stack.md) | `oconvPdfStack` | `src/write/pdf/stack.js` | Flow-block generation and page stacking for the pdf typesetter. |
| [`write/pdf/render/text`](./write/pdf/render/text.md) | `oconvPdfRenderText` | `src/write/pdf/render/text.js` | Content-stream emission for text/heading/blockquote flow blocks. |
| [`write/pdf/render/list`](./write/pdf/render/list.md) | `oconvPdfRenderList` | `src/write/pdf/render/list.js` | The `list` renderer — nested bullet/ordered lists, hanging-indent marker column. |
| [`write/pdf/render/code`](./write/pdf/render/code.md) | `oconvPdfRenderCode` | `src/write/pdf/render/code.js` | The `codeBlock` renderer — one flow line per source line, monospace, no wrapping. |
| [`write/pdf/render/table`](./write/pdf/render/table.md) | `oconvPdfRenderTable` | `src/write/pdf/render/table.js` | The `table` renderer — fixed-layout GFM table, content-derived column widths. |
| [`write/pdf/render/image`](./write/pdf/render/image.md) | `oconvPdfRenderImage` | `src/write/pdf/render/image.js` | The `image` renderer — places images via the builder's `addImage` seam. |

## Row-count derivation

29 rows above, derived from `src/main.js`'s `modules` array: **27** local
`@awacloud/oconv` descriptor rows (`grep -n "^    oconv" src/main.js` matched
against every entry that is not itself a spread from a sibling package),
**+ 1** for the manifest, **+ 1** for the worker (spawned by path or its
`./src/worker.js` sub-path, no descriptor of its own) = **29**. `mdFrontmatter` — the one non-`oconv*`
descriptor `modules` also registers — is excluded from this count: it is
`@awacloud/md`'s own module, documented on that package's index (see the
boundary note above).

## Typical usage pattern

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

const result = await oconv.toMd({
    name: 'report.docx',
    bytes: docxBytes,
    convertedAt: new Date().toISOString()
});
```
