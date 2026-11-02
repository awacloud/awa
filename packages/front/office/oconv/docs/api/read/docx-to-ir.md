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
| `docxToIr` | `(readResult: object, opts?: {include?: string[]}) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` in document order | `oconv: bad docx include` — `opts.include` not an array of distinct known names |

`opts.include` — the opt-in parts brought back, as the odt reader's: `'toc'` reads a table of contents control's entries as paragraphs (below). Absent or `[]`: none.

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
- **Code blocks, quotes and rules** are read from the paragraph style too (a paragraph without `pPr.numPr`), by its built-in name — or, when `styles.xml` does not define the ID, by the ID split at its case changes (`SourceCode` → `source code`), so pandoc's and `oconvIrToDocx`'s IDs resolve without a styles part:
  - `Source Code` → a `codeBlock` (`info` `''`) whose text is the paragraph's text, a line break giving `\n` and a tab `\t`. One paragraph is one code block: adjacent code paragraphs are not merged, and an empty one is skipped like any spacer;
  - `Block Text`, `Quote`, `Intense Quote` → a quoted paragraph; CONSECUTIVE quoted paragraphs form ONE `blockquote` (an empty one is skipped without closing the quote). Quote nesting cannot be recovered — two quotes with nothing between them read as one;
  - `Horizontal Rule` → an `hr` when the paragraph is empty; with text it stays a paragraph.
- **Monospace runs** (`run.code`) are detected by a frozen, name-based allowlist of `rPr.font` values (`consolas`, `courier new`, …, `src/read/docx-to-ir.js`'s `MONO_FONTS`); a font outside the list yields a plain run with no per-node loss.
- **Lists**: the consecutive list paragraphs of one `numId` form one list tree by `ilvl`: the lowest `ilvl` is the root level, a deeper item opens a nested list in the last item above (an item holding only the nested list when a level is skipped), a shallower one goes back to its level's list, and each list is ordered by its own level's `numFmt`; a paragraph of another `numId` deeper than the group's first item nests in it (oconv's docx writer gives each list kind its own `numId`, and Word lays it out indented under), while a change of `numId` at the first level starts a new list; a `numId` that does not resolve to a concrete `<w:num>` gives unordered lists (loss `list/numbering-unresolved`, once per `numId` of a group). Nesting is kept, never flattened.
- **Tables**: no row is ever marked `header` — `docx.read()` surfaces no first-class header-row signal. A table without a row holds nothing and is skipped without a loss, as an empty paragraph is. A cell inside a content control is an ordinary cell of its row (`docx.read()` reads it in place), so its text is read.
- **Content controls**: a block-level content control (`blockSdt`, in the body or a cell) is read in place — its paragraphs, tables and nested controls walked as the blocks around it are, an open list or quote left open across its bounds; its properties are not content. A table of contents control (`w:docPartObj` gallery `Table of Contents`) is dropped with `block/dropped`, detail `toc` — the odt reader's default for `text:table-of-content`; under `opts.include: ['toc']` it is read in place as one plain paragraph per paragraph (nested controls too) of the text the document shows (`docx.toText`: field instructions and tracked deletions left out, a tab a space), whitespace collapsed and trimmed, an empty one skipped, no loss — its links (to heading bookmarks the IR does not carry) are not kept.
- **Tracked changes and range markup**: the accepted view is read. An insertion and a move destination (`ins`, `moveTo`) are read as their content, a hyperlink inside one keeping its link; a deletion and a move source (`del`, `moveFrom`) are dropped without a loss. Between blocks, bookmarks, comment ranges and revision range markers (`bookmarkStart`, `bookmarkEnd`, `commentRangeStart`, `commentRangeEnd`, `rangeMarker`) are skipped without a `block/dropped` loss and without closing an open list or quote.
- **Task markers**: a list item whose first run, a plain text run, leads with `☐ ` or `☒ ` (a glyph followed by one space; the GFM task marker as `oconvIrToDocx` draws it) reads as `listItem.escapes.md.task` `'unchecked'` / `'checked'`, the marker stripped, so md → docx → md keeps `[ ]` / `[x]`. The glyph with no space, after other text, outside a list, or `☑` stays text.
- **Images**: each `w:drawing` is an IR `image` named after its `wp:docPr` name (else its `pic:cNvPr` name, else `image`), its alt text the drawing's description, its bytes in `escapes.docx` when the picture part resolves (a chart, a shape or a SmartArt has none: `image/bytes-unavailable`). A document may repeat a drawing name, an asset may not: the first image of a name keeps it, a later one takes the first free `<name> (k)`, k from 2 (the odt writer's rule for frame names), so two distinct pictures never share one asset in `toMd`.
- Loss codes this module emits: `heading/subtitle-degraded` (a paragraph styled `Subtitle` kept as a plain paragraph, detail = its style ID), `link/target-missing` (an unresolved hyperlink `rId`, text kept), `list/numbering-unresolved`, `image/bytes-unavailable` (a drawing's image bytes did not resolve on read), `block/dropped` (an unmapped body/cell node, detail = its `type`).
- Page layout, sections, headers/footers, footnotes, comments, revision history (who changed what, when) and font colours are permanently out of scope and never reported per node — see the loss matrix for the full docx→md row.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconv`](../oconv.md) — the facade composing this reader into `toMd`/`convert`
- [loss matrix](../../loss-matrix.md)
