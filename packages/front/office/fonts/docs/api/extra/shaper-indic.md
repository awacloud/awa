---
module: extraShaperIndic
category: extra/shaper-indic
dependencies: [fontErrors]
returns: object
worker-safe: true
status: complete
---

# extraShaperIndic

> Indic shaper — clustering + reph reorder (Devanagari focus).

**Module** `extraShaperIndic` | **Source** `packages/front/office/fonts/src/extra/shaper-indic.js` | **Deps** `fontErrors` | **Worker-safe** yes

Reordering pass that runs before Indic GSUB: pre-base matras are moved, the `Ra+Halant` reph is migrated. Table covers U+0900..U+097F. Only the `'deva'` (Devanagari) script is actually registered in `INDIC_SCRIPTS` today — Bengali/Gujarati are not wired up despite being named in the module's design comment (`shaper-indic.js` line 12).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `DEVANAGARI_CATEGORIES` | const | The **raw** literal category table, built before the consonant ranges (U+0915..0939, U+0958..095F, U+0978..097F) are filled in — every consonant code point is missing (`shaper-indic.js` lines 53–99). Not used by `categorize`/`splitClusters`/`indicReorder`. |
| `DEVA_CATEGORIES` | const | The **complete** table `categorize` actually resolves against (`INDIC_SCRIPTS.deva`) — `DEVANAGARI_CATEGORIES` plus the three consonant ranges filled in a loop (lines 101–106). |
| `INDIC_SCRIPTS` | const | Map of supported scripts — currently `{ deva: DEVA_CATEGORIES }` only. |
| `DEVA_RA` | const | `0x0930` (Devanagari Ra). |
| `categorize` | function | `(cp, script='deva') => IndicCategory`. Unknown `script` falls back to `DEVA_CATEGORIES`. |
| `splitClusters` | function | `(cps, script='deva') => Array<{ start, end, cats }>`. |
| `indicReorder` | function | `(codePoints, script='deva') => number[]` (reordered). |
| `extraShaperIndic` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { indicReorder } = fw.runtime.resolve('extraShaperIndic');
const out = indicReorder([0x0915, 0x093F], 'deva'); // pre-base matra moved before the base
```

## Notes

- Deliberately compact subset — covers the most common Devanagari patterns.
- Output feeds Indic GSUB (features `pres`, `blws`, etc.).

## See also

- [extra/shaper-arabic](./shaper-arabic.md) [extra/shaper-cjk](./shaper-cjk.md)
