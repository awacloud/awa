# @awacloud/ooxml

Pure-JavaScript reader and writer for Office Open XML documents (ECMA-376: `.docx`, `.xlsx`, `.pptx`) in the browser. ZIP, XML parsing and serialization, OPC packaging, DrawingML and Office Math are either implemented in the package or consumed from [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/ooxml@1.0.0/packages/front/fw); there is no other runtime dependency, and no Node API is used (binaries are `Uint8Array`).

The core types the structures most documents use and keeps every other element of the parts it models verbatim in `_extras`, so an untouched element inside a modelled part is re-emitted on write. Whole parts outside the model (a theme, document properties, pivot tables, speaker notes, …) are not: `write()` produces the parts its model carries; a part `read()` did not model is not written back — `read()` lists it in `unmodelledParts`. Opt-in `extra/*` modules type the long tail of the schema and are grouped into ergonomic `*-large` and `*-full` bundles. The `*-misc` extras reach the rarest elements as catalogued passthroughs (flagged `_passthrough`, preserved on round trip, not modelled): "full" coverage means every element is either typed or preserved, not that every element has a semantic model. See the [coverage guide](./docs/guide/coverage.md).

## Installation

```bash
npm install @awacloud/ooxml
```

In the browser, resolve the packages through an import map (adjust the paths to where your server exposes them):

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":     "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":    "/node_modules/@awacloud/fw/src/",
    "@awacloud/ooxml":  "/node_modules/@awacloud/ooxml/src/main.js",
    "@awacloud/ooxml/": "/node_modules/@awacloud/ooxml/src/"
}}
</script>
```

## Quick Start

Every module is an `@awacloud/fw` factory descriptor. Register the package's manifest on a `ModuleRuntime`, then resolve by name: the runtime wires every dependency transitively. The `fw_require` array holds the `@awacloud/fw` modules the package consumes; register it first.

### Write and read a `.docx`

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/ooxml';

fw.runtime.registerAll(fw_require);   // the @awacloud/fw modules the package consumes
fw.runtime.registerAll(modules);      // the ooxml modules, dependencies first

const word = fw.runtime.resolve('docx');
const bytes = word.write(word.fromText(['First paragraph.']));   // Uint8Array
const { document } = word.read(bytes);
console.log(word.toText(document));                              // First paragraph.
```

`xlsx` and `pptx` resolve the same way (`fw.runtime.resolve('xlsx')`, `fw.runtime.resolve('pptx')`); see the [read/write guides](#documentation).

### Read result

`read()` returns an envelope around the model:

- `docx.read(bytes, opts?)` → `{ document, package, documentPart, hyperlinks, headers, footers, images, charts?, customXml?, styles?, numbering?, settings?, comments?, footnotes?, endnotes?, unmodelledParts }`
- `xlsx.read(bytes, opts?)` → `{ workbook, package, unmodelledParts }`
- `pptx.read(bytes, opts?)` → `{ presentation, package, unmodelledParts }`

`package` is the plain OPC package (`{ contentTypes, parts, rels }`). `unmodelledParts` is always present: `[{ partName, contentType }]`, sorted by `partName`, listing every part the read did not consume (`contentType` is `null` when `[Content_Types].xml` declares none; `[Content_Types].xml` and the relationship parts are never listed). `write()` takes the model, not the envelope: `word.write(document, { styles, numbering, … })`, `xlsx.write(workbook)`, `pptx.write(presentation)`; the parts listed in `unmodelledParts` are not written back.

### With a coverage bundle (auto-wired extras)

A bundle is a pure `@awacloud/fw` factory descriptor: register it with the core modules and the `extras` array, then resolve it. The runtime wires everything the bundle declares and the bundle calls `docx.use(...)` before returning the enriched instance.

`ModuleRuntime.register()` takes **one** descriptor per call; use `registerAll(array)` for a batch. The extras are **not** re-exported by name from the `@awacloud/ooxml` root: import the whole `extras` array, or one extra through its `@awacloud/ooxml/extra/<file>` sub-path.

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.registerAll(extras);        // a bundle only resolves the extras it declares
fw.runtime.register(docxLargeBundle);

const word = fw.runtime.resolve('docxLargeBundle');   // docx with the large extras wired
const bytes = word.write(word.fromText(['Typed through the extras.']));
console.log(word.read(bytes).document.body.length);    // 1
```

`docxFullBundle` is registered the same way and additionally needs `docxLargeBundle` (see the [bundles reference](./docs/api/bundles/README.md)).

### Typed error handling

The error classes (`OoxmlError`, `ParseError`, `RenderError`, `ContractError`) are exposed by the `ooxmlErrors` factory; there is no top-level import.

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/ooxml';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);

const word = fw.runtime.resolve('docx');
const { ParseError, ContractError } = fw.runtime.resolve('ooxmlErrors');

try {
    word.read(new Uint8Array([1, 2, 3]));            // not a ZIP archive
} catch (e) {
    if (e instanceof ContractError) { /* caller bug */ }
    else if (e instanceof ParseError) console.log(e.code);   // opc/invalid-zip
    else throw e;
}
```

See [`docs/api/errors.md`](./docs/api/errors.md) for the catalogue of error codes.

## The `.use(...)` hook

The `docx`, `xlsx` and `pptx` instances expose `use(...extensions)`, which registers extras after construction. After `read()` the walker offers each visited node to the matching `hydrate*` hook of every extension (`hydrateRunProperties`, `hydrateParagraphProperties`, `hydrateTable`, `hydrateTcPr`, `hydrateSettings`, and the xlsx / pptx counterparts); before `write()` the symmetrical `dehydrate*` hooks run. Each extension implements only the hooks it needs.

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/ooxml';
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);

const xml = fw.runtime.resolve('xml');
const props = fw.runtime.resolve('docxProperties');
const word = fw.runtime.resolve('docx').use(wmlRunFormatting.factory(xml, props));

const doc = word.fromText(['Hello']);
doc.body[0].children[0].rPr = { caps: true };
const decoded = word.read(word.write(doc));
console.log(decoded.document.body[0].children[0].rPr.caps);    // true
```

The `*LargeBundle` / `*FullBundle` bundles chain these calls for you when resolved through a `ModuleRuntime`. The hook contract is documented per format: [`docxWalker`](./docs/api/docx/docx-walker.md), [`xlsxWalker`](./docs/api/xlsx/xlsx-walker.md), [`pptxWalker`](./docs/api/pptx/pptx-walker.md).

## Committed dist bundles

Each of the nine logical bundles (`docx` / `docx-large` / `docx-full`, and the same for `xlsx` and `pptx`) also ships two pre-built single-factory surfaces under `dist/`. They are generated by `tools/generate-bundles.mjs` (kept in the repository, not part of the published package) through `bun run gen:bundles`:

- **`dist/build/<root>.{js,min.js,meta.json}`**: fw mode. The factory takes the `@awacloud/fw` modules listed in the `fwDependencies` field of its `meta.json` positionally; every ooxml-local module is inlined. `dist/build/index.js` is a barrel re-exporting the whole `src/main.js` namespace.
- **`dist/standalone/<root>.{js,min.js,meta.json}`**: framework-free. Every fw and ooxml-local factory is inlined; no runtime registration is needed.

See [`docs/api/bundles/prebuilt/README.md`](./docs/api/bundles/prebuilt/README.md) for the resolve keys and usage examples.

## Source structure

```
src/
├── main.js          entry point: fw_require, modules, extras and bundle arrays, plus every descriptor by name
├── errors.js        typed error hierarchy (ooxmlErrors)
├── _shared/         shared constants and helpers (ooxmlShared)
├── mc/              Markup Compatibility (ECMA-376 part 3)
├── math/            Office Math Markup Language (OMML)
├── opc/             Open Packaging Conventions (ECMA-376 part 2)
├── docx/            WordprocessingML (ECMA-376 §17)
├── xlsx/            SpreadsheetML (ECMA-376 §18)
├── pptx/            PresentationML (ECMA-376 §19)
├── drawingml/       shared DrawingML (ECMA-376 §20)
├── extra/           opt-in modules (extended coverage)
└── bundles/         the *-large / *-full compositions
```

XML parsing is not part of the tree: it comes from `@awacloud/fw/io/codec/xml.js` (module `xml`).

## Security

The package follows a "**no DTD / no external entity**" policy:

- The XML parser (`@awacloud/fw/io/codec/xml.js`) **skips** every `<!...>` declaration (DOCTYPE, internal ENTITY, NOTATION). No entity is expanded and no external resource is resolved, so classic XXE and billion-laughs payloads are neutralized by construction. This is pinned by regression tests.
- `opc.read(bytes, opts?)` enforces three default limits against *zip-bomb* inputs:
  - `maxParts = 1024`
  - `maxUncompressed = 256 MiB`
  - `maxRatio = 200` (ratio per entry)

  Exceeding a limit throws `ParseError('opc/zip-bomb', ...)` with `context.limit`. Passing `0` disables an individual check. `docx.read`, `xlsx.read` and `pptx.read` forward these three limits from their read options (`opts.maxParts`, `opts.maxUncompressed`, `opts.maxRatio`); an absent key keeps the default.
- `xlsx.read(bytes, opts?)` limits `maxSheets`, `maxRowsPerSheet` and `maxCellsPerSheet`; exceeding one throws `ParseError('xlsx/limit-exceeded', ...)`.

See [`docs/api/errors.md`](./docs/api/errors.md) for the catalogue of emitted error codes.

## Design choices

- **Typed document model**: a serializable JSON tree rather than a flat object.
- **`_extras` mechanism**: inside a part the model reads, elements it does not type are preserved verbatim and re-emitted on write. A part the model does not read is not written back; `read()` lists it in `unmodelledParts`.
- **Namespaces**: the writers emit the Transitional namespace URIs. The docx reader locates elements by their `w:` prefix and does not consult the namespace URI, so the body of a document whose `w:` prefix is bound to the Strict URI is read the same way, then written back with the Transitional URIs. The `extra/transitional` module converts between the Transitional and Strict forms.
- **One runtime dependency**: only `@awacloud/fw`.
- **Worker-safe**: each factory is self-sufficient (serializable through `factory.toString()`).
- **Browser-only**: no Node API (`fs`, `path`, `Buffer`, `node:*`); binaries are `Uint8Array`.

## Documentation

- [`docs/README.md`](./docs/README.md): complete index
- [`docs/guide/getting-started.md`](./docs/guide/getting-started.md): first steps
- [`docs/guide/read-write-docx.md`](./docs/guide/read-write-docx.md), [`docs/guide/read-write-xlsx.md`](./docs/guide/read-write-xlsx.md), [`docs/guide/read-write-pptx.md`](./docs/guide/read-write-pptx.md): the three formats with the large and full bundles
- [`docs/guide/coverage.md`](./docs/guide/coverage.md): coverage tiers and what they mean
- [`docs/guide/extending.md`](./docs/guide/extending.md): writing your own extra
- [`docs/api/`](./docs/api/README.md): API reference per module (core, extras, bundles)
- ECMA-376 (Office Open XML File Formats), parts 1-4: the Ecma International standard this package implements

## Tests

Unit tests are co-located with the sources (`src/**/*.test.js`); integration tests live in `tests/`. From the monorepo root:

```sh
bun test packages/front/office/ooxml/
```

## Exposed sub-paths

| Sub-path | Target | Usage |
|----------|--------|-------|
| `@awacloud/ooxml` | `src/main.js` | Index: the `fw_require`, `modules`, `extras` and `bundle` arrays, and every module descriptor by name |
| `@awacloud/ooxml/docx` | `src/docx/docx.js` | Core WordprocessingML |
| `@awacloud/ooxml/docx-large` | `src/bundles/docx-large.js` | `docx` plus the extended-coverage extras |
| `@awacloud/ooxml/docx-full` | `src/bundles/docx-full.js` | `docx-large` plus the long-tail extras (every WordprocessingML schema element typed or preserved) |
| `@awacloud/ooxml/xlsx` | `src/xlsx/xlsx.js` | Core SpreadsheetML |
| `@awacloud/ooxml/xlsx-large` | `src/bundles/xlsx-large.js` | `xlsx` plus the extended-coverage extras |
| `@awacloud/ooxml/xlsx-full` | `src/bundles/xlsx-full.js` | `xlsx-large` plus the long-tail extras (every SpreadsheetML schema element typed or preserved) |
| `@awacloud/ooxml/pptx` | `src/pptx/pptx.js` | Core PresentationML |
| `@awacloud/ooxml/pptx-large` | `src/bundles/pptx-large.js` | `pptx` plus the extended-coverage extras |
| `@awacloud/ooxml/pptx-full` | `src/bundles/pptx-full.js` | `pptx-large` plus the long-tail extras (every PresentationML schema element typed or preserved) |
| `@awacloud/ooxml/opc` | `src/opc/package.js` | OPC container (ZIP + `[Content_Types].xml` + `.rels`) |
| `@awacloud/ooxml/drawingml` | `src/drawingml/drawingml.js` | Shared DrawingML helpers |
| `@awacloud/ooxml/errors` | `src/errors.js` | The `ooxmlErrors` factory descriptor (typed error hierarchy) |
| `@awacloud/ooxml/extra/*` | `src/extra/*.js` | One opt-in extra by file name, e.g. `@awacloud/ooxml/extra/wml-run-formatting` |
| `@awacloud/ooxml/bundles/*` | `src/bundles/*.js` | One bundle by file name, e.g. `@awacloud/ooxml/bundles/docx-large` |
| `@awacloud/ooxml/build/*` | `dist/build/*` | Pre-built fw-mode bundles (`fwDependencies` declared) and the `index.js` barrel |
| `@awacloud/ooxml/standalone/*` | `dist/standalone/*` | Pre-built framework-free bundles (every fw factory inlined) |

See [`docs/api/bundles/README.md`](./docs/api/bundles/README.md) for the details of each bundle.

## Maturity

`L4`, the highest level of the monorepo's maturity scale (`awa.maturity` in `package.json`): code, tests and documentation are publication-ready. Release history: [`CHANGELOG.md`](./CHANGELOG.md).

## Licence

[AGPL-3.0-only](./LICENSE). Copyright (c) 2026 AwaCloud SAS. A commercial licence is also available; see [`NOTICE`](./NOTICE).

## Project

- Website: https://awaforge.eu
- Source: [`packages/front/office/ooxml`](https://github.com/awacloud/awa/tree/@awacloud/ooxml@1.0.0/packages/front/office/ooxml)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: [`SECURITY.md`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/SECURITY.md)
