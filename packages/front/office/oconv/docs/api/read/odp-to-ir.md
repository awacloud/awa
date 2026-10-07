---
module: oconvOdpToIr
category: oconv/read
dependencies: [oconvIr, odp]
returns: object
worker-safe: true
status: complete
---

# oconvOdpToIr

> `.odp` (`@awacloud/odf`'s `odp.read()` result) → `oconv-ir/v1`, tier 1 — one heading + N paragraphs per slide.

**Module** `oconvOdpToIr` (`oconvOdpToIr`) | **Source** `packages/front/office/oconv/src/read/odp-to-ir.js` | **Deps** `oconvIr`, `odp` | **Worker-safe** yes

Pure transformation over an already-parsed `odp.read(bytes)` structure, composing `@awacloud/odf`'s public surface only — same contract as `oconvPptxToIr`.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const odp = runtime.resolve('odp');
const { odpToIr } = runtime.resolve('oconvOdpToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `odpToIr` | `(readResult: object, opts?: {includeNotes?: boolean}) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` | — |

## Examples

### Convert an `.odp` read result to IR, including speaker notes

```js
const { ir, losses } = odpToIr(odp.read(bytes), { includeNotes: true });
ir.kind;   // 'document'
```

## Notes

- **Title** — the first `<draw:frame>` whose raw `presentation:class` attribute is `title`; a title frame present but carrying no non-empty text counts as "no title" (loss `slides/untitled`).
- **Body** — every other frame whose child is a `text-box`, in frame order; each top-level child becomes one IR paragraph.
- **Notes are real here**, unlike pptx: `slide.notes.body` is natively parsed by `@awacloud/odf` — with `includeNotes:true` it becomes a trailing `blockquote`; with `includeNotes:false` (the default) it records `slides/notes-omitted` instead.
- Loss codes this module emits: `slides/untitled`, `slides/media-dropped` (a frame whose child is `image`/`object`, detail = the child's `kind`), `slides/notes-omitted`.
- Layout/animations (`masterPageName`/`layoutName`) are permanently out of scope and never reach a per-node loss — `odp.read()`'s public surface models no animation/transition data at all.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconvPptxToIr`](./pptx-to-ir.md) — the OOXML sister reader (notes are NOT reachable there)
- [loss matrix](../../loss-matrix.md)
