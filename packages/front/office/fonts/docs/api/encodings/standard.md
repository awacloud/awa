---
module: encodingStandard
category: encodings/standard
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingStandard

> StandardEncoding — Adobe Type 1 base (PDF Annex D.2).

**Module** `encodingStandard` | **Source** `packages/front/office/fonts/src/encodings/standard.js` | **Deps** none | **Worker-safe** yes

Default encoding for PostScript Type 1 fonts without an explicit `Encoding` override.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `STANDARD` | const `string[256]` | Indexed table. |
| `lookup` | function | `(byte: number) => string` — `STANDARD[byte & 0xFF]`; not documented on a previous revision of this page (`standard.js`, last line of the factory). |
| `encodingStandard` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import { encodingStandard } from '@awacloud/fonts';
const { STANDARD } = encodingStandard.factory();
```

## Notes

- High range (0x80..0xFF) is sparse — many `.notdef` slots.
- Main differences from WinAnsi: no `Euro` glyph at all; `bullet` sits at a different slot (0xB7 here vs 0x95 in `WIN_ANSI`).

## See also

- [lookup](./lookup.md)
- [encodings/winAnsi](./winAnsi.md)
