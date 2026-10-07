---
module: encodingSymbol
category: encodings/symbol
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingSymbol

> Built-in encoding of the Symbol font (PDF Annex D.5).

**Module** `encodingSymbol` | **Source** `packages/front/office/fonts/src/encodings/symbol.js` | **Deps** none | **Worker-safe** yes

256-byte table for the Symbol font: uppercase/lowercase Greek letters + math operators + assorted dingbats.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `SYMBOL` | const `string[256]` | Indexed table. |
| `lookup` | function | `(byte: number) => string` — `SYMBOL[byte & 0xFF]`; not documented on a previous revision of this page (`symbol.js`, last line of the factory). |
| `encodingSymbol` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingSymbol } from '@awacloud/fonts';
const { SYMBOL } = encodingSymbol.factory();
console.log(SYMBOL[0x41]); // 'Alpha'
```

## Notes

- Distinct from the Unicode "Greek and Coptic" block — this is a historical Adobe convention.
- 0x53 = `Sigma`, 0x73 = `sigma`.

## See also

- [standard14/symbol](../standard14/symbol.md) — associated metrics
- [lookup](./lookup.md)
