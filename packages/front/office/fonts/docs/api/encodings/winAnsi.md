---
module: encodingWinAnsi
category: encodings/winAnsi
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingWinAnsi

> WinAnsiEncoding — PDF Annex D.2, byte → glyph-name table (256 entries).

**Module** `encodingWinAnsi` | **Source** `packages/front/office/fonts/src/encodings/winAnsi.js` | **Deps** none | **Worker-safe** yes

Default Windows encoding for Windows-originated PDFs. Slot 0x27 = `quotesingle`, 0x60 = `grave` (ISO 32000-2 Annex D — the ASCII apostrophe and grave accent); the typographic `quoteleft`/`quoteright` live at 0x91/0x92.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `WIN_ANSI` | const `string[256]` | Indexed table: `WIN_ANSI[byte]` = PostScript name or `.notdef`. |
| `lookup` | function | `(byte: number) => string` — `WIN_ANSI[byte & 0xFF]`; not documented on a previous revision of this page (`winAnsi.js`, last line of the factory). |
| `encodingWinAnsi` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingWinAnsi } from '@awacloud/fonts';
const { WIN_ANSI } = encodingWinAnsi.factory();
console.log(WIN_ANSI[0x41]); // 'A'
```

## Notes

- 0x00..0x1F + 0x7F = `.notdef` (control range).
- For generic resolution by encoding name, see [lookup](./lookup.md).

## See also

- [lookup](./lookup.md)
- [encodings/standard](./standard.md)
