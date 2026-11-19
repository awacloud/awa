---
module: xlsxWalker
category: ooxml/xlsx
dependencies: []
returns: object
worker-safe: true
status: complete
---

# xlsxWalker

> Extension dispatcher of the `xlsx` orchestrator — the `.use(...)` registry and the `hydrate*` / `dehydrate*` dispatch for the workbook, its settings and its sheets.

**Module** `xlsxWalker` | **Source** `packages/front/office/ooxml/src/xlsx/xlsx-walker.js` | **Deps** none | **Worker-safe** yes

`xlsx` builds one walker per factory call. `xlsx.use(...extensions)` forwards to it, `xlsx.read` runs `applyHydrate` on the parsed workbook, and `xlsx.write` runs `applyDehydrate` on the workbook you pass in, before serializing. You rarely call the walker yourself: this page documents the contract an extension has to satisfy, and what the walker passes to each hook.

## Resolve

```js
const walkerMod = runtime.resolve('xlsxWalker');
// Returns: { createWalker }
const walker = walkerMod.createWalker();
// A walker: { use, applyHydrate, applyDehydrate, hasExtensions, extensions }
```

## API

### Module

| Member | Signature | Returns |
|---------|-----------|---------|
| `createWalker` | `() => walker` | A fresh walker with an empty extension registry (one per `xlsx` instance). |

### Walker

| Member | Signature | Returns |
|---------|-----------|---------|
| `use` | `(...extensions: object[]) => void` | Registers extensions. A falsy value is ignored and registering the same object twice is a no-op. |
| `applyHydrate` | `(workbook) => void` | Runs the `hydrate*` hooks over a workbook, in place. |
| `applyDehydrate` | `(workbook) => void` | Runs the `dehydrate*` hooks over a workbook, in place. |
| `hasExtensions` | getter `boolean` | `true` once at least one extension is registered. Both `apply*` calls do nothing while it is `false`. |
| `extensions` | getter `object[]` | A copy of the registered extensions, in registration order. |

## Hooks

An extension is a plain object implementing any subset of the hooks; a member that is not a function is ignored. For each phase the walker calls, in this order:

| Order | Hook pair | Receives | Return value |
|-------|-----------|----------|--------------|
| 1 | `hydrateWorkbook` / `dehydrateWorkbook` | the workbook object | An object returned by a hook is merged into the workbook with `Object.assign` (the workbook object itself is kept). `undefined` leaves it as is. |
| 2 | `hydrateSettings` / `dehydrateSettings` | the **workbook** object (the settings of a workbook live on it) | Ignored: mutate the workbook in place. |
| 3 | `hydrateSheet` / `dehydrateSheet` | each entry of `workbook.sheets`, in order | Ignored: mutate the sheet in place. |

Extensions run in registration order within one hook. Only the first of the three hooks has a return contract; the other two are in-place mutations.

The walker also dispatches the DrawingML text hooks over the text body (`txBody`) of every entry of each sheet's `drawings`, with the pptx walker's contract (a returned value replaces the visited one):

| Hook pair | Receives |
|-----------|----------|
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | a paragraph's `pPr`, and a field's own `pPr` |
| `hydrateRunProperties` / `dehydrateRunProperties` | a run's `rPr` |
| `hydrateParagraph` / `dehydrateParagraph` | a paragraph; on hydrate after its `pPr` and runs, on dehydrate before them |

On hydrate the text is walked before the three hooks above, on dehydrate after them.

### Package hooks

`hydratePackage(workbook, ctx)` / `dehydratePackage(workbook, ctx)` run once per read or write, outside the walk; a result other than `undefined` replaces the model.

- **On read**, `xlsx.read` calls them inside its pass, before the walk, so the walk reaches what they add. Their `ctx`:
  - `parts` (the package's parts, read without marking a part modelled) and `consume(partName)` (marks one modelled: it leaves `unmodelledParts`);
  - `package`, `rels`, `wbPart`, `wbRoot`, `wbRels`;
  - `sheetParts` and `sheetIds` (aligned with `workbook.sheets`);
  - `tableParts` (aligned with `workbook.tables`);
  - `readOpts`.
- **On write**, `xlsx.write` calls them after the core has built its package and before it is zipped. Their `ctx`:
  - `package` (to add or change parts, relationships and content types);
  - `wbPart`;
  - the written `sheetParts`;
  - `tablePartOf(table)`: the part a table of the model was written to, or `null`.

## Examples

```js
const walker = runtime.resolve('xlsxWalker').createWalker();

const calls = [];
walker.use({
    hydrateWorkbook() { calls.push('workbook'); return { title: 'Merged' }; },
    hydrateSheet(sheet) { calls.push(`sheet:${sheet.name}`); sheet.seen = true; }
});

const workbook = { sheets: [{ name: 'S1' }, { name: 'S2' }] };
walker.applyHydrate(workbook);

console.log(calls.join(' '));   // workbook sheet:S1 sheet:S2
console.log(workbook.title, workbook.sheets[1].seen); // Merged true
```

Through `xlsx`:

```js
const sheet = runtime.resolve('xlsx');
sheet.use({ hydrateSheet(s) { s.seen = true; } });   // forwarded to this instance's walker
```

## Notes

- Unlike the [docx walker](../docx/docx-walker.md) there is no per-hook index and no per-property traversal of cells or styles: an `xlsx` extension sees whole objects (workbook, sheets), and the text of drawings.
- A hook that throws is not caught: the error reaches the caller of `xlsx.read` / `xlsx.write`.
- Three shipped extras implement them, all registered by [`xlsx-full`](../bundles/xlsx-full.md): [`smlWorkbookDetails`](../extra/sml-workbook-details.md) (`hydrateWorkbook`), [`dmlTextDetails`](../extra/dml-text-details.md) (the text hooks) and [`smlPackageParts`](../extra/sml-package-parts.md) (the package hooks). `use` is also the integration point for your own modules — see [Extending](../../guide/extending.md).

## See also

- [xlsx](./xlsx.md) — orchestrator (`use`, `read`, `write`).
- [docx-walker](../docx/docx-walker.md), [pptx-walker](../pptx/pptx-walker.md) — the same registry contract for the other two formats.
- [Extending](../../guide/extending.md) — writing an extension.
