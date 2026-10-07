---
module: extraMath
category: extra/math
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# extraMath

> Table `MATH` — OpenType math typesetting metadata.

**Module** `extraMath` | **Source** `packages/front/office/fonts/src/extra/math.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Parses the header + `MathConstants` struct (4 plain `int16` fields plus 51 `MathValueRecord` fields, plus one trailing plain `int16` — 56 values total; the full OT spec defines 89 `MathConstants` fields, this module decodes a subset). `MathGlyphInfo` and `MathVariants` are kept as bytes for downstream layout passes.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `MATH_CONSTANTS_FIELDS` | const | Frozen array of **55** field names (4 plain `int16` + 51 `MathValueRecord`) — the trailing 56th field (`radicalDegreeBottomRaisePercent`) is decoded into `constants` but is **not** included in this array (`math.js` lines 43–107, `SIZE` computation at line 174). |
| `parseMath` | function | `(bytes) => { majorVersion, minorVersion, mathConstantsOffset, mathGlyphInfoOffset, mathVariantsOffset, constants, glyphInfo, variants }`. `glyphInfo`/`variants` — not `mathGlyphInfo`/`mathVariants` — are `{ offset, bytes } \| null` (`math.js` lines 148–158). |
| `extraMath` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseMath } = fw.runtime.resolve('extraMath');
const math = parseMath(sfnt.tables.MATH.bytes);
console.log(math.constants.scriptPercentScaleDown);
```

## Notes

- `MathValueRecord` = `{ value: int16, deviceOffset: Offset16 }`.
- Included in `fonts-large`.

## See also

- [extra/jstf](./jstf.md) [table/base](../table/base.md)
