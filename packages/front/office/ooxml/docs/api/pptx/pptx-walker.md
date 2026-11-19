---
module: pptxWalker
category: ooxml/pptx
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pptxWalker

> Extension dispatcher of the `pptx` orchestrator — the `.use(...)` registry and the `hydrate*` / `dehydrate*` dispatch across the text bodies of slides, layouts and masters.

**Module** `pptxWalker` | **Source** `packages/front/office/ooxml/src/pptx/pptx-walker.js` | **Deps** none | **Worker-safe** yes

`pptx` builds one walker per factory call. `pptx.use(...extensions)` forwards to it, `pptx.read` runs `applyHydrate` on the parsed presentation, and `pptx.write` runs `applyDehydrate` on the presentation you pass in, before serializing. You rarely call the walker yourself: this page documents the contract an extension has to satisfy, and what the walker visits.

## Resolve

```js
const walkerMod = runtime.resolve('pptxWalker');
// Returns: { createWalker }
const walker = walkerMod.createWalker();
// A walker: { use, applyHydrate, applyDehydrate, hasExtensions, extensions }
```

## API

### Module

| Member | Signature | Returns |
|---------|-----------|---------|
| `createWalker` | `() => walker` | A fresh walker with an empty extension registry (one per `pptx` instance). |

### Walker

| Member | Signature | Returns |
|---------|-----------|---------|
| `use` | `(...extensions: object[]) => void` | Registers extensions. A falsy value is ignored and registering the same object twice is a no-op. |
| `applyHydrate` | `(presentation) => void` | Runs the `hydrate*` hooks over a presentation, in place. |
| `applyDehydrate` | `(presentation) => void` | Runs the `dehydrate*` hooks over a presentation, in place. |
| `applyPackageHydrate` | `(presentation, ctx) => presentation` | Runs each extension's `hydratePackage(presentation, ctx)`; a result other than `undefined` replaces the model. `pptx.read` calls it before `applyHydrate`. |
| `applyPackageDehydrate` | `(presentation, ctx) => presentation` | Runs each extension's `dehydratePackage(presentation, ctx)`; `pptx.write` calls it after building its package, before zipping it. |
| `hasExtensions` | getter `boolean` | `true` once at least one extension is registered. Both `apply*` calls do nothing while it is `false`. |
| `extensions` | getter `object[]` | A copy of the registered extensions, in registration order. |

## Hooks

An extension is a plain object implementing any subset of the hooks; a member that is not a function is ignored. Hooks are called as `hook(value)`, in registration order.

| Hook pair | Receives | Return value |
|-----------|----------|--------------|
| `hydrateRunProperties` / `dehydrateRunProperties` | a run `rPr` | `undefined` keeps the (possibly mutated) value; anything else replaces `run.rPr`. |
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | a paragraph `pPr` | Same contract; replaces `paragraph.pPr`. |
| `hydrateParagraph` / `dehydrateParagraph` | a paragraph | Same contract; replaces the paragraph in its text body. On hydrate it runs after the paragraph's `pPr` and runs hooks, on dehydrate before them. |
| `hydrateSlidePart` / `dehydrateSlidePart` | each slide, layout and master; each slide's `notes`, the `notesMaster` and the `handoutMaster` | Same contract; replaces the part where it sat. On hydrate it runs after the part's shapes, on dehydrate before them. |
| `hydrateTheme` / `dehydrateTheme` | `presentation.theme`, `notesMaster.theme`, `handoutMaster.theme`, when present | Same contract; replaces that theme. |
| `hydrateSettings` / `dehydrateSettings` | the **presentation** object | Ignored: mutate the presentation in place. |
| `hydratePackage` / `dehydratePackage` | `(presentation, ctx)`, outside the walk | `undefined` keeps the model; anything else replaces it. See [Package hooks](#package-hooks). |

### Package hooks

They run once per read or write, outside the walk.

- **`hydratePackage(presentation, ctx)`** runs inside `pptx.read`'s pass, before the walk, so the walk reaches what it adds. Its `ctx`:
  - `parts` (the package's parts, read without marking a part modelled) and `consume(partName)` (marks one modelled: it leaves `unmodelledParts`);
  - `package`, `rels`, `presPart`, `presRoot`, `presRels`;
  - `slideParts` (aligned with `presentation.slides`), `layoutParts` (with `presentation.slideLayouts`) and `masterParts` (with `presentation.slideMasters`);
  - `textOpts` (the read's text options).
- **`dehydratePackage(presentation, ctx)`** runs in `pptx.write` after the core has built its package and before it is zipped. Its `ctx`: `package` (to add or change parts, relationships and content types), `presPart`, `themePart`, and the written `slideParts`, `layoutParts` and `masterParts`.

## What is traversed

The walker goes through every shape of `presentation.slides`, then of `presentation.slideLayouts`, then of `presentation.slideMasters`. For each shape it visits the paragraphs of `shape.txBody`, then of each table cell's `txBody` (`shape.rows[].cells[]`); a group shape (the `typedGroups` read) is walked through its `shapes`, depth first.

For each paragraph it calls:

1. the `pPr` hook;
2. the `rPr` hook of each of its `runs` (and the `pPr` hook of a field's own `pPr`);
3. the paragraph hook.

On dehydrate the paragraph hook comes first. A paragraph without `pPr` and a run without `rPr` trigger no call for them.

Each slide, layout and master then gets the part hook, once. On dehydrate it comes before the part's shapes.

Each slide's `notes`, then the `notesMaster` and the `handoutMaster` are walked the same way: their shapes, then the part hook. The theme hook runs on the notes and handout masters' themes, then on the presentation's, once each. The settings hook runs last, once, with the presentation.

## Examples

```js
const walker = runtime.resolve('pptxWalker').createWalker();

const calls = [];
walker.use({
    hydrateParagraphProperties(pPr) { calls.push('paragraph'); return { ...pPr, seen: true }; },
    hydrateRunProperties(rPr) { calls.push('run'); rPr.seen = true; }
});

const presentation = {
    slides: [{ shapes: [{ txBody: { paragraphs: [{ pPr: {}, runs: [{ rPr: {} }, {}] }] } }] }],
    slideLayouts: [],
    slideMasters: []
};
walker.applyHydrate(presentation);

const paragraph = presentation.slides[0].shapes[0].txBody.paragraphs[0];
console.log(calls.join(' '));          // paragraph run
console.log(paragraph.pPr.seen, paragraph.runs[0].rPr.seen); // true true
```

Through `pptx`:

```js
const deck = runtime.resolve('pptx');
deck.use({ hydrateRunProperties(rPr) { rPr.seen = true; } });   // forwarded to this instance's walker
```

## Notes

- A hook that throws is not caught: the error reaches the caller of `pptx.read` / `pptx.write`.
- `hydrateSettings` receives the whole presentation, not a separate settings part.
- The walker only reaches what the orchestrator has already typed: an element left in `_extras` is not visited until an extension promotes it — see [Extending](../../guide/extending.md).

## See also

- [pptx](./pptx.md) — orchestrator (`use`, `read`, `write`).
- [docx-walker](../docx/docx-walker.md), [xlsx-walker](../xlsx/xlsx-walker.md) — the same registry contract for the other two formats.
- [Extending](../../guide/extending.md) — writing an extension.
