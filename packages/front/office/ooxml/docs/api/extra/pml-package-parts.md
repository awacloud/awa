---
module: pmlPackageParts
category: extra
dependencies: [xml, opcPackage, opcRelationships, markupCompatibility, docxProperties, pptxSlide, pptxTheme, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# pmlPackageParts

> The pptx parts the core's read leaves unmodelled: the slide layouts no slide uses, the notes slides, the notes master and the handout master, with their themes. A pptx walker extension on the package hooks, in [`pptx-full`](../bundles/pptx-full.md).

**Module** `pmlPackageParts` | **Source** `packages/front/office/ooxml/src/extra/pml-package-parts.js` | **Deps** `xml`, `opcPackage`, `opcRelationships`, `markupCompatibility`, `docxProperties`, `pptxSlide`, `pptxTheme`, `ooxmlShared` | **Worker-safe** yes

Registered through [`pptx-full`](../bundles/pptx-full.md), or with `pptx.use(...)`, it reads those parts into the model and writes them back. Each part is read only when it would be written back as read; any other stays in `unmodelledParts`, as the core leaves it.

## Resolve

```js
const ext = runtime.resolve('pmlPackageParts');
// Returns the walker's package hooks: hydratePackage / dehydratePackage.
```

## What it reads

| Part | Becomes | Condition |
|------|---------|-----------|
| A notes slide | its slide's `notes` (`type: 'notes'`) | its relationships are its slide and a notes master |
| The notes master | `presentation.notesMaster`, with its `theme` | its one relationship is its theme |
| The handout master | `presentation.handoutMaster`, with its `theme` | its one relationship is its theme |
| The layouts no slide uses | `presentation.slideLayouts`, in the master's `sldLayoutIdLst` order | one slide master; every layout of its list passes, or none is read |

Every part must also be written back as read. Its root, re-rendered by the core's parser and writer ([`pptxSlide`](../pptx/slide.md) or [`pptxTheme`](../pptx/theme.md)), must be `docxProperties.sameElement` to the source after markup-compatibility processing (namespace declarations and `mc:Ignorable` aside). The part must also carry no `r:` reference.

Each notes part is parsed as a slide is: `shapes` with typed text bodies, `clrMapOvr` or `clrMap`, a notes master's `notesStyle`, the rest in `_extras`. The walker visits them like a slide (text, paragraph and part hooks) and their themes like the theme.

When the unused layouts are read, each slide's `layoutRef` is remapped to the new list, and the master's `layoutIds` name the relationships the write gives the layouts (`rId1`…).

## What it writes

After the core has built its package, the write adds:

- the notes slides (`/ppt/notesSlides/notesSlide<k>.xml`, after the slide's index), each with its relationships to the notes master and its slide;
- a relationship from each of those slides to its notes slide;
- the notes master and the handout master, each with its relationship to its theme (written as `/ppt/theme/theme<n>.xml`, or the main theme when the model has none);
- the presentation's `p:notesMasterIdLst` / `p:handoutMasterIdLst` and their relationships;
- the content types.

A model whose slides have `notes` but no `notesMaster` gets a minimal notes master on the main theme.

## Notes

- **Left unmodelled.** In the wild corpus:
  - a part naming an image or a hyperlink;
  - the layouts of a presentation with more than one slide master (the core's write puts every layout under the first);
  - a notes master with an empty `<a:pPr/>` (the core drops it);
  - a theme root without `name`.
- **Why only `pptx-full`.** Adding these fields to [`pptx-large`](../bundles/pptx-large.md) would change what its readers (oview) find in the model.

## See also

- [pptxWalker](../pptx/pptx-walker.md) — the package hooks and what the walk visits.
- [pmlPartDetails](./pml-part-details.md) — types the `hf` of the notes and handout masters, as it does a slide master's.
- [pmlNotes](./pml-notes.md) — the toolkit codecs for the same parts, which a read never calls.
