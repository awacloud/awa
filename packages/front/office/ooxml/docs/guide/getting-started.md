# Getting Started

**Purpose**: wire `@awacloud/ooxml` into a project, resolve the three core formats and read and write a first document.
**Prerequisites**: a browser or a runtime with ES modules and `Uint8Array` (Bun, Node 18+), and `@awacloud/fw`, the only runtime dependency. Every snippet imports from `@awacloud/ooxml` (root) or one of its [sub-paths](../../README.md#exposed-sub-paths).

`@awacloud/ooxml` is a pure-JavaScript library for reading and writing Office Open XML documents (`.docx`, `.xlsx`, `.pptx`) in the browser. Its only runtime dependency is `@awacloud/fw`.

## Install

```bash
npm install @awacloud/ooxml
```

In an HTML page, declare the import map:

```html
<script type="importmap">
{ "imports": {
    "@awacloud/fw":     "/node_modules/@awacloud/fw/src/main.js",
    "@awacloud/fw/":    "/node_modules/@awacloud/fw/src/",
    "@awacloud/ooxml":  "/node_modules/@awacloud/ooxml/src/main.js",
    "@awacloud/ooxml/": "/node_modules/@awacloud/ooxml/src/"
}}
</script>
<script type="module" src="./app.js"></script>
```

## The three core formats

| Format | Module | Sub-path |
|--------|--------|----------|
| WordprocessingML | `docx` | `@awacloud/ooxml/docx` |
| SpreadsheetML | `xlsx` | `@awacloud/ooxml/xlsx` |
| PresentationML | `pptx` | `@awacloud/ooxml/pptx` |

Each format module orchestrates read / write of its OPC package; lower-level building blocks (XML parser, OPC container, properties bags) are shared across the three.

## Factory pattern

Every module follows the same shape (see [fw module-pattern](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/docs/guide/module-pattern.md)). Factories that throw typed errors take `ooxmlErrors` as their first dependency:

```js
{
  name: 'docx',
  dependencies: ['ooxmlErrors', 'docxText',
                 'opcPackage', 'xml', 'opcRelationships', /* …part modules… */],
  factory(errors, textMod, opc, xml, rels, /* … */) {
      const { ParseError, ContractError } = errors;
      /* … */
      return api;
  }
}
```

You can wire dependencies manually (`factory(ooxmlErrors.factory(), docxText.factory(), opc, xml, rels, …)`), but the recommended path is the fw `ModuleRuntime` — it resolves every dependency transitively.

## fw `ModuleRuntime` registration

```js
// app.js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/ooxml';

// Register the @awacloud/fw modules the package consumes, then every ooxml
// module in dependency order.
fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);

// Resolve.
const word  = fw.runtime.resolve('docx');
const sheet = fw.runtime.resolve('xlsx');
const pres  = fw.runtime.resolve('pptx');

// Quick smoke test on docx.
const bytes  = word.write(word.fromText(['Hello, world.']));
const parsed = word.read(bytes);
console.log(word.toText(parsed.document)); // "Hello, world."
```

`fw_require` (the `@awacloud/fw` descriptors the package consumes) and `modules` are topologically ordered arrays — registering them in this order, `fw_require` first, guarantees that every dependency is satisfied before its dependents. Skipping `fw_require` fails at `resolve` with `Module not found: zip`.

## The `.use()` hook

Each format instance exposes `.use(...extensions)` so opt-in modules from `extra/` can plug in. Hooks (`hydrateRunProperties`, `dehydrateRunProperties`, `hydrateTable`, `hydrateSettings`, …) are invoked after `read()` and before `write()` to promote fields between `_extras` and typed slots.

```js
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';
const xml   = fw.runtime.resolve('xml');
const props = fw.runtime.resolve('docxProperties');
const word  = fw.runtime.resolve('docx');

word.use(wmlRunFormatting.factory(xml, props));

const result = word.read(bytes);
result.document.body[0].children[0].rPr; // typed: { caps, kern, lang, … }
```

For a curated collection use a [bundle](../api/bundles/README.md) — register the bundle descriptor and its required extras in the same runtime, then resolve the bundle. `register()` takes **one** descriptor per call — use `registerAll(array)` for a batch. The extras are **not** re-exported by name from the `@awacloud/ooxml` root; import the whole `extras` array instead:

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.registerAll(extras);   // every opt-in extra; a bundle only
                                   // resolves the ones it declares
fw.runtime.register(docxLargeBundle);

const wordLarge = fw.runtime.resolve('docxLargeBundle'); // enriched docx
```

## Concrete input → parsed object

A minimal docx body XML excerpt:

```xml
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Hello</w:t></w:r>
    </w:p>
  </w:body>
</w:document>
```

After `word.read(bytes)`:

```js
result.document
// → {
//     type: 'document',
//     body: [
//       { type: 'paragraph', children: [
//         { type: 'run', rPr: { bold: true, size: 24 }, children: [
//           { type: 'text', value: 'Hello' }
//         ]}
//       ]}
//     ]
//   }
```

## Next steps

- [Read+write docx](./read-write-docx.md)
- [Read+write xlsx](./read-write-xlsx.md)
- [Read+write pptx](./read-write-pptx.md)
- [Extending — write your own extra](./extending.md)
- [Coverage](./coverage.md)
- [API index](../api/README.md)
