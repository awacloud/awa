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
| `hasExtensions` | getter `boolean` | `true` once at least one extension is registered. Both `apply*` calls do nothing while it is `false`. |
| `extensions` | getter `object[]` | A copy of the registered extensions, in registration order. |

## Hooks

An extension is a plain object implementing any subset of the hooks; a member that is not a function is ignored. Hooks are called as `hook(value)`, in registration order.

| Hook pair | Receives | Return value |
|-----------|----------|--------------|
| `hydrateRunProperties` / `dehydrateRunProperties` | a run `rPr` | `undefined` keeps the (possibly mutated) value; anything else replaces `run.rPr`. |
| `hydrateParagraphProperties` / `dehydrateParagraphProperties` | a paragraph `pPr` | Same contract; replaces `paragraph.pPr`. |
| `hydrateSettings` / `dehydrateSettings` | the **presentation** object | Ignored: mutate the presentation in place. |

## What is traversed

For every shape of `presentation.slides`, then `presentation.slideLayouts`, then `presentation.slideMasters`, the walker visits `shape.txBody.paragraphs`: for each paragraph its `pPr`, then the `rPr` of each of its `runs`. A paragraph without `pPr` and a run without `rPr` trigger no call. The settings hook runs last, once, with the presentation. Nothing outside those three collections (for example notes pages) is visited.

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
