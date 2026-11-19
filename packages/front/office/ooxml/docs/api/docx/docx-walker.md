---
module: docxWalker
category: ooxml/docx
dependencies: []
returns: object
worker-safe: true
status: complete
---

# docxWalker

> Extension dispatcher of the `docx` orchestrator — the `.use(...)` registry, the `hydrate*` / `dehydrate*` hook dispatch and the tree traversal that visits run, paragraph, table, row and cell properties.

**Module** `docxWalker` | **Source** `packages/front/office/ooxml/src/docx/docx-walker.js` | **Deps** none | **Worker-safe** yes

`docx` builds one walker per factory call. `docx.use(...extensions)` forwards to it, `docx.read` runs `applyHydrate` on the freshly parsed result, and `docx.write` runs `applyDehydrate` on the document and the `headers`, `footers`, `footnotes`, `endnotes`, `comments`, `styles`, `numbering` and `settings` write options before they are serialized (the styles, numbering and settings parts are written from what the walker leaves, so a part hook may return a new object). The node hooks (run, paragraph, table, row, cell, drawing) visit the body, the headers, the footers, and the footnotes', endnotes' and comments' blocks. You rarely call the walker yourself: this page documents the contract an extension has to satisfy, and what the walker visits.

Extensions are indexed by hook name when they are registered, so traversal does not pay a lookup cost per visited node.

## Resolve

```js
const walkerMod = runtime.resolve('docxWalker');
// Returns: { createWalker }
const walker = walkerMod.createWalker();
// A walker: { use, applyHydrate, applyDehydrate, hasExtensions, extensions }
```

## API

### Module

| Member | Signature | Returns |
|---------|-----------|---------|
| `createWalker` | `() => walker` | A fresh walker with an empty extension registry. Registered extensions are scoped to that walker (one per `docx` instance). |

### Walker

| Member | Signature | Returns |
|---------|-----------|---------|
| `use` | `(...extensions: object[]) => void` | Registers extensions. A falsy value is ignored and registering the same object twice is a no-op, so chaining two bundles never double-hydrates. |
| `applyHydrate` | `(result) => void` | Runs every `hydrate*` hook over a `docx.read` result, in place. |
| `applyDehydrate` | `(result) => void` | Runs every `dehydrate*` hook, in place. |
| `hasExtensions` | getter `boolean` | `true` once at least one extension is registered. Both `apply*` calls return immediately while it is `false`. |
| `extensions` | getter `object[]` | A copy of the registered extensions, in registration order. |

## Hooks

An extension is a plain object. It implements only the hooks it needs; any member that is not a function is ignored. Hooks are called as `hook(value)`: the `hydrate*` ones in registration order, the `dehydrate*` ones in the reverse order (an extension registered after another writes its fields back first, so a field it typed inside the other's structure is back in that structure's `_extras` before it is rendered). A hook may mutate `value` in place, or return a replacement; returning `undefined` keeps the (possibly mutated) value.

| Hook pair | Receives | Visited in |
|-----------|----------|------------|
| `hydrateRunProperties` / `dehydrateRunProperties` | a run `rPr` | every `run` node, the paragraph-mark `pPr.rPr`, every style `rPr`, the styles' `docDefaults.rPr` and every numbering level's `rPr` |
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | a paragraph `pPr` | every `paragraph` node, every style `pPr`, the styles' `docDefaults.pPr` and every numbering level's `pPr` |
| `hydrateTcPr` / `dehydrateTcPr` | a table-cell `tcPr` | every `cell` node |
| `hydrateTable` / `dehydrateTable` | a `table` node | each table found as an element of an array (body, cell content, header, footer) |
| `hydrateRow` / `dehydrateRow` | a `row` node | each row of a table |
| `hydrateDrawing` / `dehydrateDrawing` | a `drawing` node | each drawing found as an element of an array (a run's children), after `docx.read` attached its picture and chart |
| `hydrateSettings` / `dehydrateSettings` | `result.settings` | the settings part, when present |
| `hydrateStyles` / `dehydrateStyles` | `result.styles` | the styles part, when present: hydrate before its properties are visited, dehydrate after |
| `hydrateNumbering` / `dehydrateNumbering` | `result.numbering` | the numbering part, when present: hydrate before its levels' properties are visited, dehydrate after |
| `hydrateSection` / `dehydrateSection` | a section (`sectPr`) | the body's final `document.sectPr`, and a paragraph's `pPr.sectPr` once a paragraph hook typed it (after the paragraph hooks on hydrate, before them on dehydrate) |

Absent properties are not visited: a run without `rPr` triggers no `hydrateRunProperties` call.

## What is traversed

The walker is handed an object shaped like a `docx.read` result: on read the result itself, on write `{ document, headers, footers, footnotes, endnotes, comments, styles, numbering, settings }` built from the document and the write options. It visits, in this order: `document`, every entry of `headers`, every entry of `footers`, the `body` of every note of `footnotes.notes` and `endnotes.notes` and of every comment of `comments.comments`; `styles` (its part hook, then `docDefaults.rPr` / `pPr` and the `rPr` and `pPr` of each entry of `styles.styles`); `numbering` (its part hook, then the `pPr` and `rPr` of each level of each `abstractNums` entry); then `settings`. Inside a body it descends through any `body`, `children`, `rows` and `cells` member.

## Examples

### Register an extension and run it by hand

```js
const walker = runtime.resolve('docxWalker').createWalker();

const markRuns = { hydrateRunProperties(rPr) { rPr.seen = true; } };
walker.use(markRuns, markRuns);                 // the duplicate is ignored
console.log(walker.hasExtensions, walker.extensions.length); // true 1

const result = {
    document: {
        type: 'document',
        body: [{ type: 'paragraph', children: [{ type: 'run', rPr: {}, children: [] }] }]
    }
};
walker.applyHydrate(result);
console.log(result.document.body[0].children[0].rPr); // { seen: true }
```

### The same registry through `docx`

```js
const word = runtime.resolve('docx');
word.use(markRuns);                  // forwarded to this docx instance's walker
const decoded = word.read(bytes);    // hydrate hooks already applied
```

## Notes

- `applyHydrate` / `applyDehydrate` mutate the object they are given. `docx.write` dehydrates the document tree you pass it in place (before rendering), so a caller that reuses the tree sees the typed properties demoted back into `_extras`; `docx.read` returns the already-hydrated result.
- `hydrateDrawing` receives a drawing with its kept source (`_source`, the `<w:drawing>` element as read, and `_read`, its typed fields as read — see [docxDrawing](./drawing.md)). An extension may type the source into fields of its own at hydrate; its `dehydrateDrawing` must remove them again and, to write an edit, replace `_source` with the element the drawing is to be written from: the write keeps a drawing's source only while its typed fields equal `_read` (`docxDrawing.keepSource` sets both). [dmlWpDrawing](../extra/dml-wp-drawing.md) is such an extension: it writes the edits of the typed fields into the source.
- A hook that throws is not caught: the error reaches the caller of `docx.read` / `docx.write`.
- The extras of `@awacloud/ooxml/extra/*` that expose hooks (for example `wmlRunFormatting`, `wmlParagraphFormatting`, `wmlTableProperties`, `wmlSettings`) are plain extensions of this contract — see [Extending](../../guide/extending.md).

## See also

- [docx](./docx.md) — orchestrator (`use`, `read`, `write`).
- [docxText](./docx-text.md) — the sibling helper module extracted from the orchestrator.
- [xlsx-walker](../xlsx/xlsx-walker.md), [pptx-walker](../pptx/pptx-walker.md) — the same registry contract for the other two formats.
- [Extending](../../guide/extending.md) — writing an extension.
