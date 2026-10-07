---
module: standard14Helvetica
category: standard14/helvetica
dependencies: []
returns: object
worker-safe: true
status: complete
---

# standard14Helvetica

> Standard 14 — Helvetica family (4 variants, Adobe AFM metrics).

**Module** `standard14Helvetica` | **Source** `packages/front/office/fonts/src/standard14/helvetica.js` | **Deps** none | **Worker-safe** yes

Regular metrics from the Adobe `Helvetica.afm`, 1000 upem. `italicAngle` distinguishes roman from oblique.

Bold has its OWN width table (`HELVETICA_BOLD_WIDTHS`), parsed from the vendored `vendor/afm/Helvetica-Bold.afm` by `tools/gen-standard14-widths.mjs` — real Helvetica-Bold `A` = 722 vs Helvetica `A` = 667, so bold text no longer measures like regular. Oblique legitimately SHARES its upright's table (real Adobe PDF behaviour): `helveticaOblique` uses `HELVETICA_WIDTHS`, `helveticaBoldOblique` uses `HELVETICA_BOLD_WIDTHS`. Regenerate with `bun tools/gen-standard14-widths.mjs` from the package root after re-vendoring the AFMs (provenance + sha256s: `vendor/afm/PROVENANCE.md`; `vendor/afm/NOTICE-adobe-afm.html` must travel with the AFMs and never be removed from `vendor/afm/`).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `HELVETICA_WIDTHS` | const `number[256]` | Regular + Oblique widths. |
| `HELVETICA_BOLD_WIDTHS` | const `number[256]` | Bold + BoldOblique widths. |
| `helveticaRegular` | const | `{ fontName, familyName, flags, fontBBox, ascent, descent, capHeight, xHeight, stemV, stemH, italicAngle, weight, widths }`. |
| `helveticaBold` | const | Bold variant — `widths: HELVETICA_BOLD_WIDTHS`. |
| `helveticaOblique` | const | Oblique variant (`italicAngle` ≠ 0) — shares `HELVETICA_WIDTHS`. |
| `helveticaBoldOblique` | const | Bold + Oblique — shares `HELVETICA_BOLD_WIDTHS`. |
| `standard14Helvetica` | factory | Factory. |

## Usage

```js
import { standard14Helvetica } from '@awacloud/fonts';
const { helveticaRegular } = standard14Helvetica.factory();
console.log(helveticaRegular.fontBBox); // [-166,-225,1000,931]
```

## Notes

- `flags = 0x20` → Nonsymbolic (PDF 32000-1 §9.8.2).
- For resolution by PDF name, use [lookup](./lookup.md).

## See also

- [lookup](./lookup.md)
- [times](./times.md) [courier](./courier.md)
