# @awacloud/ooxml

Read and write Word, Excel and PowerPoint files (`.docx`, `.xlsx`, `.pptx`) in plain JavaScript, in the browser, through a typed model. No dependency beyond `@awacloud/fw`.

Pure-JavaScript reader and writer for Office Open XML documents (ECMA-376: `.docx`, `.xlsx`, `.pptx`) in the browser. ZIP, XML parsing and serialization, OPC packaging, DrawingML and Office Math are either implemented in the package or consumed from [`@awacloud/fw`](https://github.com/awacloud/awa/tree/@awacloud/ooxml@1.3.0/packages/front/fw); there is no other runtime dependency, and no Node API is used (binaries are `Uint8Array`).

The core types the structures most documents use and keeps every other element of the parts it models verbatim in `_extras`, so an untouched element inside a modelled part is re-emitted on write. Whole parts outside the model (a theme, document properties, pivot tables, speaker notes, …) are not: `write()` produces the parts its model carries; a part `read()` did not model is not written back — `read()` lists it in `unmodelledParts` — unless `docx.write` is given the read result as its `carry` option. Opt-in `extra/*` modules name more of the schema and are grouped into `*-large` and `*-full` bundles. Only five extras (`wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties`, `wmlSettings` and `dmlWpDrawing`, all wired by `docx-large`) type a read through a walker hook; the others are parse / render toolkits one calls on raw nodes, which a read never calls, and the `*-misc` extras only catalogue the rarest elements (flagged `_passthrough`, not modelled). The measured coverage figures are in the [coverage guide](./docs/guide/coverage.md).

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

`package` is the plain OPC package (`{ contentTypes, parts, rels }`). `unmodelledParts` is always present: `[{ partName, contentType }]`, sorted by `partName`, listing every part the read did not consume (`contentType` is `null` when `[Content_Types].xml` declares none; `[Content_Types].xml` and the relationship parts are never listed). `write()` takes the model, not the envelope: `word.write(document, { styles, numbering, … })`, `xlsx.write(workbook)`, `pptx.write(presentation)`; the parts listed in `unmodelledParts` are not written back, except by `docx.write` with `carry: result` (the parts with their bytes, relationships and content types; see [`docx`](./docs/api/docx/docx.md)).

### Read options

Besides the archive limits (`maxParts`, `maxUncompressed`, `maxRatio`, `maxDepth`; see [Security](#security)), the readers take these opt-in options. Each one is off by default, and the default model is the one `1.0.0` read:

| Option | Readers | Effect when `true` |
|--------|---------|--------------------|
| `typedRunColors` | `pptx.read`, `xlsx.read` | A text-run fill that a bare `'RRGGBB'` cannot express (a theme colour, or any colour with transforms) is typed as `rPr.color = { rgb \| schemeColor, mods? }` instead of staying verbatim in `rPr._extras`. See [drawingml](./docs/api/drawingml/drawingml.md#text-body-model). |
| `slideExtrasByPart` | `pptx.read` | The leftovers of each slide, layout and master's `<p:cSld>` are kept in a new `cSldExtras` array and `_extras` holds the root's only; by default both go to `_extras` and the root's replace those of `<p:cSld>`. See [pptx-slide](./docs/api/pptx/slide.md#model). |
| `extensions: 'keep'` | `docx.read` | The elements and attributes of the Office extension namespaces (`w14`, `w15`, `w16*`, `wp14`) that markup compatibility removes by default stay in the model's `_extras` and are written back; a paragraph's and a row's `w14:paraId` / `w14:textId` read as `paraId` / `textId`. The default is `'drop'`; another value throws `docx/invalid-extensions`. See [docx](./docs/api/docx/docx.md#notes). |
| `alternateContent: 'keep'` | `docx.read` | Each `mc:AlternateContent` stays in place, verbatim, in the `_extras` of the element that holds it, and `docx.write` writes it back (a DrawingML shape, text box or chart keeps its VML fallback). The default is `'fallback'`; another value throws `docx/invalid-alternate-content`. See [docx](./docs/api/docx/docx.md#notes). |

Model fields that a read now fills without an option (a model that lacks them is written as before): `fonts` on docx run properties (every `<w:rFonts>` attribute, beside `font`), `mods` on DrawingML shape fills (`lumMod`, `tint`, `alpha`, …), `srcRect` on docx drawings and pptx pictures (the picture crop), and `sheet.rowProps` on xlsx sheets (row heights and hidden rows). Since 1.2.0 a docx read also fills, without an option: `_relationships` on the document, on each header, footer, notes, comments, numbering, settings and chart model (the relationships of content the model does not type, written back by a write without `carry`); `_source` and `_read` on each drawing (an untouched drawing is written from its source); and typed `rangeMarker`, bookmark and comment-range nodes between blocks, `blockSdt` among a cell's children, `sdt` on cells and rows inside a content control, and `revision` nodes for tracked moves, where those elements used to stay in `_extras` or be dropped. A consumer walking a body, a cell or a paragraph must type-check these nodes (see [structure](./docs/api/docx/structure.md)).

### Write options

`docx.write(model, opts?)` takes the auxiliary parts (`styles`, `numbering`, `settings`, `comments`, `footnotes`, `endnotes`, `headers`, `footers`, `hyperlinks`, `images`, `customXml`) and these options; `xlsx.write(workbook, opts?)` and `pptx.write(presentation, opts?)` take `preserveInput` only. The four options below are off by default.

| Option | Writers | Effect |
|--------|---------|--------|
| `carry: readResult` | `docx.write` | Writes back the parts `read()` listed in `unmodelledParts` (theme, font table, document properties, embedded objects, …) with their bytes, content types and relationships, and an unedited chart part as read. Anything but the `read()` envelope throws `docx/invalid-carry`. |
| `preserveInput: true` | `docx.write`, `xlsx.write`, `pptx.write` | Writes from a structured clone, so the model you pass is left exactly as it was (no field demoted back into `_extras`, no assigned id on it). The default is `false`; another value throws `docx/invalid-preserve-input`, `xlsx/invalid-preserve-input` or `pptx/invalid-preserve-input`. |
| `cleanup: ['emptyProperties']` | `docx.write` | Drops every empty `rPr` / `pPr` from the body and the story parts (on a clone). The default is none; an unknown or repeated name throws `docx/invalid-cleanup`. |
| `danglingNumbering: 'keep'` | `docx.write` | Writes a list reference to an undeclared num as given instead of throwing `docx/numbering-unknown-num` / `docx/numbering-missing`. The default is `'throw'`; another value throws `docx/invalid-dangling-numbering`. |

Without `carry`, a docx write also writes back the relationships its models' `_relationships` keep. See [`docx`](./docs/api/docx/docx.md) for the full option tables.

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

The `docx`, `xlsx` and `pptx` instances expose `use(...extensions)`, which registers extras after construction. After `read()` the walker offers each visited node to the matching `hydrate*` hook of every extension (`hydrateRunProperties`, `hydrateParagraphProperties`, `hydrateTable`, `hydrateTcPr`, `hydrateDrawing`, `hydrateSettings`, and the xlsx / pptx counterparts), over the docx body, headers, footers, footnotes, endnotes and comments; before `write()` the symmetrical `dehydrate*` hooks run. Each extension implements only the hooks it needs.

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
- `opc.read(bytes, opts?)` enforces three default archive limits against *zip-bomb* inputs (`defaultLimits` also carries the fourth, `maxDepth`, below):
  - `maxParts = 8192` (`1024` before 1.2.0: a package of 1,025 to 8,192 parts that was refused is read by default; pass `maxParts: 1024` for the old cap)
  - `maxUncompressed = 256 MiB`
  - `maxRatio = 200` (ratio per entry)

  Exceeding a limit throws `ParseError('opc/zip-bomb', ...)` with `context.limit`. Passing `0` disables an individual check.
- `opc.read` also refuses an XML part (`.xml`, `.rels`, `.vml`) whose elements nest deeper than `maxDepth = 1000` (`defaultLimits.maxDepth`), found by a linear scan before any part is parsed: the readers and their consumers walk the trees recursively, and a part nested thousands deep would overflow the call stack. It throws `ParseError('opc/xml-too-deep', ...)` with `context.limit` (`'maxDepth'`), `context.max` and `context.partName`; `0` disables the check. A document nested deeper than that, which `1.0.0` read up to the stack limit, is refused by default: pass `maxDepth` to read it.
- `docx.read`, `xlsx.read` and `pptx.read` forward these four limits from their read options (`opts.maxParts`, `opts.maxUncompressed`, `opts.maxRatio`, `opts.maxDepth`); an absent key keeps the default.
- `xlsx.read(bytes, opts?)` limits `maxSheets`, `maxRowsPerSheet` and `maxCellsPerSheet`; exceeding one throws `ParseError('xlsx/limit-exceeded', ...)`.

See [`docs/api/errors.md`](./docs/api/errors.md) for the catalogue of emitted error codes.

## Design choices

- **Typed document model**: a serializable JSON tree rather than a flat object.
- **`_extras` mechanism**: inside a part the model reads, elements it does not type are preserved verbatim and re-emitted on write. A part the model does not read is not written back (`docx.write` writes it back with `carry`); `read()` lists it in `unmodelledParts`.
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
| `@awacloud/ooxml/docx-large` | `src/bundles/docx-large.js` | `docx` plus the extended-coverage extras: five type a read, the others are toolkits |
| `@awacloud/ooxml/docx-full` | `src/bundles/docx-full.js` | `docx-large` plus further toolkits (VML, custom geometry, transitional mapping, long-tail catalogues); none types a read |
| `@awacloud/ooxml/xlsx` | `src/xlsx/xlsx.js` | Core SpreadsheetML |
| `@awacloud/ooxml/xlsx-large` | `src/bundles/xlsx-large.js` | `xlsx` plus toolkits (pivot tables, calculation, configuration, charts); none types a read |
| `@awacloud/ooxml/xlsx-full` | `src/bundles/xlsx-full.js` | `xlsx-large` plus further toolkits (form controls, anchors, long-tail catalogues); none types a read |
| `@awacloud/ooxml/pptx` | `src/pptx/pptx.js` | Core PresentationML |
| `@awacloud/ooxml/pptx-large` | `src/bundles/pptx-large.js` | `pptx` plus toolkits (animations, transitions, notes, layouts, charts); none types a read |
| `@awacloud/ooxml/pptx-full` | `src/bundles/pptx-full.js` | `pptx-large` plus further toolkits (custom geometry, long-tail catalogues); none types a read |
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

- Website: https://awaforge.eu/
- Source: [`packages/front/office/ooxml`](https://github.com/awacloud/awa/tree/@awacloud/ooxml@1.3.0/packages/front/office/ooxml)
- Issues: https://github.com/awacloud/awa/issues
- Security policy: [`SECURITY.md`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.3.0/SECURITY.md)
