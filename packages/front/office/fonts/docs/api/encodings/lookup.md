---
module: encodingLookup
category: encodings/lookup
dependencies: [fontErrors, encodingWinAnsi, encodingMacRoman, encodingMacExpert, encodingStandard, encodingSymbol, encodingZapfDingbats]
returns: object
worker-safe: true
status: complete
---

# encodingLookup

> Dispatcher of PDF encodings by name — `lookupEncoding(name)`.

**Module** `encodingLookup` | **Source** `packages/front/office/fonts/src/encodings/lookup.js` | **Deps** `fontErrors`, `encodingWinAnsi`, `encodingMacRoman`, `encodingMacExpert`, `encodingStandard`, `encodingSymbol`, `encodingZapfDingbats` | **Worker-safe** yes

Used by `@awacloud/pdf` to resolve a single-byte font's byte stream into a glyph name, then (via cmap) into a Unicode code point.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `KNOWN_ENCODINGS` | const | Frozen list of the 8 accepted names (see Notes) — a previous revision of this page listed only 6. |
| `lookupEncoding` | function | `(name: string) => string[256]`. Throws `ContractError` if unknown. |
| `findCode` | function | `(encodingName, glyphName) => number \| null`. Reverse lookup — returns `null`, **not** `-1`, when the glyph isn't found (`lookup.js` line 56). |
| `encodingLookup` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { lookupEncoding, findCode } = fw.runtime.resolve('encodingLookup');
const tbl = lookupEncoding('WinAnsiEncoding');
console.log(findCode('WinAnsiEncoding', 'Aacute')); // 0xC1
console.log(findCode('WinAnsiEncoding', 'not-a-glyph')); // null
```

## Notes

- Accepted names (`lookup.js` lines 34–43): `WinAnsiEncoding`, `MacRomanEncoding`, `MacExpertEncoding`, `StandardEncoding`, `SymbolEncoding`, `ZapfDingbatsEncoding`, `Symbol`, `ZapfDingbats` — `SymbolEncoding`/`ZapfDingbatsEncoding` (aliases of `Symbol`/`ZapfDingbats`) were missing from a previous revision of this page.
- `findCode` returns `null` (not `-1`, and never throws) if the glyph isn't present in the encoding.

## See also

- [winAnsi](./winAnsi.md) [macRoman](./macRoman.md) [macExpert](./macExpert.md) [standard](./standard.md) [symbol](./symbol.md) [zapfDingbats](./zapfDingbats.md)
