---
module: extraShaperArabic
category: extra/shaper-arabic
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# extraShaperArabic

> Arabic shaper — assigns the contextual form isol/init/medi/fina.

**Module** `extraShaperArabic` | **Source** `packages/front/office/fonts/src/extra/shaper-arabic.js` | **Deps** `fontErrors` | **Worker-safe** yes

Implements the Unicode joining algorithm (UAX §9) over raw code points — the layer a GSUB engine consults before applying the `init`/`medi`/`fina`/`isol` features. Table covers U+0600..U+0670 (Arabic punctuation, hamza/consonants, combining marks) plus ZWNJ/ZWJ (U+200C/U+200D); a code point outside the table defaults to joining type `'U'` (`shaper-arabic.js` lines 46–100).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `JOINING_TYPES` | const | The code-point → joining-type lookup table itself (`{ [codePoint: number]: 'U'\|'L'\|'R'\|'D'\|'C'\|'T' }`), not an enum of the six type letters. |
| `joiningType` | function | `(cp) => 'U'\|'L'\|'R'\|'D'\|'C'\|'T'`. |
| `arabicShape` | function | `(codePoints: (number\|string)[]) => Array<'isol'\|'init'\|'medi'\|'fina'>` — one form string per input code point, **not** `Array<{ cp, form }>` (`shaper-arabic.js` lines 126–166: `return forms;`, a plain string array). |
| `arabicShapeString` | function | `(str: string) => Array<'isol'\|'init'\|'medi'\|'fina'>` — same return shape as `arabicShape`. |
| `extraShaperArabic` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { arabicShapeString } = fw.runtime.resolve('extraShaperArabic');
const shaped = arabicShapeString('مرحبا'); // e.g. ['init', 'medi', 'medi', 'medi', 'fina']
```

## Notes

- ZWJ (U+200D) and tatweel (U+0640) are type `'C'` (join-causing).
- Combining marks are type `'T'` (transparent for neighbour lookup).

## See also

- [extra/shaper-indic](./shaper-indic.md) [extra/shaper-cjk](./shaper-cjk.md) [table/gsub](../table/gsub.md)
