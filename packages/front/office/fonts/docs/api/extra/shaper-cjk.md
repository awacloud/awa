---
module: extraShaperCjk
category: extra/shaper-cjk
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# extraShaperCjk

> CJK shaper — vertical forms + IVS extraction.

**Module** `extraShaperCjk` | **Source** `packages/front/office/fonts/src/extra/shaper-cjk.js` | **Deps** `fontErrors` | **Worker-safe** yes

Two narrow responsibilities:
1. **Vertical form substitution** — Unicode fallback for fonts without `vert`/`vrt2`.
2. **Ideographic Variation Sequence** — split base + VS17..VS256 (U+E0100..U+E01EF).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `VERTICAL_FORMS` | const | Map cp → Unicode-recommended vertical form. |
| `VERTICAL_ROTATE_RANGES` | const | Ranges requiring 90° rotation. |
| `VS17`, `VS256`, `VS1`, `VS16` | const | Variation selectors. |
| `isVariationSelector` / `isIdeographicVS` / `isCJKIdeograph` / `hasVerticalForm` / `shouldRotateVertical` | function | Predicates. |
| `cjkVertical` | function | `(codePoints, isVertical) => number[]`. |
| `extractIVS` | function | `(codePoints) => Array<{ base, selector }>`. |
| `extraShaperCjk` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { cjkVertical, extractIVS } = fw.runtime.resolve('extraShaperCjk');
const vert = cjkVertical([0x3001, 0x3002], true);
const ivs  = extractIVS([0x9089, 0xE0100]);
```

## Notes

- `extractIVS` output is meant to be matched against a cmap Format 14 sub-table.
- Requires the `fonts-full` bundle.

## See also

- [extra/shaper-arabic](./shaper-arabic.md) [extra/shaper-indic](./shaper-indic.md)
- [table/cmap](../table/cmap.md)
