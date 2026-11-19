---
module: encodingZapfDingbatsGlyphs
category: encodings/zapfDingbatsGlyphs
dependencies: []
returns: object
worker-safe: true
status: complete
---

# encodingZapfDingbatsGlyphs

> The ITC Zapf Dingbats Glyph List as a frozen data table — the Zapf Dingbats font's glyph names to Unicode code points.

**Module** `encodingZapfDingbatsGlyphs` | **Source** `packages/front/office/fonts/src/encodings/zapfDingbatsGlyphs.js` | **Deps** _(none)_ | **Worker-safe** yes

The data behind [agl](./agl.md)'s `dingbatsNameToUnicode`: the names of the Zapf Dingbats font (`a1` to `a206`), which the Adobe Glyph List does not list. The table is generated, never hand-edited, from the vendored `zapfdingbats.txt` of the `adobe-type-tools/agl-aglfn` repository (BSD-3-Clause, Copyright 2002-2019 Adobe), at the same pinned commit as the AGL; the attribution is carried in the package [NOTICE](../../../NOTICE).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `ZAPF_DINGBATS_GLYPHS` | object | Frozen plain object mapping each glyph name to an array of one Unicode code point (`{ [glyphName]: number[] }`). It holds 201 entries. |
| `lookup` | function | `(name: string) => number[] \| undefined` — the code-point array for an exact glyph name, or `undefined` when the name is not an own entry (inherited keys such as `toString` do not match). |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { ZAPF_DINGBATS_GLYPHS, lookup } = fw.runtime.resolve('encodingZapfDingbatsGlyphs');

lookup('a73');                            // [0x25A0] — black square
lookup('a20');                            // [0x2714] — heavy check mark
lookup('space');                          // undefined — an AGL name
Object.keys(ZAPF_DINGBATS_GLYPHS).length; // 201
```

## Notes

- A name here means its character only in a Zapf Dingbats font: other fonts use names of the `aNN` form for unrelated glyphs. Resolve through [agl](./agl.md)'s `dingbatsNameToUnicode` when the font is one.
- `lookup` returns the stored array itself; treat it as read-only.

## See also

- [agl](./agl.md) — glyph name to Unicode resolver
- [aglTable](./aglTable.md) — the Adobe Glyph List table
- [lookup](./lookup.md) — byte-to-glyph-name encoding dispatcher (`ZapfDingbatsEncoding`: code to `aNN` name)
