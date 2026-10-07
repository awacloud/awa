---
module: oconvPptxToIr
category: oconv/read
dependencies: [oconvIr, pptx]
returns: object
worker-safe: true
status: complete
---

# oconvPptxToIr

> `.pptx` (`@awacloud/ooxml`'s `pptx.read()` result) → `oconv-ir/v1`, tier 1 — one heading + N paragraphs per slide.

**Module** `oconvPptxToIr` (`oconvPptxToIr`) | **Source** `packages/front/office/oconv/src/read/pptx-to-ir.js` | **Deps** `oconvIr`, `pptx` | **Worker-safe** yes

Pure transformation over an already-parsed `pptx.read(bytes)` structure. There is no "section" node in the frozen IR vocabulary, so each slide contributes a flat run of top-level blocks in slide order.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const pptx = runtime.resolve('pptx');
const { pptxToIr } = runtime.resolve('oconvPptxToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `pptxToIr` | `(readResult: object, opts?: {includeNotes?: boolean}) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` | — |

## Examples

### Convert a `.pptx` read result to IR

```js
const { ir, losses } = pptxToIr(pptx.read(bytes), { includeNotes: false });
ir.kind;   // 'document'
```

## Notes

- **Title** — the first shape whose `placeholder.type` is `'title'` or `'ctrTitle'`; a title shape present but carrying no non-empty text counts as "no title" (loss `slides/untitled`).
- **Body** — every other shape carrying a `txBody`, in shape order, one IR `paragraph` per non-empty text paragraph.
- **`includeNotes` is a documented no-op for pptx**: `pptx.read()`'s public return shape never surfaces speaker notes (no `notes` field on a slide, no relationship resolution to `notesSlide<n>.xml`), so this reader never emits a notes blockquote and never records `slides/notes-omitted` for pptx — the option is accepted only for frozen shape parity with `oconvOdpToIr`, whose underlying format does expose notes.
- Loss codes this module emits: `slides/untitled`, `slides/media-dropped` (a `picture`/`table`/`chart`/`graphicFrame` shape, detail = its `type`), `slides/notes-omitted` (never actually reachable for pptx — see above).
- Layout and animations (`layoutRef`, transitions) are permanently out of scope and never reach a per-node loss — `pptx.read()`'s public result does not even model them.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconvOdpToIr`](./odp-to-ir.md) — the ODF sister reader (notes ARE reachable there)
- [loss matrix](../../loss-matrix.md)
