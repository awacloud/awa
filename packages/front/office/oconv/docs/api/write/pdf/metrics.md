---
module: oconvPdfMetrics
category: oconv/write/pdf
dependencies: [standard14Lookup, fonts]
returns: object
worker-safe: true
status: complete
---

# oconvPdfMetrics

> Style-class face resolution and advance measurement for the `md → pdf` typesetter.

**Module** `oconvPdfMetrics` | **Source** `packages/front/office/oconv/src/write/pdf/metrics.js` | **Deps** `standard14Lookup`, `fonts` | **Worker-safe** yes

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '@awacloud/oconv';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const oconvPdfMetrics = runtime.resolve('oconvPdfMetrics');
```

Composed internally by [`ir-to-pdf`](../ir-to-pdf.md); resolving it
directly is for measuring text or probing font routes in isolation.

## API

| Member | Signature | Returns | Throws |
|---|---|---|---|
| `STYLE_CLASSES` | `string[]` | `['regular', 'bold', 'italic', 'boldItalic', 'code']` | — |
| `S14_FACES` | `object` | style class → Standard 14 base font name | — |
| `styleOfRun` | `(run: {bold?, italic?, code?}) => string` | one of `STYLE_CLASSES` | — |
| `winAnsiByte` | `(cp: number) => number \| null` | CP1252 byte, or `null` when unrepresentable | — |
| `createMeasurer` | `(opts?: {fonts?: Object<string, Uint8Array>, defaultFonts?: Object<string, Uint8Array>}) => Measurer` | frozen `Measurer` | `Error` `oconv: bad pdf font <key>` / `oconv: bad default font <key>` |

`Measurer` members: `route` (`'standard14'` \| `'embedded'` \| `'mixed'`),
`face(style)` (frozen face record), `widthOf(text, style, sizePt)`
(advance sum, points), `fallbacks` (style classes that fell back to
Standard 14 — empty on the pure Standard 14 route), `s14VariantApprox`
(defensive flag, see Notes).

## Examples

### Measure text on the default (pure Standard 14) route

```js
const measurer = oconvPdfMetrics.createMeasurer();
oconvPdfMetrics.STYLE_CLASSES;               // ['regular','bold','italic','boldItalic','code']
oconvPdfMetrics.styleOfRun({ bold: true, italic: true });  // 'boldItalic'
oconvPdfMetrics.winAnsiByte(0x20AC);         // 128 (€)
oconvPdfMetrics.winAnsiByte(0x4E2D);         // null (中, not WinAnsi-representable)
measurer.widthOf('Hi', 'regular', 12);       // 11.328 (points, Helvetica 12pt)
measurer.route;                              // 'standard14'
measurer.fallbacks;                          // []
measurer.s14VariantApprox;                   // false
```

Executed against the live package (2026-10-06): values exactly as shown
above.

## Notes

- **Three tiers, resolved PER STYLE CLASS, as the source implements it
  today**: explicit `opts.fonts[<class>]` (caller-supplied bytes,
  `fonts.read()`) > default `opts.defaultFonts[<class>]` (same parse path,
  from the registered/posted default-face tier) > Standard 14
  (`standard14Lookup.lookupStandard14(name)`, a 256-slot 1000-units-per-em
  table indexed by the WinAnsi byte). No font program is vendored, embedded
  or downloaded by `@awacloud/oconv` itself.
- **On the pure Standard 14 route nothing "fell back"**: `fallbacks` is
  reported EMPTY when `embeddedCount === 0` — a document that never asked
  for an embedded face gets no `layout/font-fallback` loss for it (that
  loss is recorded by the caller, [`ir-to-pdf`](../ir-to-pdf.md), not by
  this module — this module stays pure and records no loss itself).
- **`s14VariantApprox` is a defensive probe, not a live degrade.**
  Adobe's own Core 14 metrics give an oblique cut the same advances as its
  upright counterpart (slant does not change advance widths), so only a
  WEIGHT change (`bold`/`boldItalic`) needs a distinct width table. The
  flag fires only if `@awacloud/fonts` regresses to sharing ONE width
  table across Standard 14 variants (`@awacloud/fonts` ships real
  per-variant tables today) — measured `false` against the real package,
  as shown above.
- **`opts.fonts`/`opts.defaultFonts` keys are spelled `mono` for the `code`
  style class** (`FONT_OPT_KEY`) — the option block names a FACE, the style
  class names a run flag; the other four keys match their style class name
  1:1. An unknown key in EITHER map throws before any font is parsed
  (`opts.fonts` checked first).
- **WinAnsi coverage on the Standard 14 route is the full CP1252 map**: the
  95 printable-ASCII slots plus the 123 filled high slots (0x80-0xFF —
  every Latin-1 letter, every CP1252 punctuation slot `winAnsiByte` maps);
  only a genuinely unrepresentable code point degrades to the `'?'` width.
- **v1 measures plain advance sums only** — no kerning, no shaping (the
  typesetter refuses shaping at this tier).
- `winAnsiByte` is published here — not duplicated — so
  [`pdf/render/text`](./render/text.md) encodes with the SAME CP1252 table
  the widths were measured with.
- Worker-safe: plain data plus closures over the resolved
  `standard14Lookup`/`fonts` APIs; font bytes travel by structured clone.
  Capture-free (`fw/no-factory-capture`).

## See also

- [`ir-to-pdf`](../ir-to-pdf.md) — the facade that resolves this module and
  records the `layout/font-fallback`/`layout/s14-variant-metrics-approx`
  losses it does not itself emit.
- [`pdf/box`](./box.md) — the geometry this module's measurements feed
  linebreaking against.
- [`pdf/linebreak`](./linebreak.md) — the tokenizer that calls
  `widthOf` per token.
- [`pdf/default-faces`](./default-faces.md) — the `oconvDefaultFaces` name
  `opts.defaultFonts` is sourced from.
- [`pdf-writer.md`](../../../pdf-writer.md) — the audience-facing font-route
  reference.
