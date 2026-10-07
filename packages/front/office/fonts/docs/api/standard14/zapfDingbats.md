---
module: standard14ZapfDingbats
category: standard14/zapfDingbats
dependencies: []
returns: object
worker-safe: true
status: complete
---

# standard14ZapfDingbats

> Standard 14 — ITC Zapf Dingbats.

**Module** `standard14ZapfDingbats` | **Source** `packages/front/office/fonts/src/standard14/zapfDingbats.js` | **Deps** none | **Worker-safe** yes

Metrics for the decorative Zapf Dingbats font. Approximated widths (600 for most glyphs, 278 for space).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `ZAPF_WIDTHS` | const `number[256]` | Approximated widths. |
| `zapfDingbatsFont` | const | Metrics + `encoding: 'ZapfDingbats'`. |
| `standard14ZapfDingbats` | factory | Factory. |

## Usage

```js
import { standard14ZapfDingbats } from '@awacloud/fonts';
const { zapfDingbatsFont } = standard14ZapfDingbats.factory();
```

## Notes

- `flags = 0x04` → Symbolic.
- The default encoding is `ZapfDingbats`.

## See also

- [encodings/zapfDingbats](../encodings/zapfDingbats.md)
- [lookup](./lookup.md)
