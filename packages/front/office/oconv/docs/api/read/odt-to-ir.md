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
- **Spans**: a span without `runs` (no element child in the source) maps to one IR run carrying its flattened text. A span with `runs` (odf lists its inner markup in document order) maps entry by entry: text, spacing (`text:s` → that many spaces), tabs (`\t`), line breaks (`\n`), links (target kept) and nested spans each give their own IR runs, and the span's flags are OR-ed onto every one of them, so the flags of nested spans add up. Each span with no resolved flag records its own `run/format-unresolved`.
- **Field text inside a span**: a raw element inside a span (a field, a reference, a note, a bookmark, a frame) keeps its text. When it holds text (its descendant text nodes, spacing elements contributing nothing), that text becomes one plain IR run carrying the span's flags and ONE loss is recorded: `image/unresolved` for a `draw:frame`/`draw:image` (a frame holding a text box), `inline/flattened` otherwise (detail = the element name — the text is kept, the field or reference meaning is not). When it holds no text (an empty bookmark, a frame holding an image only), nothing is emitted and the paragraph-level code is recorded: `image/unresolved` for a frame, `inline/dropped` otherwise.
- **Run formatting / lists**: a resolvable style (content-automatic OR a fully-mapped `styles.xml` `office:styles` entry, single style, no `style:parent-style-name` chain) yields real bold/italic/strike/monospace flags and a real `ordered` flag with **no loss**; an unresolved style keeps the legacy fallback and records `run/format-unresolved` / `list/numbering-unresolved`.
- **Tables**: rows/cells map 1:1, a `covered` cell (colSpan/rowSpan continuation) is skipped, and `table:number-rows/columns-repeated` are expanded — `oconv-ir/v1`'s `row`/`cell` carry no span props, so a spanning cell's content is kept and its covered continuations contribute nothing (no dedicated loss code).
- Loss codes this module emits: `heading/level-clamped`, `run/format-unresolved`, `list/numbering-unresolved`, `link/target-missing`, `image/unresolved` (a `draw:frame`/`draw:image` this reader's dependency list cannot resolve), `inline/flattened` (an element inside a span whose text is kept but whose meaning is not), `inline/dropped`, `block/dropped`.
- Nesting inside a list is real (a `list` node nested in a `listItem`), never flattened — unlike the docx reader's `list/nesting-flattened` case.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`oconvIr`](../ir/ir.md) — the pivot this reader produces
- [`oconv`](../oconv.md) — the facade composing this reader into `toMd`/`convert`
- [loss matrix](../../loss-matrix.md)
