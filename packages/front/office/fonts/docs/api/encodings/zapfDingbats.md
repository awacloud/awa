---
module: encodingZapfDingbats
category: encodings/zapfDingbats
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingZapfDingbats

> Built-in encoding of the ITC Zapf Dingbats font (PDF Annex D.6).

**Module** `encodingZapfDingbats` | **Source** `packages/front/office/fonts/src/encodings/zapfDingbats.js` | **Deps** none | **Worker-safe** yes

256-byte table — each slot maps to a name `a<N>` (Zapf catalogue number).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `ZAPF_DINGBATS` | const `string[256]` | Indexed table. |
| `lookup` | function | `(byte: number) => string` — `ZAPF_DINGBATS[byte & 0xFF]`; not documented on a previous revision of this page (`zapfDingbats.js`, last line of the factory). |
| `encodingZapfDingbats` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingZapfDingbats } from '@awacloud/fonts';
const { ZAPF_DINGBATS } = encodingZapfDingbats.factory();
```

## Notes

- Names follow the `a1`, `a2`, …, `a204` convention (original ITC catalogue) — not `a202`, the highest entry actually present is `a204` (`zapfDingbats.js`).
- Equivalent Unicode code points live in the U+2700..U+27BF range.

## See also

- [standard14/zapfDingbats](../standard14/zapfDingbats.md)
- [lookup](./lookup.md)
