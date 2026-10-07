---
module: encodingMacExpert
category: encodings/macExpert
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingMacExpert

> MacExpertEncoding — PDF Annex D.4, Expert companion fonts.

**Module** `encodingMacExpert` | **Source** `packages/front/office/fonts/src/encodings/macExpert.js` | **Deps** none | **Worker-safe** yes

Apple "Expert" encoding used by Times-Roman Expert / Symbol Expert. Very sparse table — most slots are `.notdef`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `MAC_EXPERT` | const `string[256]` | Indexed table. |
| `lookup` | function | `(byte: number) => string` — `MAC_EXPERT[byte & 0xFF]`; not documented on a previous revision of this page (`macExpert.js`, last line of the factory). |
| `encodingMacExpert` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingMacExpert } from '@awacloud/fonts';
const { MAC_EXPERT } = encodingMacExpert.factory();
```

## Notes

- Glyphs: `*oldstyle`, `*smallcaps`, rare ligatures, fractions.
- Rarely used in modern production — kept for legacy fidelity.

## See also

- [lookup](./lookup.md)
