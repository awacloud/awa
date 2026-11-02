---
module: standard14Times
category: standard14/times
dependencies: []
returns: object
worker-safe: true
status: complete
---

# standard14Times

> Standard 14 — Times family (4 variants, Adobe AFM metrics).

**Module** `standard14Times` | **Source** `packages/front/office/fonts/src/standard14/times.js` | **Deps** none | **Worker-safe** yes

Regular metrics from the Adobe `Times-Roman.afm`, 1000 upem.

Bold, Italic and BoldItalic each have their OWN width table, parsed from the vendored `vendor/afm/{Times-Bold,Times-Italic,Times-BoldItalic}.afm` by `tools/gen-standard14-widths.mjs` — unlike Helvetica's Oblique, none of the three shares another variant's table (real Times-Bold `A` = 722, Times-Italic `A` = 611, Times-BoldItalic `A` = 667, vs Times-Roman `A` = 722). Regenerate with `bun tools/gen-standard14-widths.mjs` from the package root after re-vendoring the AFMs (provenance + sha256s: `vendor/afm/PROVENANCE.md`; `vendor/afm/NOTICE-adobe-afm.html` must travel with the AFMs and never be removed from `vendor/afm/`).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `TIMES_ROMAN_WIDTHS` | const `number[256]` | Regular widths. |
| `TIMES_BOLD_WIDTHS` | const `number[256]` | Bold widths. |
| `TIMES_ITALIC_WIDTHS` | const `number[256]` | Italic widths. |
| `TIMES_BOLD_ITALIC_WIDTHS` | const `number[256]` | BoldItalic widths. |
| `TIMES_ROMAN_EXTRA_WIDTHS`, `TIMES_BOLD_EXTRA_WIDTHS`, `TIMES_ITALIC_EXTRA_WIDTHS`, `TIMES_BOLD_ITALIC_EXTRA_WIDTHS` | const `Object<string, number>` | Each variant's `extraWidths`: the widths, by glyph name, of the 21 glyphs MacRomanEncoding and StandardEncoding name that the WinAnsi table cannot hold (`fi`, `fl`, `Lslash`, `dotlessi`, `fraction`, the accents `breve` … `caron`, and the Mac Roman math glyphs the face carries), from its own AFM. |
| `timesRoman` | const | Regular variant — `widths: TIMES_ROMAN_WIDTHS`. |
| `timesBold` | const | Bold variant — `widths: TIMES_BOLD_WIDTHS`. |
| `timesItalic` | const | Italic variant (`italicAngle` = -15.5) — `widths: TIMES_ITALIC_WIDTHS`. |
| `timesBoldItalic` | const | Bold + Italic — `widths: TIMES_BOLD_ITALIC_WIDTHS`. |
| `standard14Times` | factory | Factory. |

## Usage

```js
import { standard14Times } from '@awacloud/fonts';
const { timesRoman } = standard14Times.factory();
```

## Notes

- `flags = 0x22` → Serif + Nonsymbolic.
- `fontBBox = [-168, -218, 1000, 898]`.

## See also

- [lookup](./lookup.md)
- [helvetica](./helvetica.md) [courier](./courier.md)
