---
module: oconvDocxToIr
category: oconv/read
dependencies: [oconvIr, docx]
returns: object
worker-safe: true
status: complete
---

# oconvDocxToIr

> `.docx` (`@awacloud/ooxml`'s `docx.read()` result) → `oconv-ir/v1`, tier 2.

**Module** `oconvDocxToIr` (`oconvDocxToIr`) | **Source** `packages/front/office/oconv/src/read/docx-to-ir.js` | **Deps** `oconvIr`, `docx` | **Worker-safe** yes

Pure transformation over an already-parsed `docx.read(bytes)` structure — no bytes, no I/O of its own. Composes only `docx`'s public API, never an `@awacloud/ooxml` internal.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const docx = runtime.resolve('docx');
const { docxToIr } = runtime.resolve('oconvDocxToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `docxToIr` | `(readResult: object, opts?: object) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` in document order | — |

## Examples

### Convert a `.docx` read result to IR

```js
const { ir, losses } = docxToIr(docx.read(bytes));
ir.kind;      // 'document'
losses;       // [] for a plain document with no tracked features
```

## Notes

- **Headings** are resolved from `pPr.pStyle` in three steps:
  1. a style ID matching `Heading1`..`Heading6` (case-insensitive) gives that level;
  2. otherwise the style's built-in `w:name` is looked up in the document's `styles.xml` (`readResult.styles`). Built-in names stay language-invariant when Word localizes the ID — a French `Titre1` is still named `heading 1` — so `heading 1`..`heading 6` give that level;
  3. the built-in name `Title` becomes a level-1 heading; `Subtitle` becomes a plain paragraph and records `heading/subtitle-degraded` (detail = the style ID, one loss per subtitle paragraph, even an empty one).

  A style ID that matches no rule and whose name resolves to nothing stays a paragraph with no loss — the reader cannot know it was meant as a heading. **Limit**: a document without a `styles.xml` part has no names to resolve, so only step 1 applies and a localized `Titre1` reads as a plain paragraph. `basedOn` chains, numbered heading styles, character styles and `w:aliases` are not consulted. A resolved heading style takes precedence over `pPr.numPr`.
- **Monospace runs** (`run.code`) are detected by a frozen, name-based allowlist of `rPr.font` values (`consolas`, `courier new`, …, `src/read/docx-to-ir.js`'s `MONO_FONTS`); a font outside the list yields a plain run with no per-node loss.
- **Lists**: consecutive paragraphs sharing one `pPr.numPr.numId` group into one IR `list`; an item at `ilvl > 0` is flattened into the enclosing single-level list (loss `list/nesting-flattened`, recorded once per document, not once per item); a `numId` that does not resolve to a concrete `<w:num>` falls back to `list{ordered:false}` (loss `list/numbering-unresolved`).
- **Tables**: no row is ever marked `header` — `docx.read()` surfaces no first-class header-row signal.
- Loss codes this module emits: `heading/subtitle-degraded` (a paragraph styled `Subtitle` kept as a plain paragraph, detail = its style ID), `link/target-missing` (an unresolved hyperlink `rId`, text kept), `list/numbering-unresolved`, `list/nesting-flattened`, `image/bytes-unavailable` (a drawing's image bytes did not resolve on read), `block/dropped` (an unmapped body/cell node, detail = its `type`).
- Page layout, sections, headers/footers, footnotes, comments, tracked changes and font colours are permanently out of scope and never reported per node — see the loss matrix for the full docx→md row.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconv`](../oconv.md) — the facade composing this reader into `toMd`/`convert`
- [loss matrix](../../loss-matrix.md)
