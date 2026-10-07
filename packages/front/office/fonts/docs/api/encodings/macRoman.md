---
module: encodingMacRoman
category: encodings/macRoman
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingMacRoman

> MacRomanEncoding — PDF Annex D.2, classic Mac OS encoding.

**Module** `encodingMacRoman` | **Source** `packages/front/office/fonts/src/encodings/macRoman.js` | **Deps** none | **Worker-safe** yes

256-byte table → glyph name for Mac-originated PDFs. High range is Apple-specific.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `MAC_ROMAN` | const `string[256]` | Indexed table. |
| `lookup` | function | `(byte: number) => string` — `MAC_ROMAN[byte & 0xFF]`; not documented on a previous revision of this page (`macRoman.js`, last line of the factory). |
| `encodingMacRoman` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingMacRoman } from '@awacloud/fonts';
const { MAC_ROMAN } = encodingMacRoman.factory();
```

## Notes

- 0x27 = `quotesingle`, 0x60 = `grave` — this matches `WinAnsiEncoding` (ISO 32000-2 Annex D) but differs from `StandardEncoding`, which uses `quoteright`/`quoteleft` at those two slots (`standard.js` `ascii` array); the printable ASCII range is not identical across all three encodings.
- Unassigned slots → `.notdef`.

## See also

- [lookup](./lookup.md)
- [encodings/macExpert](./macExpert.md)
