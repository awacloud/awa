---
module: standard14Symbol
category: standard14/symbol
dependencies: []
returns: object
worker-safe: true
status: complete
---

# standard14Symbol

> Standard 14 — Symbol (Greek + math).

**Module** `standard14Symbol` | **Source** `packages/front/office/fonts/src/standard14/symbol.js` | **Deps** none | **Worker-safe** yes

Approximated metrics for the Adobe Symbol font. Most printable glyphs use a width of 500.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `SYMBOL_WIDTHS` | const `number[256]` | Approximated widths. |
| `symbolFont` | const | Metrics + `encoding: 'Symbol'`. |
| `standard14Symbol` | factory | Factory. |

## Usage

```js
import { standard14Symbol } from '@awacloud/fonts';
const { symbolFont } = standard14Symbol.factory();
```

## Notes

- `flags = 0x04` → Symbolic.
- The default encoding is `Symbol` (see [encodings/symbol](../encodings/symbol.md)).

## See also

- [encodings/symbol](../encodings/symbol.md)
- [lookup](./lookup.md)
