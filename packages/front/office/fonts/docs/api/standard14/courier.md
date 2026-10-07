---
module: standard14Courier
category: standard14/courier
dependencies: []
returns: object
worker-safe: true
status: complete
---

# standard14Courier

> Standard 14 — Courier family (monospace, fixed 600 advance).

**Module** `standard14Courier` | **Source** `packages/front/office/fonts/src/standard14/courier.js` | **Deps** none | **Worker-safe** yes

Courier is strictly monospace: every glyph occupies exactly 600 advance units. Four variants (Regular, Bold, Oblique, BoldOblique).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `COURIER_WIDTHS` | const `number[256]` | Array filled with `600`. |
| `courier` | const | Regular. |
| `courierBold` | const | Bold. |
| `courierOblique` | const | Oblique. |
| `courierBoldOblique` | const | Bold + Oblique. |
| `standard14Courier` | factory | Factory. |

## Usage

```js
import { standard14Courier } from '@awacloud/fonts';
const { courier } = standard14Courier.factory();
```

## Notes

- `flags = 0x23` → FixedPitch + Serif + Nonsymbolic.
- `fontBBox = [-23, -250, 715, 805]`.

## See also

- [lookup](./lookup.md)
- [helvetica](./helvetica.md) [times](./times.md)
