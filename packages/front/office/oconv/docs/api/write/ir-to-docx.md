---
module: oconvIrToDocx
category: oconv/write
dependencies: [oconvIr, docx]
returns: object
worker-safe: true
status: complete
---

# oconvIrToDocx

> `oconv-ir/v1` → `.docx` bytes, tier 2 structure-to-structure mapping.

**Module** `oconvIrToDocx` | **Source** `packages/front/office/oconv/src/write/ir-to-docx.js` | **Deps** `oconvIr`, `docx` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIrToDocx = runtime.resolve('oconvIrToDocx');
```

Reached in practice through `oconv.fromMd({ markdown, target: 'docx' })` or
`oconv.convert({ ..., target: 'docx' })` (`../oconv.md`); resolving it
directly is for a caller composing the IR itself.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `irToDocx` | `(ir: object, opts?: {assets?: Object<string, Uint8Array>}) => IrToDocxResult` | `{bytes: Uint8Array, losses: IrToDocxLoss[]}` | `Error` `oconv: invalid ir (<code> at <path>)` when `ir` fails `oconvIr.validate` |

`opts.assets` maps a markdown image destination (`![alt](diagram.png)` →
key `diagram.png`) to its encoded bytes; caller bytes win over the
reader-carried `escapes.docx.bytes` (see Notes). Omitted or `undefined`
reproduces the writer's original image-free behaviour exactly.

## Examples

### Write a heading + paragraph to `.docx`

```js
// `oconvIr.node` fills each node's frozen defaults (a bare
// `{ kind: 'run', text }` literal fails `oconvIr.validate` with `bad-prop`).
const irApi = runtime.resolve('oconvIr');
const ir = irApi.doc([
    irApi.node('heading', { level: 1 }, [irApi.node('run', { text: 'Title' })]),
    irApi.node('paragraph', {}, [irApi.node('run', { text: 'Hello world' })])
]);
const { bytes, losses } = oconvIrToDocx.irToDocx(ir);
// bytes — a non-empty .docx (OPC/ZIP) Uint8Array whose parts include
// word/document.xml and word/styles.xml (no word/numbering.xml: no list);
// losses deep-equals []
```

Executed against the live package (2026-10-03):
`bytes.length > 0`, the zip entries are `[Content_Types].xml`,
`_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels` and
`word/styles.xml`, and `losses` is `[]` for this document (no list, no
image, no unsupported block).

## Notes

- **Composes ONLY `docx`'s public API** — never an `@awacloud/ooxml`
  internal, never an edit inside `@awacloud/ooxml`. A missing capability is
  not patched here: the element is recorded as a loss.
- **Two explicit failures `docx.write` has, kept off the call path**:
  `docx.write` throws `docx/hyperlink-missing-rid` for a hyperlink with no
  explicit `rId`, and `docx/numbering-missing` for numbered paragraphs when
  `opts.numbering` is not supplied. This writer always allocates an explicit
  `rId` (`'rIdHl' + n`, 1-based document order, never bare `'rId' + n` to
  avoid colliding with `docx.write`'s own `rId1..` allocation for
  styles/numbering/settings) and builds ONE plain numbering part whenever
  the document contains at least one list: two abstract numberings (bullet,
  decimal), 9 levels each, wired to one concrete `numId` per top-level list
  (see the numbering rule below). Neither throw is reachable from here.
  Bullet levels write `lvlText` U+2022 with **no font**: U+2022
  is a plain Unicode glyph, and pinning `Symbol` on it rendered a
  missing-glyph box in viewers lacking that font; decimal levels are
  unchanged. Both defaults remain `@awacloud/ooxml`'s own behaviour; this module
  closes them from the caller side only.
- **Styles part — fixed, caller-invisible**: every write emits
  `word/styles.xml` through `docx.write`'s `opts.styles`, headings or not,
  with exactly these style ids: `Normal` (default paragraph style),
  `Heading1`..`Heading6` (based on / next `Normal`, bold, 16/14/13/12/11/11
  pt, 12 pt before / 4 pt after) and `TableGrid` (`Table Grid`, single
  borders on all six edges, 108 twips / 0.19 cm left and right cell
  padding), plus `docDefaults` Calibri 11 pt. Every
  referenced `w:pStyle` is defined; no unreferenced style is emitted.
  There is no option to supply or alter styles — tier 3 (caller styling)
  is still not promised.
- **Bordered, padded tables**: every table carries a typed `tblPr` —
  `{ style: 'TableGrid', borders: GRID_BORDERS, cellMargins: GRID_CELL_MARGINS }`,
  `GRID_BORDERS` being six `{ val: 'single', sz: 4, space: 0, color: 'auto' }`
  edges (top, left, bottom, right, insideH, insideV) and `GRID_CELL_MARGINS`
  `{ left: { w: 108, type: 'dxa' }, right: { w: 108, type: 'dxa' } }`
  (Word's built-in `Table Grid` padding, through `@awacloud/ooxml`'s typed
  `tblPr.cellMargins`). The direct borders and padding render whether or not a
  consumer resolves the style reference; without the padding, cell text
  touched the grid lines in Word (owner review, 2026-10-01).
- **`run.code` round-trips inline code symmetrically**: it writes
  `font: 'Courier New'` into the run's `rPr`, `@awacloud/ooxml` round-trips
  `rPr.font` through `<w:rFonts>`, and `../read/docx-to-ir.js`'s frozen
  monospace allowlist recognises `'courier new'` on the return leg — so
  `md → docx → md` keeps inline code as backticks.
- **One numbering instance per top-level list**: every top-level IR
  `list` gets its own `numId`, allocated in document order starting at 1
  (a fresh `w:num` per list, backed by the bullet or the decimal abstract
  numbering). Two adjacent same-kind lists therefore stay **two lists on
  re-read** — `docx-to-ir.js` sees two distinct numbering ids and does not
  merge them. Lists nested inside a top-level list share that list's
  scope: a nested list of the parent's kind reuses the parent's `numId`
  at `ilvl` = depth, and a nested list of the other kind gets the top-level
  list's second instance (allocated on first use). The number of `w:num`
  entries in `word/numbering.xml` equals the number of distinct
  (top-level list, kind) pairs. Example: a bullet list with a nested bullet
  list, followed by an ordered list, writes `numId` 1 (the bullet list and
  its nested item, `ilvl` 1) and `numId` 2 (the ordered list). Lists inside
  table cells are top-level within their cell and follow the same rule.
- **`row.header` has no docx counterpart** — the header row stays row 0
  positionally; the loss matrix documents this degrade, and it is
  deliberately **not** a per-node loss code (position preserves it on the
  return leg).
- The `docx` target is byte-reproducible: `@awacloud/ooxml` stamps every zip
  entry with a fixed 1980-01-01 00:00 timestamp, so two writes of the same IR
  give byte-identical containers, `word/styles.xml` and `word/document.xml`
  included (`src/write/ir-to-docx.test.js` "two calls produce byte-identical
  containers (fixed zip entry timestamp)"; `src/oconv.test.js` "the docx
  target is byte-reproducible across two calls"). The `odt` target is not: the
  ODF package writer stamps the current time, so two identical calls give
  equal document models but may give different bytes. The `pdf` target is
  byte-reproducible.
- See the [loss matrix](../../loss-matrix.md) for the published
  Preserved/Degraded/Dropped classification of every code below.

### Loss codes emitted by this module

| Code | Detail | Meaning |
|---|---|---|
| `list/depth-clamped` | `'ilvl>8'` | a list nested deeper than `ilvl` 8 was clamped to 8 |
| `block/degraded` | `'listItem-child:<kind>'` | a non-paragraph, non-list block inside a `listItem` was emitted after the item's paragraph rather than inside it |
| `block/degraded` | `'codeBlock'` | code block written as plain paragraphs, one per source line |
| `block/degraded` | `'blockquote'` | quotation written as its bare child blocks |
| `block/dropped` | `'hr'` | thematic break dropped |
| `image/dropped` | the image `name` | no bytes reachable — neither `opts.assets[name]` nor `escapes.docx.bytes` |
| `image/size-defaulted` | the image `name` | bytes were reachable and the image is placed at `@awacloud/ooxml`'s default 2 in × 4:3 box (no `cx`/`cy` passed — the image's intrinsic size is not applied) |

A degraded block nested in a `listItem` emits BOTH its
`listItem-child:<kind>` loss and its own degrade loss.

## See also

- [`ir-to-odt`](./ir-to-odt.md) — the equivalent `.odt` writer.
- [`ir-to-md`](./ir-to-md.md) / [`ir-to-pdf`](./ir-to-pdf.md) — the other
  two IR writers.
- [Loss matrix](../../loss-matrix.md) — published fidelity classification.
