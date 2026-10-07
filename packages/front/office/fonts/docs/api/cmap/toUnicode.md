---
module: cmapToUnicode
category: cmap/toUnicode
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# cmapToUnicode

> ToUnicode CMap — Adobe TN #5014 / PDF §9.10.3, `beginbfchar` / `beginbfrange` mini-language.

**Module** `cmapToUnicode` | **Source** `packages/front/office/fonts/src/cmap/toUnicode.js` | **Deps** `fontErrors` | **Worker-safe** yes

Parses and emits the text format of PDF `ToUnicode` CMaps, which map a font's CIDs (or byte codes) to UTF-16BE Unicode code point sequences.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseToUnicode` | function | `(src: string) => Map<number, string>` (CID → text). |
| `buildToUnicode` | function | `(map, opts?) => string` (PDF stream ready to embed; `opts.codeBytes` 1 \| 2, see Options). |
| `cmapToUnicode` | factory | Factory `{ name, dependencies, factory }`. |

## Options (`buildToUnicode`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `registry` | string | `'Adobe'` | `/CIDSystemInfo` `/Registry`. |
| `ordering` | string | `'UCS'` | `/CIDSystemInfo` `/Ordering`. |
| `supplement` | number | `0` | `/CIDSystemInfo` `/Supplement`. |
| `cmapName` | string | `'Adobe-Identity-UCS'` | `/CMapName`. |
| `codeBytes` | `1 \| 2` | `2` | Width of the source codes. `2` emits `<0000> <FFFF>` and 4-hex-digit codes (CID-keyed / Type0 fonts, the historical output, byte-identical). `1` emits `<00> <FF>` and 2-hex-digit codes, for simple fonts. Any other value throws `ContractError` (`fonts/tou-bad-code-bytes`); with `1`, a source code outside `0x00..0xFF` (or non-integer) throws `ContractError` (`fonts/tou-code-out-of-range`). |

ISO 32000-1 §9.10.3: "The CMap file shall contain begincodespacerange and endcodespacerange operators that are consistent with the encoding that the font uses. In particular, for a simple font, the codespace shall be one byte long." Use `codeBytes: 1` for simple fonts (quoted from the standard; the clause text is not vendored in `references/SPEC`).

```js
const stream = buildToUnicode(new Map([[0x41, 'A'], [0x80, '€']]), { codeBytes: 1 });
// ... 1 begincodespacerange / <00> <FF> / endcodespacerange ...
// ... <41> <0041> / <80> <20AC> ...
```

`parseToUnicode` reads both forms back (it is code-width agnostic: it keys the result `Map` on the numeric value of each hex code).

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { buildToUnicode } = fw.runtime.resolve('cmapToUnicode');
const map = new Map([[0x01, 'A'], [0x02, 'B']]);
const stream = buildToUnicode(map);
```

## Notes

- Surrogate pairs are emitted as two 16-bit hex units.
- `buildToUnicode` automatically groups consecutive CIDs into `bfrange`.

## See also

- [embed-pdf/toUnicodeBuilder](../embed-pdf/toUnicodeBuilder.md)
- [table/cmap](../table/cmap.md)
