---
title: "@awacloud/oconv — the md → pdf bounded typesetter"
---

# The `md → pdf` bounded typesetter (tier 2)

> **Purpose.** The options / font-route / loss-code reference for the
> `→ pdf` writer implemented across `src/write/ir-to-pdf.js` +
> `src/write/pdf/**`. Audience: anyone calling
> `oconv.fromMd({ markdown, target: 'pdf' })` or
> `oconv.convert({ ..., target: 'pdf' })`, and anyone tuning `opts.pdf`. For
> the published Preserved / Degraded / Dropped table see
> [`docs/loss-matrix.md`](./loss-matrix.md) (§ "md → pdf — the bounded
> typesetter").
>
> **Prerequisites.** The `@awacloud/oconv` main entry (`fw_require` and
> `modules`, registered on an `@awacloud/fw` `ModuleRuntime` — see
> [Examples](#examples)); the `@awacloud/oconv/src/worker.js` sub-path for the
> worker path; optionally the companion package `@awacloud/oconv-fonts` for
> the default-face tier. Runs in a browser or on the runtimes the package's
> `engines` field names (Bun ≥ 1.0, Node ≥ 20). The writer itself performs no
> network or filesystem access: every byte it embeds is handed to it.

`md → pdf` is a **bounded** typesetter: one page size, one
text column, greedy space-based line breaking, hard page breaks. It never
hyphenates, never justifies, never controls widows/orphans, never wraps
text around a float, never lays out multiple columns, never splits a table
across a page break, never builds a table of contents, never renders a
running header/footer beyond the page number. Every one of those is a
**refusal**, not a bug — see the loss-matrix row for the full list.

**`oconv.convert({ ..., target: 'pdf' })` (`docx → pdf` /
`odt → pdf`) is this SAME writer, not a second one.** It
takes the identical `opts.pdf` block documented on this page, validated by
the same single `oconvPdfBox.resolveLayout` call, and inherits every
refusal and every loss code below unchanged — no hyphenation, no
justification, no widow/orphan control, no floats, no multi-column
layout, no table page-splitting, no table of contents, no running
header/footer beyond the page number, `keepTogether` inert for delegated
blocks, and `run.strike` unrendered — recorded as `inline/strike-dropped`,
never drawn. The only
difference from `md → pdf` is the source of the IR: a `convert` call
resolves an image only through the reader-carried `escapes.docx.bytes`
(no `assets` manifest — see [`docs/convert.md`](./convert.md)). See
[`docs/loss-matrix.md`](./loss-matrix.md) § "Cross-format pairs" for
the measured `docx → pdf` / `odt → pdf` rows this inheritance produces.

## `opts.pdf`

Validated in exactly ONE place, `oconvPdfBox.resolveLayout`
(`src/write/pdf/box.js`) — an unrecognised key throws
`oconv: bad pdf option <key>` before anything is laid out.

| Key | Type | Default | Validation error |
|---|---|---|---|
| `pageSize` | `'A4'` \| `'Letter'` \| `[width, height]` (pt, both > 0) | `'A4'` (595.276 × 841.89 pt) | `oconv: bad pdf option pageSize` |
| `margin` | `number` ≥ 0, and `2·margin` < the smaller page dimension | `56.693` pt (20 mm) | `oconv: bad pdf option margin` |
| `baseSize` | `number` > 0 | `11` pt | `oconv: bad pdf option baseSize` |
| `leadingRatio` | `number` > 0 | `1.32` | `oconv: bad pdf option leadingRatio` |
| `headingScale` | `number[6]`, all > 0 (levels 1–6, absolute pt) | `[22, 18, 15, 13, 12, 11]` | `oconv: bad pdf option headingScale` |
| `codeSize` | `number` > 0 | `9.5` pt | `oconv: bad pdf option codeSize` |
| `pageNumbers` | `boolean` | `true` | `oconv: bad pdf option pageNumbers` |
| `fonts` | `{regular?, bold?, italic?, boldItalic?, mono?: Uint8Array}` | `{}` (pure Standard 14) | accepted-and-forwarded here; failures surface from `oconvPdfMetrics` (see below) |

Any object key outside this table throws `oconv: bad pdf option <key>` —
including a typo of one of the names above. A non-object, non-`undefined`,
non-`null` `opts.pdf` throws `oconv: bad pdf option pdf`.

`opts.pdf` is rejected outright — `oconv: pdf options need target pdf` —
when supplied for a non-`'pdf'` `target`, so a typesetting block can never
look like it silently took effect on a `.docx`/`.odt` call.

### Font errors (`oconvPdfMetrics`, `src/write/pdf/metrics.js`)

| Condition | Error |
|---|---|
| `opts.pdf.fonts` carries a key outside `regular`/`bold`/`italic`/`boldItalic`/`mono` | `oconv: bad pdf font <key>` |
| A supplied font's bytes fail `@awacloud/fonts`' `fonts.read()` (not a valid sfnt) | `oconv: bad pdf font <style>` (original error attached as `.cause`) |
| The **default-face tier**'s map (`writeOpts.defaultFaces`, see below) carries a key outside `regular`/`bold`/`italic`/`boldItalic`/`mono` | `oconv: bad default font <key>` |
| A default-face tier font's bytes fail `fonts.read()` | `oconv: bad default font <style>` (original error attached as `.cause`) — checked AFTER every `opts.fonts` key, both before any font is parsed |

`createMeasurer` is the single place both tiers'
font bytes are parsed, so the two error families share one parse path and
differ only in the message prefix (`bad pdf font` for `opts.pdf.fonts`,
`bad default font` for the default-face tier).

## The two font routes

`@awacloud/oconv` **vendors no font file of its own** — neither this
package's `src/` nor its committed `dist/**` carries a font program. Every
byte a document's glyphs come from is either one of the 14 PDF Standard
fonts (viewer-resident, never shipped by anyone) or bytes the caller
supplies at call time.

| Route | How | Encoding | When |
|---|---|---|---|
| **Standard 14** (default) | `oconvPdfMetrics` looks up `Helvetica` / `Helvetica-Bold` / `Helvetica-Oblique` / `Helvetica-BoldOblique` / `Courier` via `@awacloud/fonts/standard14`; `@awacloud/pdf`'s `pdfBuilder.addFont({ name, baseFont, subtype: 'Type1', encoding: 'WinAnsiEncoding' })` references the viewer's own resident font, nothing embedded | WinAnsi (CP1252) literal strings, and the font dict names `/Encoding /WinAnsiEncoding`, so bytes 0x80–0xFF (accented letters, the em dash, the bullet markers) decode back to the characters drawn | No `opts.pdf.fonts` entry for a style class in use |
| **Embedded** (caller bytes) | `opts.pdf.fonts.<style>` (a whole sfnt program) → `pdfFontEmbed.embedSimple`/`embedCid` → `pdfBuilder.addFont({ name, embedded })`, subset to the exact code points the document uses | `WinAnsiEncoding` hex strings when every code point the style uses is WinAnsi-representable, `Identity-H` (CID) hex strings otherwise | An `opts.pdf.fonts` entry is supplied for that style class |

Mixing is allowed: a document can supply `regular`/`bold`/`italic`/
`boldItalic` bytes and leave `mono` unsupplied — the `code` style class
then falls back to Standard 14 `Courier` and the facade records
**`layout/font-fallback`** (`{style, baseFont}`) for it. On the **pure**
Standard 14 route (no `opts.pdf.fonts` at all) nothing is recorded as a
fallback — it is the chosen route, not a degrade.

**Standard 14 measurement covers the full WinAnsi byte map.**
`@awacloud/fonts`' Standard 14 width tables fill the 95 printable-ASCII
slots (0x20-0x7E) **and** the 123 filled WinAnsi high slots (0x80-0xFF),
generated from the vendored Adobe Core 14 AFMs by
`fonts/tools/gen-standard14-widths.mjs`. A Latin-1 letter (`é`, `à`, `ÿ`)
or a CP1252 punctuation byte (bullet, em dash, curly quote) is WinAnsi-
**representable** and now measures on its own advance rather than the
`'?'` slot. Per-variant metrics are real too: `Helvetica-Bold`,
`Helvetica-BoldOblique` and every Times variant carry their own table
(Helvetica `A` = 667, Helvetica-Bold `A` = 722), so
`layout/s14-variant-metrics-approx` is a defensive fallback that cannot
fire against the real fonts package — only a stubbed measurer reaches it
(`src/write/ir-to-pdf.test.js`). An oblique cut legitimately shares
its upright's widths — Adobe's own Core 14 metrics give slant no width
change. `Courier` is monospaced at 600 units across all 256 slots.

**Text beyond WinAnsi without caller bytes is a companion-package concern
(a deliberate scope decision), opt-in via registration, and limited to the covered
ranges below**: the route to non-WinAnsi text in those ranges is
`@awacloud/oconv-fonts` (Liberation Sans/Serif/Mono, SIL OFL 1.1) — an
OPTIONAL companion package,
never a runtime or `dependencies` entry of `@awacloud/oconv`. Registering
its descriptor on the SAME `ModuleRuntime` switches every unsupplied style
class from Standard 14 to Liberation, with no import and no flag — see "The
default-face tier" below. An application that does not register it keeps
today's Standard 14/WinAnsi behaviour unchanged: a non-WinAnsi code point on
that route degrades to `?` and is recorded once per document
(`text/unencodable`, `{count, sample}` — up to 8 distinct characters).

## The default-face tier

Three tiers, resolved **per style class** (frozen):

```
explicit opts.pdf.fonts[class] > registered oconvDefaultFaces[class] > Standard 14
```

`@awacloud/oconv` still **vendors no font of its own** and never imports the
companion package — `oconvIrToPdf` depends on the module NAME
`oconvDefaultFaces` only (`git grep 'oconv-fonts' -- packages/front/office/oconv/src`
stays at 0 hits). `main.js` registers a **stand-in** under that name at
version `0.0.0` (`src/write/pdf/default-faces.js`, `oconvDefaultFacesAbsent`)
whose `defaultFaces()` returns `null`, so with nothing else registered every
call is byte-identical to a call made before this tier existed. A real face
pack carries a higher version (`@awacloud/oconv-fonts` ships `1.0.0`) and
`ModuleRuntime#register` re-points the name's `latestDef` to whichever
registered version is `>=` the current one — so the real pack **displaces
the stand-in in either registration order**.

**Host registration rule** (measured, `tests/default-faces.integration.test.js`
§ "default-faces — registration order"):

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
await registerDefaultFaces(runtime);   // BEFORE the first resolve('oconv')
runtime.registerAll(modules);          // order vs the line above doesn't matter
const oconv = runtime.resolve('oconv');
```

Register the pack **before the first `resolve('oconv')`** (or of anything
depending on `oconvIrToPdf`) — `ModuleRuntime` caches resolved instances, so
a pack registered on an ALREADY-resolved `oconv` handle has no effect on
calls made through that same handle. Registering late is still recoverable
without re-building the runtime: call
`runtime.invalidate('oconvDefaultFaces', { cascade: true })`, then resolve
`oconv` again (a held handle is never upgraded in place, per `@awacloud/fw`'s
own JSDoc) — the next `fromMd`/`convert` call on the fresh handle embeds the
registered pack.

The pack is entirely **optional**: an application that never imports or
registers `@awacloud/oconv-fonts` keeps the pure Standard 14 route exactly
as it behaved before this tier existed — nothing about `@awacloud/oconv`'s
own manifest, dependency list or behaviour changes by the companion
package's mere existence in the monorepo.

**The tier is computed PER CALL**, not once per runtime: a posted
`writeOpts.defaultFaces` map (the worker path, see below) wins WHOLE over
the registered descriptor's map when neither `undefined` nor `null`; the
per-class precedence between explicit `opts.pdf.fonts` and the (registered
or posted) default map then applies inside `oconvPdfMetrics.createMeasurer`.
A call supplying every style class explicitly is therefore unaffected by a
registered or posted pack either way (invariant 1, measured
byte-identical).

### Covered Unicode ranges (measured, not assumed)

The ONLY Unicode statement this page or `docs/loss-matrix.md` makes — from
`@awacloud/oconv-fonts`' vendored Liberation faces' own `cmap`, measured on
`LiberationSans-Regular` by `tests/default-faces.integration.test.js`
§ "default-faces — covered Unicode ranges (measured from the cmap)":

| Block | Coverage |
|---|---|
| Basic Latin, Latin-1 Supplement, Latin Extended-A | **100 %** |
| Cyrillic | **100 %** |
| Greek and Coptic | **88.2 %** |
| Hebrew | **77.7 %** |
| Arabic, Devanagari, Hiragana, Katakana, CJK, Hangul | **0 %** |

**Not** CJK, **not** Arabic, **not** Indic. And coverage is a `cmap` fact,
not a shaping claim: the typesetter refuses shaping at tier 2 (no kerning, no `GPOS` —
`oconvPdfMetrics`' `widthOf` is a plain advance sum, `src/write/pdf/metrics.js`), so a script that needs shaping
to render correctly would render wrong even for a code point the cmap
covers. A code point the registered/posted face has no glyph for still
degrades honestly — see `text/unencodable` below.

## `opts.pdf` reaches the worker — the registered face pack does not

`src/worker.js`'s `handleFromMd`/`handleConvert` forward `opts` (and, for
`fromMd`, `assets`) over the message envelope VERBATIM, only when the
caller supplied the key — the envelopes
are `{ id, name?, markdown, target?, opts?, assets?, defaultFaces? }` for
`fromMd` and `{ id, name?, bytes, format?, target, includeNotes?, opts?,
defaultFaces? }` for `convert` (`src/worker.js` header). **`opts.pdf` DOES
reach a `fromMd`/`convert` call made from inside a `Worker`**: geometry,
font routes (`opts.pdf.fonts`), `pageNumbers`, all of it, structured-cloned
like any other message payload (`tests/worker.integration.test.js`). The
`toMd` envelope genuinely carries no `opts` field — it is
`{ id, name, bytes, at?, sha256? }`, the frozen read-direction facade,
BYTE-UNCHANGED.

**What does NOT cross the worker boundary is the `oconvDefaultFaces`
descriptor itself**: it closes over its bytes inside `factory()`
(`fw/no-factory-capture`), so `ModuleRuntime#serialize` cannot ship it and a
worker never sees the *registration*. The HOST resolves
`runtime.resolve('oconvDefaultFaces').defaultFaces()` on its own (main)
thread and posts the resulting `{regular, bold, italic, boldItalic, mono}`
byte map as a separate `defaultFaces` envelope field on the `fromMd` and
`convert` messages — forwarded VERBATIM by `handleFromMd`/`handleConvert`
only when present, same discipline as `opts`/`assets`. Only the PAYLOAD (a
plain object of `Uint8Array`s) structured-clones; the descriptor stays
main-thread-only by construction.

```js
worker.postMessage({
    id: 4, markdown, target: 'pdf',
    opts: { pdf: { pageNumbers: false } },                 // reaches the writer
    defaultFaces: runtime.resolve('oconvDefaultFaces').defaultFaces()  // posted bytes, never the descriptor
});
```

A message that omits both keys reproduces exactly the call a caller made
before either existed.

The reply of a `fromMd` or `convert` message is
`{ id, ms, error, bytes, warnings, losses }`. `losses` is the facade's
ledger itself, verbatim and structured-cloned (`[]` when `error` is set), so
the typesetter's object-detail records — the `layout/*`, `text/unencodable`
and `inline/*` codes of the table below, with their `index` and `kind` —
reach the host unchanged; `warnings` stays `losses.length` for existing
callers (`tests/worker.integration.test.js`).

## Loss codes

Every code `md → pdf` can emit — the ones this writer records itself,
plus the ones inherited unchanged from `md-to-ir.js` (the same reader
`md → docx`/`md → odt` use) and passed through:

| Code | Emitted by | Detail | Trigger |
|---|---|---|---|
| `layout/font-fallback` | `ir-to-pdf.js` | `{style, baseFont}` | a style class resolved to its Standard 14 face because neither `opts.pdf.fonts` nor a registered/posted default-face map supplied bytes for it, on a mixed/embedded call (never on the pure Standard 14 route, and never when a registered default-face pack covers every class) |
| `layout/s14-variant-metrics-approx` | `ir-to-pdf.js` | `{styles}` | defensive fallback: bold-bearing text measured on the Standard 14 **regular** width table — fires only if the fonts package regresses to a shared table across variants; the real `@awacloud/fonts` gives bold and bold-italic their own tables, so it is not reachable without a stubbed measurer |
| `text/unencodable` | `ir-to-pdf.js` | `{count, sample}` | **Route-conditional**: ONE record per document, on BOTH routes — on the Standard 14/WinAnsi route, a code point outside WinAnsi (drawn as `?`); on the embedded/default-face route (explicit `opts.pdf.fonts` OR a registered/posted default face), a code point with **no glyph in the resolved face's own `cmap`** (`hasGlyph(cp)`, drawn as `.notdef`) — previously silent, now always recorded. A sample of up to 8 distinct characters either way |
| `layout/unhandled-block` | `ir-to-pdf.js` (renderer dispatch default) / `stack.js` (flow default) | `{kind}` (facade) / string (stack) | an IR block kind with no flow mapping and no renderer (unreachable from `md-to-ir.js`'s own output today) |
| `layout/line-overflow` | `linebreak.js`, `render/code.js` | `{tokens, width, column, text}` | one unbreakable token (a run with no space) wider than the text column |
| `layout/block-clipped` | `stack.js` | `{clippedLines}` + a prose `detail` string | a block (e.g. an oversized code block) is taller than one page; the excess is clipped at the page bottom, not carried onto a new page (no block ever splits across a page except by this clipping) |
| `layout/list-empty` | `render/list.js` | `{index}` | a `list` node with no drawable item |
| `layout/table-empty` | `render/table.js` | `{index, rows}` | a `table` node with zero rows, or zero columns after building the grid |
| `layout/table-scaled` | `render/table.js` | `{index, from, to, column}` | a table's natural column widths exceed the text column; columns are scaled down proportionally to fit |
| `layout/table-clipped` | `render/table.js` | `{index, columns, clippedCells, cells}` | one or more cells are too narrow even at their minimum width (`subMinimal`) or a cell's own content was clipped inside its box; `cells` lists each `{row, column}` affected |
| `inline/strike-dropped` | `linebreak.js` (`breakInlines`) | `{runs, text}` | a text block carries at least one struck run (`run.strike`): no strikethrough rule is drawn and the text is drawn plain. ONE record per block; `runs` counts the struck runs, `text` is the first one's text truncated to 40 characters; the stack prefixes the block's `index` and `kind`. The drawn bytes are exactly those of the unstruck run — recorded, not rendered. See [What `run.strike` does](#what-runstrike-and-code-run-emphasis-do-on-this-writer-recorded-not-rendered) |
| `inline/code-emphasis-dropped` | `linebreak.js` (`breakInlines`) | `{runs, text}` | a text block carries at least one `code` run that is also bold or italic: the monospace class wins and the emphasis is not drawn. Same one-record-per-block shape and the same unchanged bytes as `inline/strike-dropped` |
| `layout/image-dropped` | `render/image.js` | `{index, name, alt, reason, bytes, format?}` | an image the writer could NOT place: `reason: 'no-bytes'` (nothing in `assets`, nothing carried by the reader) or `reason: 'unsupported-encoding'` (bytes present, encoding not directly embeddable — `format` names the container when the header reader recognised it). A PLACED image records nothing. See [Images](#images) |

**Inherited from `md-to-ir.js` (the shared reader)** — identical codes and
triggers to `md → docx`/`md → odt`, see
[`docs/loss-matrix.md`](./loss-matrix.md)'s `md → docx` row for the full
list: `frontmatter/stripped`, `list/start-dropped`,
`list/task-marker-dropped`, `table/align-dropped`,
`inline/linebreak-degraded`, `inline/dropped` (`link-title` /
`html_inline`), `block/dropped` (`html_block`). A thematic break is **not**
dropped on this pair: `md-to-ir.js` maps it to an IR `hr` with no loss and
`stack.js` draws it as a rule (`block/dropped` detail `hr` is a docx/odt
WRITER code, not a reader one).

**Retired stub codes** — `layout/list-unrendered`, `layout/code-unrendered`,
`layout/table-unrendered`, `layout/image-unrendered` were placeholder
codes before the real `list`/`codeBlock`/`table`/`image` renderers shipped. None of the four can fire from `src/` any more
(`grep -rn unrendered src` = 0, non-test); the fidelity harness asserts
their absence as a regression guard, not because they were ever reachable
from real markdown.

### Every drawn segment has a font entry

`src/write/pdf/render/text.js`'s `putSegment` throws
**`oconv: pdf font missing <style>`** (and the page-number block throws
`oconv: pdf font missing regular`) when neither the segment's own style nor
`regular` resolves to a `fonts` entry. `ir-to-pdf.js`'s `collectCodePoints`
guarantees this never fires through the published renderers: a style
outside `oconvPdfMetrics.STYLE_CLASSES` is keyed as `regular` — mirroring
`measurer.face`'s own degrade — so `fonts[style] || fonts.regular` is
always defined for every segment the stack or a renderer actually draws.
This error is a violated-invariant guard, not a documented refusal: it is
unreachable through valid IR and the shipped renderers.

### `oconv: default faces need target pdf` / `oconv: bad default faces` (facade-level)

Thrown by `fromMd`/`convert` (`src/oconv.js`), not by this writer, when the
caller posts a `defaultFaces` input (see "`opts.pdf` reaches the
worker" above): `oconv: default faces need target pdf` when `defaultFaces`
is supplied for a non-`pdf` target (checked LAST on `convert`, after
`opts.pdf`); `oconv: bad default faces` when it is not a non-null,
non-array object whose every own value is a `Uint8Array`. Unknown KEYS in
the map are left to `oconvPdfMetrics.createMeasurer` downstream
(`oconv: bad default font <key>`, see "Font errors" above), never
duplicated at the facade.

## Images

`md → pdf` **places 1- and 3-component JPEG images** and records an honest,
machine-readable loss for every other case — a CMYK (4-component) JPEG
included (`src/write/pdf/render/image.test.js` § "a CMYK JPEG is refused,
not guessed at"). Placement goes through `@awacloud/pdf`'s
`pdfBuilder.addImage` seam (see "The `addImage` seam this consumes" below).

### How bytes reach the writer

`fromMd` takes an optional `assets` input:

```js
const { bytes, losses } = await oconv.fromMd({
    markdown,
    target: 'pdf',
    assets: { 'diagram.jpg': jpegBytes }      // keyed as the markdown wrote it
});
```

The key is the CommonMark image destination **exactly as written** —
`![Diagram](sub/dir/diagram.jpg)` needs the key `sub/dir/diagram.jpg`.
There is no normalisation, no path resolution and no fetching: this
package never touches the network or the filesystem. A key no image
references is ignored (no loss, no error). `assets` must be a non-null,
non-array object whose every value is a `Uint8Array`, else `fromMd` throws
`oconv: bad assets` before the reader even runs.

The resolution rule is the same in all three writers: **caller `assets`
first, then the bytes a `docx → IR` read carried in `escapes.docx.bytes`,
else nothing.** The three copies of that rule are pinned byte-identical by
`src/write/asset-bytes-drift.test.js`.

### Inline images now reach the renderer

CommonMark's `![alt](src)` always parses at INLINE position, inside a
paragraph's `children`. `oconvPdfLinebreak.tokenize` skips any inline that
is not a `run`, so an inline image used to **vanish with zero
record**. `oconvPdfStack` now partitions a `heading`/`paragraph`'s inline
children: the runs flow as the text block, and each image is delegated to
the image renderer immediately after it, at index `<block>.i<n>`. Nothing
about block-level kinds changed.

### What places, and what does not

| Input | Result |
|---|---|
| JPEG (baseline / extended / progressive; 1 or 3 components) | **PLACED**. `/Filter /DCTDecode`, bytes embedded verbatim, drawn with `q w 0 0 h x y cm /Im<n> Do Q`. NO loss |
| PNG (colour type 0 or 2) | `layout/image-dropped`, `reason: 'unsupported-encoding'`, `format: 'png'` |
| PNG (palette / alpha), CMYK JPEG, any other format, malformed bytes | `layout/image-dropped`, `reason: 'unsupported-encoding'` (no `format`) |
| no bytes resolved | `layout/image-dropped`, `reason: 'no-bytes'`, `bytes: 0` |

On every refusal the italic `[image: <alt>]` placeholder is still drawn, so
no refused image is silently lost: the mark is on the page **and** the
reason is on the ledger. (This writer's one silent drop is a link's
target; a struck run and bold/italic inside a code run are recorded, not
drawn — see [`docs/loss-matrix.md`](./loss-matrix.md)'s `md → pdf` row.)

**Why PNG does not place, stated plainly.** `pdfBuilder.addImage` decodes
nothing — the bytes go into the XObject stream verbatim behind the
`/Filter` the caller names. JPEG entropy-coded data *is* a PDF image
stream. A PNG's `IDAT` is a zlib stream of *filtered scanlines*, which is
not: embedding the file bytes behind `/FlateDecode` would render garbage.
Doing it properly needs a zlib-to-Flate re-wrap, plus an `/SMask` for the
alpha colour types and an `/Indexed` palette for colour type 3. None of
that is implemented, so PNG is REFUSED rather than guessed at — the same
"a pair whose fidelity cannot be honestly stated is not shipped" rule,
applied at the format level. PNG placement is routed as its own backlog
item.

The header reader (`src/write/image-header.js`) is deliberately minimal:
it reads a PNG `IHDR` or a JPEG `SOF0`/`SOF1`/`SOF2` and returns
`{format, width, height, colorSpace, bitsPerComponent, filter}`, or `null`.
It never throws, never decodes, never transcodes, and recognises no other
container.

### Placement geometry

One image pixel is taken as one PostScript point at natural size. The box
is scaled DOWN to the block's column width when it is wider, preserving
the aspect ratio, and is never scaled up. Vertical fit is not re-decided by
the renderer: an image taller than the page is handed to the stacker as an
ordinary oversized block, and the stacker's existing rule applies — a
clean page, then the item falls below the bottom margin and
`layout/block-clipped` is recorded.

### The `addImage` seam this consumes

`pdfBuilder.addImage({name, width, height, colorSpace, bitsPerComponent,
filter?, decodeParms?, sMask?, data})` registers an XObject on the
builder's CURRENT page — it throws `pdf/builder/no-page` when there is
none. Builder pages only exist after stacking, while a renderer runs during
layout, so `ir-to-pdf.js` gives the renderer a builder-SHAPED image sink on
`ctx.builder`: the renderer queues its spec under a document-unique
`Im<n>` name, and the emission loop replays each spec onto the real builder
on the page whose items reference it. Only the names a page actually draws
are registered, so a clipped-away image leaves no orphan XObject behind.

## What `run.strike` and code-run emphasis do on this writer (recorded, not rendered)

`oconvPdfMetrics.styleOfRun` maps an IR run to exactly one of five style
classes — `regular`, `bold`, `italic`, `boldItalic`, `code` — and none of
them is strike-aware: no module under `src/write/pdf/**` draws anything for
`run.strike`. A struck-through run is therefore typeset as **plain text in
whichever emphasis class its bold/italic flags select, with no
strikethrough rule ever drawn** — unlike `md → docx`/`md → odt`, which both
preserve strike as a real run flag. The same one-class-per-run mapping has
a second consequence: `styleOfRun` returns `code` before it reads `bold` or
`italic`, so a code run's own bold/italic is not kept either.

Neither drop is silent. The line breaker (`breakInlines` in
`src/write/pdf/linebreak.js`) records them: **`inline/strike-dropped`** for
a block with at least one struck run, **`inline/code-emphasis-dropped`** for
a block with at least one code run that is also bold or italic — one record
per text block each, `detail` `{ runs, text }`, with the stack's `index` and
`kind` beside `code`. The records describe the runs themselves and change
nothing that is drawn: the page bytes are identical to those of the same
text without the flag. Pinned by `src/write/ir-to-pdf.test.js` §
"oconvIrToPdf — strikethrough is RECORDED, no rule drawn" (byte-identical
output, exactly one record, and the negative case where `code` alone records
nothing), by `src/write/pdf/linebreak.test.js` § "breakInlines — recorded
inline drops" and, for the class mapping, by `src/write/pdf/metrics.test.js`
§ "code wins over every emphasis flag". Drawing the strikethrough rule is a
typesetter feature this writer does not have, so the drop is recorded and
not rendered. The one drop that remains without a record on this writer is a
link's target (the refusal below).

## `keepTogether` is currently inert for delegated blocks

`render/table.js`'s renderer return carries `keepTogether: true` — but
`stack.js`'s block builder (`list`/`codeBlock`/`table`/`image` —
`stack.js`'s `delegate()`)
never copies `rendered.keepTogether` onto the `FlowBlock` it constructs,
unlike the heading path a few lines above it, which does set
`block.keepTogether` from its own spec. Pinned by
`src/write/pdf/stack.test.js` § "a delegated renderer returning
`keepTogether: true` has it dropped — the flag never reaches the flow
block". Measured, not fixed.

This does **not** let a table split across pages, and the intro's "never
splits a table across a page break" holds. The stacker's hard page-break
rule works on whole blocks: a block that does not fit the remaining space
starts a new page, and a block taller than one page is clipped at the page
bottom with `layout/block-clipped` — never carried onto a following page
(`src/write/pdf/stack.test.js` § "a block is never split across pages —
every item of a block shares one page"; on a real table,
`tests/crossformat-to-pdf.integration.test.js` § "docx-bulk.docx → pdf:
MULTI-PAGE (24), one overflow + one block-clipped" clips 108 units of one
table). The stacker reads `keepTogether` only as keep-with-next — a flagged
block also needs the first line of the NEXT block to fit — so the dropped
flag loses exactly that check for a table, nothing more.

## Geometry defaults

A4, 56.693 pt margins (20 mm) on all four sides, giving a **481.89 pt**
text column (`595.276 − 2·56.693`). Body text 11 pt at 1.32× leading.
Heading sizes by level: 22 / 18 / 15 / 13 / 12 / 11 pt. Monospace (fenced
code + inline code) 9.5 pt. Page numbers on by default, centred at
`y = margin / 2`.

## Determinism

Two `fromMd(..., 'pdf')` calls on the same markdown and the same
`opts.pdf` produce **byte-identical** output: `irToPdf` calls
`pdfBuilder.addMetadata({ Producer, Creator })` only, never `setId`, and
`@awacloud/pdf`'s plain write path (`document/builder.js`,
`document/writer.js`, `syntax/serializer.js`) reads no clock and no
randomness. This holds on the plain write path only —
`document/encryptedWriter.js` uses `Math.random()` for its file key, and
`md → pdf` never enters that path.

## Examples

### Standard 14 (default) — no options

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconv = runtime.resolve('oconv');

const written = await oconv.fromMd({
    markdown: '# Report\n\nSome **bold** text.\n',
    target: 'pdf'
});
// written.bytes — a .pdf Uint8Array, Standard 14 / WinAnsi, no font embedded.
```

### Embedded route — caller-supplied faces

```js
const written = await oconv.fromMd({
    markdown: '# Rapport\n\nCafé, déjà vu — accented text survives.\n',
    target: 'pdf',
    opts: {
        pdf: {
            fonts: {
                regular: regularSfntBytes,       // Uint8Array, e.g. Liberation Sans
                bold: boldSfntBytes,
                italic: italicSfntBytes,
                boldItalic: boldItalicSfntBytes
                // `mono` omitted here falls back to Standard 14 Courier and
                // records `layout/font-fallback` for the `code` style class.
            },
            pageNumbers: false
        }
    }
});
```

### Registered default-face route — covered-range text without caller bytes

```js
import { registerDefaultFaces } from '@awacloud/oconv-fonts';

const runtime2 = new ModuleRuntime();
runtime2.registerAll(fw_require);
await registerDefaultFaces(runtime2);   // BEFORE the first resolve('oconv')
runtime2.registerAll(modules);
const oconv2 = runtime2.resolve('oconv');

const withPack = await oconv2.fromMd({
    markdown: '# Rapport\n\nCafé, déjà vu — accented text survives.\n',
    target: 'pdf'
    // No opts.pdf.fonts — every style class resolves to the registered
    // Liberation faces instead of Standard 14. `losses` carries no
    // `layout/font-fallback` and no `text/unencodable` for this sentence,
    // because the registered faces' `cmap` has a glyph for every character
    // in it; a code point outside the covered ranges (CJK, Arabic, Indic)
    // still draws `.notdef` and records one `text/unencodable` per document.
});
```

### Worker path — `opts.pdf` and a posted `defaultFaces` map

```js
worker.postMessage({
    id: 5, markdown, target: 'pdf',
    opts: { pdf: { pageNumbers: false } },
    defaultFaces: runtime2.resolve('oconvDefaultFaces').defaultFaces()   // bytes, never the descriptor
});
```

## See also

- [`docs/loss-matrix.md`](./loss-matrix.md) — the published Preserved /
  Degraded / Dropped row for `md → pdf`, and the measured-not-assumed
  fixture table.
- [`../README.md`](../README.md) — package overview, `fromMd` quick start.
- `@awacloud/oconv-fonts`' own `docs/descriptor.md` — the companion
  package's frozen contract (`oconvDefaultFaces`, `registerDefaultFaces`,
  `loadDefaultFaces`) from the other side of the name-only seam.
