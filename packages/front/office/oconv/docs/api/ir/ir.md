---
module: oconvIr
category: oconv/ir
dependencies: []
returns: object
worker-safe: true
status: complete
---

# oconvIr

> The `oconv-ir/v2` pivot document model every reader and writer shares.

**Module** `oconvIr` (`oconvIr`) | **Source** `packages/front/office/oconv/src/ir/ir.js` | **Deps** — | **Worker-safe** yes

The pivot sits between the format-aware readers (`<fmt>ToIr`) and writers (`irTo<Fmt>`), so the conversion matrix costs N+M adapters instead of N×M. The module imports nothing — not an office package, not `@awacloud/fw` — so the vocabulary itself carries no host or format assumption; anything a single reader/writer pair needs but the pivot does not model travels in the per-node opaque `escapes` bag, which this module never reads, clones or interprets.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIr = runtime.resolve('oconvIr');
```

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `IR_VERSION` | `string` | `'oconv-ir/v2'` | — |
| `KINDS` | `string[]` | the 15 node kinds (v1's 13 and v2's `field` and `note`), declaration order | — |
| `node` | `(kind: string, props?: object, children?: IrNode[]) => IrNode` | one IR node of `kind` | `TypeError` on an unknown `kind` |
| `doc` | `(children?: IrBlock[], props?: object) => IrDocument` | convenience root constructor (`node('document', …)`) | — |
| `walk` | `(root: IrNode, visit: (n, parent, depth) => boolean\|void) => void` | depth-first, pre-order traversal; `visit` returning `false` skips that node's children | — |
| `validate` | `(root: IrNode) => {ok: boolean, errors: IrError[]}` | structural check — never throws | — |
| `withoutNotes` | `(root: IrNode) => {ir: IrNode, dropped: string[]}` | `root` without its notes, in the body and the regions, and the class of each note removed, in document order; `root` itself when it holds none (v2) | — |
| `withFieldsAsRuns` | `(root: IrNode) => IrNode` | `root` with each `field` a plain `run` of its text, in the body and the regions; `root` itself when it holds no field, else a copy sharing every field-free subtree (v2) | — |

The 15 node kinds (`KINDS`): `document`, `heading`, `paragraph`, `run`, `field`, `note`, `table`, `row`, `cell`, `list`, `listItem`, `image`, `codeBlock`, `blockquote`, `hr`. Every node is a plain object `{ kind, …props, children?, escapes? }` — `children` is present exactly on container kinds, `escapes` only when a producer supplied one. `validate`'s `errors[].code` is one of `unknown-kind`, `not-an-object`, `bad-prop`, `bad-children`, `unexpected-children`, `bad-child`, `bad-escapes`.

### v2: the tier-3 props

`oconv-ir/v2` is v1's vocabulary plus optional typed props for styles and page layout (tier 3). A node without them, as a v1 producer writes it, validates unchanged; `node()` gives each its default, `null` ("not stated"), and a writer that meets `null` keeps its own default.

| Kind | Prop | Value |
|---|---|---|
| `paragraph`, `heading` | `align` | `null` (not stated), or `'start'`, `'center'`, `'end'`, `'justify'`. Anything else fails with `bad-prop`. |
| `paragraph`, `heading` | `breakBefore` | `false` (the default) or `true`: a page break before the block. Anything else fails with `bad-prop`. |
| `run` | `size`, `font`, `color`, `script` | each `null` when not stated: `size` points (> 0), `font` a non-empty name, `color` `#rrggbb` (lowercase), `script` `'super'` or `'sub'`. Anything else fails with `bad-prop`. |
| `run` | `underline` | `false` (the default) or `true`. |
| `document` | `page` | `null`, or `{ width, height, orientation, margins }`: the page size in points (finite, > 0), `orientation` `'portrait'` or `'landscape'`, `margins` `null` or `{ top, right, bottom, left }` in points (finite, ≥ 0). Anything else fails `validate` with `bad-prop` (`document.page must be page`). |
| `document` | `header`, `footer` | `null` (none stated), or a region `{ default, first, even }`: `default` an array of blocks; `first` and `even` `null` or absent (no distinct one: the default applies on the first page, on even pages) or an array of blocks (`[]`: a distinct, empty one). A slot's blocks are validated as the body's (paths `$.header.default[0]`, …); another shape fails with `bad-prop` (`document.header must be region`). `walk` does not enter the regions. |
| `note` (inline) | `class`, `mark` | an inline container at its reference: `class` `'footnote'` (the default) or `'endnote'`, `mark` `null` (an automatic number) or a non-empty string (a custom mark); its `children` are the note's blocks, which `walk` and `validate` go through. |
| `field` (inline) | `name`, `text`, and a run's formatting props | a leaf beside `run` and `image`: `name` `'page'` (the page number) or `'pages'` (the page count), `text` the value the source shows (`''` by default); `bold`, `italic`, `strike`, `code`, `size`, `font`, `color`, `underline` and `script` with a run's defaults and checks (no `link`). |

The docx reader fills these props under its opt-in `include: ['layout']`; the odt writer writes the page as the document's page layout, an `align` or a `breakBefore` as an automatic paragraph style, a run's values as an automatic text style, the regions as the master page's headers and footers and a field as `text:page-number` or `text:page-count` (`convert`'s `layout`, [`docs/convert.md`](../../convert.md)). The md, docx and pdf writers write a field as its text and record a region as `layout/region-dropped`.

## Examples

### Build and validate a small document

```js
const heading = oconvIr.node('heading', { level: 1 }, [
    oconvIr.node('run', { text: 'Hi' })
]);
const document = oconvIr.doc([heading]);

oconvIr.IR_VERSION;              // 'oconv-ir/v2'
oconvIr.validate(document).ok;   // true
```

## Notes

- `node()` fills in every declared prop's default for a key the caller omits (e.g. a `run` with no `bold` gets `bold: false`) — unknown prop keys are silently ignored (`src/ir/ir.js`'s `node()`); pair-specific data belongs in `props.escapes`, never in an invented prop.
- `validate` reports `bad-child` (not `unknown-kind`) when a malformed node sits in a parent slot whose spec constrains accepted child kinds; `unknown-kind` only fires when `validate` runs directly on the offending node itself.
- `walk`'s `visit` callback receives `(node, parent, depth)`; returning exactly `false` prunes that subtree, any other return value (including `undefined`) continues into the children.
- The full node-kind → props/children table lives in this file's own header comment (`src/ir/ir.js`) — every reader and writer page on this index cites the subset of kinds it actually produces or consumes.

## See also

- [docs/api/README.md](../README.md) — full module index + `exports` boundary note
- [`docx-to-ir`](../read/docx-to-ir.md), [`odt-to-ir`](../read/odt-to-ir.md), [`md-to-ir`](../read/md-to-ir.md) — readers producing this IR
- [`oconv`](../oconv.md) — the facade composing readers and writers over this pivot
- [loss matrix](../../loss-matrix.md)
