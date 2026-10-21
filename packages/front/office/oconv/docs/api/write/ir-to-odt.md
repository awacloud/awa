---
module: oconvIrToOdt
category: oconv/write
dependencies: [oconvIr, odt]
returns: object
worker-safe: true
status: complete
---

# oconvIrToOdt

> `oconv-ir/v1` → `.odt` bytes, tier 2, composing `@awacloud/odf`'s typed body model and typed named styles.

**Module** `oconvIrToOdt` | **Source** `packages/front/office/oconv/src/write/ir-to-odt.js` | **Deps** `oconvIr`, `odt` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvIrToOdt = runtime.resolve('oconvIrToOdt');
```

Reached in practice through `oconv.fromMd({ markdown, target: 'odt' })` or
`oconv.convert({ ..., target: 'odt' })` (`../oconv.md`).

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `irToOdt` | `(ir: object, opts?: {assets?: Object<string, Uint8Array>}) => IrToOdtResult` | `{bytes: Uint8Array, losses: IrToOdtLoss[]}` | `Error` `oconv: invalid ir (<code> at <path>)` when `ir` fails `oconvIr.validate` |

`opts.assets` is the same manifest `oconvIrToDocx`/`oconvIrToPdf` take
(`{ <markdown image destination>: Uint8Array }`, keyed verbatim). An image
whose bytes are reachable is **placed** as a `Pictures/` package part at
its intrinsic size (a default box and `image/size-defaulted` when no size can
be read from its header), with its alt text as the frame title; an image
with no reachable bytes is dropped and records `image/dropped` (see Notes).

## Examples

### Write a heading + paragraph to `.odt`

```js
// Build the IR with the oconvIr helpers: a bare-literal node tree does not
// pass `oconvIr.validate`.
const { node, doc } = runtime.resolve('oconvIr');
const ir = doc([
    node('heading', { level: 1 }, [node('run', { text: 'Title' })]),
    node('paragraph', {}, [node('run', { text: 'Hello world' })])
]);
const { bytes, losses } = oconvIrToOdt.irToOdt(ir);
// bytes — a non-empty .odt (package/ZIP) Uint8Array; losses === []

const odt = runtime.resolve('odt');
odt.read(bytes).body[0];
// { type: 'heading', outlineLevel: 1, styleName: 'Heading_20_1', runs: [...] }
```

Executed against the live package (2026-10-12):
`bytes.length > 0`, `losses` is `[]`, `styles.xml` defines the twelve named
styles `Standard, Text_20_body, Heading, Heading_20_1..Heading_20_6,
Preformatted_20_Text, Quotations, Horizontal_20_Line`, and
`odt.read(bytes).body[0]` reads back `styleName: 'Heading_20_1'`,
`outlineLevel: 1`.

### Place an image from `opts.assets`

```js
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
const withImage = doc([
    node('paragraph', {}, [
        node('run', { text: 'Logo: ' }),
        node('image', { name: 'logo', alt: 'Logo' })
    ])
]);
const placed = oconvIrToOdt.irToOdt(withImage, { assets: { logo: png } });
placed.losses;
// [{ code: 'image/size-defaulted', detail: 'logo' }]

const zip = runtime.resolve('zip');
Object.keys(zip.unzipSync(placed.bytes)).filter((p) => p.startsWith('Pictures/'));
// ['Pictures/image1.png']

oconvIrToOdt.irToOdt(withImage).losses; // no assets, no carried bytes
// [{ code: 'image/dropped', detail: 'logo' }]
```

Executed against the live package (2026-10-12): the 8 signature bytes
carry no `IHDR`, so no size is read and the placed write's
`losses` is `[{ code: 'image/size-defaulted', detail: 'logo' }]`, its only
`Pictures/` entry is `Pictures/image1.png` holding the 8 input bytes, its
`content.xml` carries one `<draw:frame text:anchor-type="as-char"
svg:width="5.08cm" svg:height="3.81cm">` whose `draw:image` has
`xlink:href="Pictures/image1.png"` followed by the `svg:title` `Logo`, and
the write without `assets` records
`[{ code: 'image/dropped', detail: 'logo' }]`.

## Notes

- **Styles part — fixed, caller-invisible**: every write emits
  `styles.xml` through `odt.write(doc, { styles })`, headings or not, with
  exactly twelve typed named paragraph styles, in this order: `Standard`;
  `Text_20_body` (`Text body`, based on `Standard`, 0 / 0.247 cm margins);
  `Heading` (based on `Standard`, next `Text_20_body`, keep-with-next,
  0.423 / 0.141 cm margins); `Heading_20_1`..`Heading_20_6` (`Heading 1`..
  `Heading 6`, based on `Heading`, next `Text_20_body`,
  `style:default-outline-level` N, bold, 16/14/13/12/11/11 pt — the same
  sizes as the docx writer's 32/28/26/24/22/22 half-points);
  `Preformatted_20_Text` (`Preformatted Text`, `Liberation Mono` — generic
  `modern`, fixed pitch — 10 pt, no margins); `Quotations` (1 cm left and
  right margins); `Horizontal_20_Line` (`Horizontal Line`, a 0.5 pt grey
  bottom border) — LibreOffice's built-in names. Every
  `text:h` names `Heading_20_<level>` (`_20_` is LibreOffice's encoding of
  a space in the programmatic style name), so every referenced style is
  defined. The name is presentation only: the read leg recovers the level
  from `outlineLevel`, and a read heading simply carries the extra
  `styleName`. There is no option to supply or alter styles — tier 3
  (caller styling) is still not promised; heading sizes are fixed points,
  not LibreOffice's percentages.
- **Bordered tables**: every table is written with `grid: true`.
  `@awacloud/odf` then synthesises the bordered cell style `awa-c-b`
  (`fo:border` single line) and the margins-aligned table style `awa-tb-m`
  (`table:align="margins"`) as automatic styles; this module still builds
  neither. On read, `odt.read` consumes and drops those styles: the table
  reads back `grid: true`, its cells carry no `styleName`, and `autoStyles`
  stays undefined. List levels carry the label-alignment
  `style:list-level-properties` geometry (also odf's) and the bullet no
  font.
- **The odf typed write model expresses run emphasis, hyperlinks, ordered
  vs. bullet lists and text-body tables WITHOUT loss** — `odt.write` (body
  plus the fixed `{ styles }` above) synthesizes the automatic styles
  (`awa-t-*`/`awa-l-*`, `awa-c-b`/`awa-tb-m` for `grid` tables) and
  font-face declarations itself; this module never builds
  `autoStyles`/`fontFaces` explicitly. What remains genuinely inexpressible through the typed model
  is degraded with an exact, non-silent loss ledger entry per occurrence —
  never a raw-XML passthrough node (compose-never-reimplement).
- **No empty paragraphs are emitted.** A code block writes one paragraph
  per source line and drops exactly ONE trailing newline first (the text
  of a CommonMark code block ends with one), so there is no trailing empty
  paragraph; an interior empty line is kept (`'a\n\nb\n'` writes `a`, an
  empty paragraph, `b`). A paragraph whose images are ALL dropped and that
  has no text run emits no odt node at all — the image loss alone is
  recorded (`image/dropped`). An empty odt paragraph would collapse on the
  next markdown parse, so this is what keeps md → odt → md stable on a
  second pass. A placed image is a run, so an image-only paragraph whose
  image is placed does produce a paragraph.
- **`code` maps to `monospace`** on a `span` run (`mapRunFlags`); a run with
  no truthy flag is a plain `text` run, never a `span`.
- **Code blocks, quotes and rules are styled, and read back**: a
  `codeBlock` is one `Preformatted_20_Text` paragraph per source line (an
  empty line is an empty paragraph, the text's one trailing newline writes
  none); a run of two or more spaces, or a space that starts a line or
  follows a tab, is written as `text:s` (ODF collapses plain spaces), a tab
  as `text:tab`; the `info` string is not written. A `blockquote`'s
  paragraphs are `Quotations` paragraphs; a nested quote's paragraphs too
  (`block/degraded`, `blockquote:nested`), and any other block inside a
  quote keeps its own mapping (`block/degraded`,
  `blockquote-child:<kind>`). An `hr` is an empty `Horizontal_20_Line`
  paragraph. `../read/odt-to-ir.js` reads the three styles back, so
  `md → odt → md` keeps a fenced code block (indentation included, without
  its info string), a quote and a rule.
- **Ordered lists carry `numFormat: '1'`** (md ordered lists are decimal);
  nesting is preserved structurally through `items[].children`.
- **Images are placed when their bytes are reachable.** The bytes are
  looked up as in the docx writer: `opts.assets[name]` (or its percent-decoded form) first, then the
  bytes a reader carried in `escapes.docx.bytes` / `escapes.odt.bytes`. With bytes, the
  image becomes an odt `frame` run of `@awacloud/odf`'s typed write model
  — `{ type: 'frame', anchorType: 'as-char', width, height, child: { kind:
  'image', href } }`, rendered as `<draw:frame text:anchor-type="as-char">
  <draw:image/></draw:frame>` —
  inline in place within its paragraph, or as its own paragraph at block
  position (also inside a table cell or a list item), and the bytes travel
  in `odt.write`'s `doc.pictures` map as a package part. Without bytes, the
  image is dropped (`image/dropped`).
  - **Size**: its size is read from the image header (PNG `IHDR` + `pHYs`, JPEG `SOFn` + JFIF density, GIF screen size; 96 dpi when the file states none), scaled down to fit 6 in × 8 in with its aspect kept — the docx writer's rule
    (`src/write/image-extent-drift.test.js` keeps the two copies
    byte-identical), written in centimetres to three decimals. A header
    that cannot be read keeps the default 2 in × 1.5 in box (`5.08cm` ×
    `3.81cm`) and records `image/size-defaulted` — a degrade, never a drop.
  - **Alt text**: a non-empty IR `alt` is written as the frame's
    `svg:title`, after the `draw:image`. `@awacloud/odf` types no frame
    title, so it rides in the frame run's raw children
    (`_extras.children`), where `odt.read` puts it.
  - **Part naming**: `Pictures/image<k>.<ext>`. `k` is the 1-based index of
    each distinct IR `name` in order of its first placed occurrence; the
    same `name` twice gives one part, written once (the first occurrence's
    bytes win), and two frames pointing at it. `<ext>` is sniffed from the
    leading bytes — PNG signature → `png`, `FF D8 FF` → `jpg`, `GIF8` →
    `gif`, anything else → `bin`. The path is never derived from the
    `name`, which may carry spaces, slashes and no extension (a docx image
    is typically named `Grafik 1`). `@awacloud/odf` declares each part in
    the manifest with the media type it sniffs from the same bytes.
  - When no image is placed, `odt.write` receives no `pictures` key.
  - **Round trip**: reading the written `.odt` back through
    `oconvOdtToIr` (with `framesInRuns`, as `oconv` does) recovers the image,
    its bytes and its alt text, but not its name — this writer writes no
    `draw:name`, so the reader names the image after its picture path
    (`image1.gif`).
- **Byte-reproducible**: `@awacloud/odf` stamps every zip entry with a fixed
  1980-01-01 00:00 timestamp (its `write` default for `mtime`; this writer
  passes none), so two calls on the same IR give byte-identical containers
  at any instant (`src/write/ir-to-odt.test.js` "md -> odt is
  byte-reproducible", which moves the clock between the two runs). This
  module is pure — no clock, no I/O, no randomness of its own.
- **Determinism of the parts**: `content.xml` and `styles.xml` are
  byte-identical across two writes of the same IR (the styles are built from
  constants, no input reaches them), and so is the whole container.
- Capture-free (`fw/no-factory-capture`), pure object mapping + `odt.write`
  (pure JS), hence worker-safe by construction.
- See the [loss matrix](../../loss-matrix.md) for the published
  Preserved/Degraded/Dropped classification of every code below.

### Loss codes emitted by this module

| Code | Detail | Meaning |
|---|---|---|
| `list/task-marker-dropped` | `'[x]'` or `'[ ]'` | a GFM task item (`listItem.escapes.md.task`) whose first block is not a paragraph; otherwise the checkbox is a leading `☐ ` / `☒ ` text run of the first paragraph, no loss |
| `block/degraded` | `'blockquote:nested'` | a quote nested in a quote was written as more `Quotations` paragraphs — the return leg reads one flat quote (one loss per nested quote) |
| `block/degraded` | `'blockquote-child:<kind>'` | a non-paragraph, non-quote block inside a quote was written with its own mapping, outside the quote style |
| `image/size-defaulted` | the image `name` | bytes were reachable and the image is placed, but no size could be read from its header, so it sits in the default 2 in × 1.5 in box |
| `image/dropped` | the image `name` | no bytes were reachable for the image — neither `opts.assets[name]` (or its percent-decoded form) nor a reader's `escapes.docx.bytes` / `escapes.odt.bytes` |

## See also

- [`ir-to-docx`](./ir-to-docx.md) — the equivalent `.docx` writer.
- [`ir-to-md`](./ir-to-md.md) / [`ir-to-pdf`](./ir-to-pdf.md) — the other
  two IR writers.
- [Loss matrix](../../loss-matrix.md) — published fidelity classification.
