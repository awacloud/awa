---
module: pmlPartDetails
category: extra
dependencies: [docxProperties, pmlTransitions, pmlAnimations, pmlNotes]
returns: object
worker-safe: true
status: complete
---

# pmlPartDetails

> The part-level elements of slides, layouts and masters that the pptx core leaves in `_extras`: the transition, the animation timing, the header / footer flags. A pptx walker extension, in [`pptx-full`](../bundles/pptx-full.md).

**Module** `pmlPartDetails` | **Source** `packages/front/office/ooxml/src/extra/pml-part-details.js` | **Deps** `docxProperties`, `pmlTransitions`, `pmlAnimations`, `pmlNotes` | **Worker-safe** yes

Registered through [`pptx-full`](../bundles/pptx-full.md), or with `pptx.use(...)`, it types three elements of each slide, layout and master. Each one is typed only when it is written back as read (`docxProperties.hydrateLossless`). Any other element stays in `_extras`.

## Resolve

```js
const ext = runtime.resolve('pmlPartDetails');
// Returns the walker hooks: hydrateSlidePart / dehydrateSlidePart.
```

## Fields typed

| Field | From | Codec |
|-------|------|-------|
| `transition` | `<p:transition>` | [`pmlTransitions`](./pml-transitions.md) `parseTransition` / `renderTransition` |
| `timing` | `<p:timing>` | [`pmlAnimations`](./pml-animations.md) `parseTiming` / `renderTiming` |
| `hf` | `<p:hf>` | [`pmlNotes`](./pml-notes.md) `parseHf` / `renderHf` |

On write the typed fields go back to `_extras`, and the core's writer places each element where the schema does.

## Notes

- **Left raw.** These are not written back as read once typed:
  - a transition with a sound (`<p:sndAc>`) or an `<p:extLst>`;
  - a timing that targets a SmartArt diagram (`<a:dgm>`) or animates to a DrawingML colour.
- **Why only `pptx-full`.** Moving these fields into [`pptx-large`](../bundles/pptx-large.md) would change what its readers (oview) find in `_extras`.

## See also

- [pptxWalker](../pptx/pptx-walker.md) — the hooks and what they visit.
- [dmlTextDetails](./dml-text-details.md) — the text details, the other extra of `pptx-full` that types a read.
