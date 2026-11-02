---
module: oconvOdtToIr
category: oconv/read
dependencies: [oconvIr, odt]
returns: object
worker-safe: true
status: complete
---

# oconvOdtToIr

> `.odt` (`@awacloud/odf`'s `odt.read()` result) → `oconv-ir/v1`, tier 2.

**Module** `oconvOdtToIr` (`oconvOdtToIr`) | **Source** `packages/front/office/oconv/src/read/odt-to-ir.js` | **Deps** `oconvIr`, `odt` | **Worker-safe** yes

Pure transformation over an already-parsed `odt.read(bytes)` structure, composing `@awacloud/odf`'s public surface only. A capability the public surface does not expose is recorded as a loss, never worked around by reaching into `@awacloud/odf` internals.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const odt = runtime.resolve('odt');
const { odtToIr } = runtime.resolve('oconvOdtToIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `odtToIr` | `(readResult: object, opts?: object) => {ir, losses}` | `ir` — an `oconv-ir/v1` document; `losses` — `{code, detail}[]` in document order | — |

## Examples

### Convert an `.odt` read result to IR

```js
const { ir, losses } = odtToIr(odt.read(bytes));
ir.kind;   // 'document'
// measured on the vendored odt-structured.odt fixture:
// [{code:'run/format-unresolved', detail:'Emphasis'},
//  {code:'list/numbering-unresolved', detail:'WWNum1'}, ...]
```

### A span's inner markup is kept

```js
const xml = runtime.resolve('xml');
const spanBytes = odt.write({
    body: [{
        type: 'paragraph',
        runs: [{
            type: 'span',
            value: 'BCDE nb F. See Table 3.',
            runs: [
                { type: 'text', value: 'B' },
                { type: 'space', count: 3 },
                { type: 'text', value: 'C' },
                { type: 'tab' },
                { type: 'text', value: 'D' },
                { type: 'line-break' },
                { type: 'text', value: 'E ' },
                { type: 'span', value: 'nb', bold: true },
                { type: 'text', value: ' F. See ' },
                xml.el('text:reference-ref', { 'text:ref-name': 'tab3' }, [xml.text('Table 3')]),
                { type: 'text', value: '.' }
            ]
        }]
    }]
});
const out = odtToIr(odt.read(spanBytes));
out.ir.children[0].children.map((r) => r.text).join('');
// 'B   C\tD\nE nb F. See Table 3.'   ('nb' is the only bold run)
out.losses;
// [{code:'run/format-unresolved', detail:'(unnamed)'},
//  {code:'inline/flattened', detail:'text:reference-ref'}]
```

## Notes

- **Headings** use odt's own `outlineLevel` (`<text:h>`), never a style-name heuristic; a level above 6 is clamped to 6 with loss `heading/level-clamped`.
- **Table of contents** (`odtToIr(readResult, { include: ['toc'] })`, `toMd`'s `odtInclude`): a `text:table-of-content` maps in place to the paragraphs of its `text:index-body` (an index title's too), one IR paragraph each of the text the document shows — `text:s` its spaces, `text:tab` and `text:line-break` a space, whitespace collapsed, an empty entry skipped; page numbers kept, entry links not; no loss. Without it, `block/dropped` as before; other indexes stay dropped. `opts.include` is an array of distinct known names (`'toc'`), else `oconv: bad odt include`.
- **Heading outline numbers**: the document's outline style (`text:outline-style` in `styles.xml`, raw in `styles.styles` or typed in `styles.listStyles`) numbers its headings as an office suite shows them. A heading outside any list, whose level has a non-empty `style:num-format` and which is not a list header (`text:is-list-header`), advances its level's counter (`text:start-value` first; `text:restart-numbering` restarts it) and resets the deeper ones; its label — `style:num-prefix`, the counters of its last `text:display-levels` levels in their formats (`1`, `a`, `A`, `i`, `I`; any other format is written as `1`) joined by `.`, `style:num-suffix` — is its first run, followed by one space: `1.3 Normative References`, anchor `1-3-normative-references`. Other headings get no label; no outline style, no label. No loss.
- **Spans**: a span without `runs` (no element child in the source) maps to one IR run carrying its flattened text. A span with `runs` (odf lists its inner markup in document order) maps entry by entry: text, spacing (`text:s` → that many spaces), tabs (`\t`), line breaks (`\n`), links (target kept) and nested spans each give their own IR runs, and the span's flags are OR-ed onto every one of them, so the flags of nested spans add up. Each span with no resolved flag records its own `run/format-unresolved`.
- **Field text inside a span**: a raw element inside a span (a field, a reference, a note, a bookmark, a frame) keeps its text. When it holds text (its descendant text nodes, spacing elements contributing nothing), that text becomes one plain IR run carrying the span's flags and ONE loss is recorded: `image/unresolved` for a `draw:frame`/`draw:image` (a frame holding a text box), `inline/flattened` otherwise (detail = the element name — the text is kept, the field or reference meaning is not). When it holds no text (an empty bookmark, a frame holding an image only), nothing is emitted and the paragraph-level code is recorded: `image/unresolved` for a frame, `inline/dropped` otherwise.
- **Style semantics**: `oconv` reads with `odt.read(bytes, { semanticStyles: true })` too, so a span whose style states an emphasis among other properties (or through a parent) arrives with its flags and maps to an emphasised run, and a nested unstyled list arrives with its ancestor's numbering; a span whose style states none still records `run/format-unresolved`.
- **Frame runs**: a result read with `odt.read(bytes, { framesInRuns: true })` — what `oconv` does — carries each frame as a `{ type: 'frame' }` run at its place. An **image frame** becomes an IR `image` there: `name` = the frame's `draw:name`, else the picture path's basename; `alt` = its `svg:title`, else its `svg:desc`; the bytes of the package part it names travel in `escapes.odt` (`{ bytes, contentType }`, the manifest media type or `null`) for a writer to place. A missing or external part records `image/bytes-unavailable` and keeps the reference; a frame with no content child at all (only its `svg:title` / `svg:desc`, as oconv's odt writer writes an image it has no bytes for) is an image without bytes too (`name` = its `draw:name`, else `image`; `image/bytes-unavailable`); span flags never apply to an image; an image inside a link keeps no target (`inline/dropped`, detail `link-target`). Any other frame (a text box, an object) maps like the raw frame it replaces: `image/unresolved` (detail `draw:frame`), no IR node, except inside a span, where a frame holding text keeps it as one plain IR run.
- **Element runs**: a result read with `odt.read(bytes, { elementsInRuns: true })` — what `oconv` does, with `framesInRuns` — carries each untyped element of a paragraph, heading or link body (a cross-reference, a field, a bookmark, a soft page break) as a raw `{ type: 'element' }` run at its place; it follows the field-text rule above: text kept as one plain IR run at its place, `inline/flattened` (a `text:reference-ref` showing `4.3` keeps `4.3`); no text, `inline/dropped` (`image/unresolved` for a frame), no run. A result read without it keeps them in `_extras.children`, mapped as below.
- **A link's untyped children** (a field, a reference, a bookmark inside a `<text:a>` — odf keeps them on the link run's own `_extras.children`, re-emitted after its runs) follow the field-text rule above, after the link's runs: text kept as a plain IR run that carries the link target, `inline/flattened`; no text, `inline/dropped` (`image/unresolved` for a frame).
- **Empty paragraphs**: a plain paragraph whose runs map to no inline (an empty `text` run or span maps to none) is a spacer, skipped without a loss wherever blocks are walked — the body, sections, table cells, list items — as the docx reader skips it; so the Markdown carries no extra blank lines for it, and an `odt → docx → md` return reads as the direct `odt → md` does. An empty heading stays, an empty preformatted paragraph stays a blank line of its code block, an empty rule paragraph stays an `hr`.
- **Code blocks, quotes and rules** are read from the paragraph style — LibreOffice's built-in `Preformatted_20_Text` ("Preformatted Text"), `Quotations` and `Horizontal_20_Line` ("Horizontal Line"), which pandoc writes too — directly or through an automatic paragraph style whose parent it is (one hop): CONSECUTIVE `Preformatted Text` paragraphs form ONE `codeBlock` (`info` `''`), one line per paragraph, an empty paragraph a blank line, `text:s` / tabs / line breaks / spans / links kept as characters (a raw element or a frame inside records `inline/dropped`); CONSECUTIVE `Quotations` paragraphs form ONE `blockquote` (an empty one is skipped); an EMPTY `Horizontal Line` paragraph is an `hr` (with content it stays a paragraph). Two code blocks or two quotes with nothing between them read as one; quote nesting is not recoverable. This holds in the body, a table cell and a list item.
- **Run formatting / lists**: a resolvable style (content-automatic OR a fully-mapped `styles.xml` `office:styles` entry, single style, no `style:parent-style-name` chain) yields real bold/italic/strike/monospace flags and a real `ordered` flag with **no loss**; an unresolved style keeps the legacy fallback and records `run/format-unresolved` / `list/numbering-unresolved`.
- **Tables**: rows/cells map 1:1, a `covered` cell (colSpan/rowSpan continuation) is skipped, and `table:number-rows/columns-repeated` are expanded — `oconv-ir/v1`'s `row`/`cell` carry no span props, so a spanning cell's content is kept and its covered continuations contribute nothing (no dedicated loss code).
- Loss codes this module emits: `heading/level-clamped`, `run/format-unresolved`, `list/numbering-unresolved`, `link/target-missing`, `image/bytes-unavailable` (an image frame whose picture part is missing or external), `image/unresolved` (a `draw:frame`/`draw:image` this reader's dependency list cannot resolve), `inline/flattened` (an element inside a span whose text is kept but whose meaning is not), `inline/dropped`, `block/dropped`.
- **Task markers**: a list item whose first run, a plain text run, leads with `☐ ` or `☒ ` (a glyph followed by one space; the GFM task marker as `oconvIrToOdt` draws it) reads as `listItem.escapes.md.task` `'unchecked'` / `'checked'`, the marker stripped, so md → odt → md keeps `[ ]` / `[x]`. Anything else stays text.
- Nesting inside a list is real (a `list` node nested in a `listItem`), never flattened, as in the docx reader.
- **A heading alone in a list item**: a list item that holds headings alone (directly, or through nested lists whose items hold headings alone) — LibreOffice's numbered heading, `text:h` in a list item — gives those headings up at their place, the list split around them, without a loss, as the docx reader reads a numbered heading as a heading. The heading takes no outline number. An item that holds a heading among other content is unchanged.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconv`](../oconv.md) — the facade composing this reader into `toMd`/`convert`
- [loss matrix](../../loss-matrix.md)
