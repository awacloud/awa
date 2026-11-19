---
module: fontShaper
category: extra/shaper
dependencies: [fontErrors, tableGsub, tableGpos, tableGdef, layoutClassDefinitions, aatMorx, aatMorxEngine, aatKerx, aatAnkr, aatKerxEngine, tableKern, varGlyph, varItemStore]
returns: object
worker-safe: true
status: complete
---

# fontShaper

> A generic OpenType layout engine: text to positioned glyphs through the font's `GSUB` and `GPOS` lookups, or its AAT `morx` chains.

**Module** `fontShaper` | **Source** `packages/front/office/fonts/src/extra/shaper.js` | **Deps** `fontErrors`, `tableGsub`, `tableGpos`, `tableGdef`, `layoutClassDefinitions`, `aatMorx`, `aatMorxEngine`, `aatKerx`, `aatAnkr`, `aatKerxEngine`, `tableKern`, `varGlyph`, `varItemStore` | **Worker-safe** yes

`shape(font, text, opts?)` maps a string to the glyphs a font draws for it and where it draws them: through the cmap and the font's `GSUB` lookups, then the `hmtx` advances and the font's `GPOS` lookups — or, for an AAT font, its `morx` chains and `kerx` subtables, and for an older font its `kern` table. It is a generic engine: the script-specific shaping of Arabic joining or Indic reordering is not done here (see [`shaper-arabic`](./shaper-arabic.md), [`shaper-indic`](./shaper-indic.md)).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `shape` | function | `(font, text, opts?) => { glyphs, script, language, direction, features, gpos, morx, kerx, kern, truncated }`; `features` lists the GSUB and GPOS features applied. |
| `DEFAULT_FEATURES` | const | The GSUB features: `['rvrn', 'ccmp', 'locl', 'rlig', 'liga', 'clig', 'calt']`. |
| `DEFAULT_POSITION_FEATURES` | const | The GPOS features: `['kern', 'mark', 'mkmk', 'curs', 'dist']`. |
| `NESTING_MAX` | const | 16: the deepest nesting of a context lookup's nested lookups. |
| `BUDGET_MAX` | const | 1,000,000: the default subtable applications per call. |
| `SCRIPT_RANGES` | const | The code-point ranges the script detection knows, each with its OpenType tag. |
| `RTL_RANGES` | const | The code-point ranges of the right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, N'Ko), for the direction. |
| `AAT_FEATURES` | const | OpenType tags to AAT feature settings, `{ tag: [type, on, off] }` (`off` null when the type has no off setting): `liga`, `dlig`, `hlig`, `clig`, `calt`, `cswh`, `case`, `cpsp`, `frac`, `sups`, `subs`, `smcp`, `c2sc`, `zero`, `onum`, `lnum`, `pnum`, `tnum`. |

`font` is a `fonts.read` result. `glyphs` is `[{ glyph, cluster, xAdvance, yAdvance, xOffset, yOffset }]` in font units, in logical order; `cluster` is the index of the code point the glyph comes from (a ligature takes its first component's).

## Options

| Option | Default | Effect |
|---|---|---|
| `script` | detected | An OpenType script tag. Without it, the script of the first character that has one in `SCRIPT_RANGES` (Latin, Greek, Cyrillic, Armenian, Georgian, Ethiopic, Cherokee). When the font lacks it: `DFLT`, then `latn`. |
| `language` | the script's default | An OpenType language system tag; one the script lacks keeps the default. |
| `features` | — | `{ tag: boolean }`: turns a default feature off, or adds one, in GSUB and GPOS. Each table's required feature always applies. |
| `budget` | 1,000,000 | The subtable applications a call may run (a safe integer ≥ 1); a morx step that does not advance spends one too. |
| `aat` | — | `true` runs a font's `morx` even when it has GSUB, and its `kerx` even under GSUB and GPOS; `false` never runs either. |
| `coords` | — | Variation coordinates `{ tag: value }` (user space; finite numbers). See **Variations** below. |
| `direction` | detected | `'ltr'` or `'rtl'`. Without it, `'rtl'` when the first character found in `RTL_RANGES` or `SCRIPT_RANGES` is in the former. |

A bad option throws a `ContractError` `fonts/shaper-bad-option`; a `text` that is not a string, `fonts/shaper-bad-text`.

## Usage

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras } from '@awacloud/fonts';

const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);
const fonts = runtime.resolve('fonts');
const { shape } = runtime.resolve('fontShaper');

const r = shape(fonts.read(bytes), 'office');
// r.glyphs: one entry per glyph drawn; a ligature is one glyph with its first component's cluster
```

## Notes

- **The lookups** of the selected language system's enabled features are each applied once, in lookup-list order, over the whole glyph run: single, multiple, alternate (the first alternate), ligature, context and chaining context (formats 1–3, with their nested lookups), extension and reverse chaining (types 1–8).
- **GPOS** has its own script and language system, selected as for GSUB. Its lookups run in lookup-list order after GSUB: single and pair adjustment (formats 1 and 2), cursive attachment, mark to base (the preceding glyph that is not a mark), mark to ligature (its last component), mark to mark (the preceding mark), context and chaining context positioning, extension (types 1–9). Value records give x and y placements and advances; device tables and variations are not applied. A GDEF mark takes no advance, and an attached glyph's offset is its anchor difference plus its base's offset, minus the advances from the base to it. `gpos` reads `'applied'`, or `'none'` without a usable GPOS table.
- **The lookup flags** are honoured with GDEF: ignore base glyphs, ligatures and marks; the mark attachment class; the mark filtering set (GDEF's mark glyph sets). A skipped glyph stays in place, between the glyphs a ligature or a context matches.
- **AAT**: a font with a `morx` table that parses with a chain runs its chains ([`aatMorxEngine`](./apple-aat/morx-engine.md): rearrangement, contextual, ligature, noncontextual and insertion subtables) instead of GSUB when it has no GSUB table or `opts.aat` is `true`, and `morx` reads `'applied'`. Each chain starts from its default flags; `opts.features` maps through `AAT_FEATURES` to feature settings, an exclusive type (number spacing and case, vertical position, fractions, lower and upper case) keeping its last one. The glyphs stay in logical order: a renderer reverses a right-to-left run.
- **Positioning**, chosen as HarfBuzz chooses it, apart from morx: `kerx` ([`aatKerxEngine`](./apple-aat/kerx-engine.md)) when the font has one that parses, unless GSUB ran and the font has GPOS (or with `opts.aat: true`); else GPOS. Then, when `kerx` was not applied and either GPOS was not or has no `kern` feature: `kerx` if the font has it (only without GPOS), else the `kern` table's horizontal format 0 subtables, after GPOS. `kerx` and `kern` read `'applied'` or `'none'`; `opts.features` `{ kern: false }` turns off their kerning (not `kerx` format 4's attachments). A `kerx` attachment takes its base's offset minus the advances in between, as a GPOS mark does; only after GPOS do GDEF marks lose their advance.
- **Variations** (`opts.coords`): the coordinates, normalised by [`varGlyph`](../variable/glyph.md), pick the GSUB and GPOS FeatureVariations record whose conditions hold, whose alternate feature tables replace theirs (`rvrn`, a default feature, is the usual one); each glyph's advance is taken at the coordinates from `varGlyph` (a `glyf` or CFF2 font; else `hmtx`'s); a format 3 anchor adds the rounded deltas of its VariationIndex devices from GDEF's item variation store. Value-record devices and ppem device tables are not applied. Without `opts.coords` the default instance is shaped.
- **A mark in right-to-left text** gains, after GPOS, the advances of the glyphs after its base up to itself, as HarfBuzz places a mark in a backward run (left to right it loses those from its base).
- **Characters to glyphs**: a variation sequence maps through the cmap's format 14 non-default UVS, else to the base character's glyph; a lone selector maps to nothing.
- **Guards**: nested lookups stop 16 deep, and a call runs at most `budget` subtable applications. Past either, no further lookup applies and `truncated` is `true`. A `GSUB` or `GDEF` table that does not parse is not applied, so a font the read accepts never makes the call throw.
- **Measured** by the axis-E suites `text-rendering-tests-shaping` and `text-rendering-tests-aat` (tools/office-scorecard): the static cases of the Unicode text-rendering-tests families GSUB-1..3, GPOS-1..5 and KERN-1..2, and MORX-1..41, rendered from these glyphs; `text-rendering-tests-variation` shapes its 132 cases with `opts.coords`.
- Not in the prebuilt bundles: the bundles wire read extensions through `fonts.use`, and this module is a function of its own.

## See also

- [`tableGsub`](../table/gsub.md) — the decoded lookups this engine applies
- [Extras index](./README.md)
