---
module: tableGsub
category: table/gsub
dependencies: [fontErrors, fontReader, tableGsubScriptFeatureList, tableGsubTypes14, tableGsubTypes57]
returns: object
worker-safe: true
status: complete
---

# tableGsub

> Table `GSUB` — Glyph Substitution (OT §6.5.7).

**Module** `tableGsub` | **Source** `packages/front/office/fonts/src/table/gsub.js` | **Deps** `fontErrors`, `fontReader`, `tableGsubScriptFeatureList`, `tableGsubTypes14`, `tableGsubTypes57` | **Worker-safe** yes

Decodes the Script/Feature/Lookup lists and every lookup subtable type 1–8: Type 1 (Single), Type 2 (Multiple), Type 3 (Alternate), Type 4 (Ligature), Type 5 (Context), Type 6 (Chaining Context), Type 7 (Extension), Type 8 (Reverse Chaining Contextual Single). Lookup types outside 1–8 fall back to metadata only (`{ type, parsed: false }`).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseGsub` | function | `(bytes) => { majorVersion, minorVersion, scripts, features, lookups }`. |
| `parseGsubSubtable` | function | `(type, bytes) => subtable` — dispatches to the per-type decoder; unknown types return `{ type, parsed: false }`. |
| `parseScriptList` | function | `(bytes, offset) => Script[]`. |
| `parseFeatureList` | function | `(bytes, offset) => Feature[]`. |
| `parseLookupList` | function | `(bytes, offset, parseSubtableFn) => Lookup[]`. |
| `tableGsub` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseGsub } = fw.runtime.resolve('tableGsub');
const gsub = parseGsub(sfnt.tables.GSUB.bytes);
const liga = gsub.features.find(f => f.tag === 'liga');
```

## Notes

- Type 4 ligatures decoded into `{ ligGlyph, components }` array.
- `parseScriptList`/`parseFeatureList`/`parseLookupList` exported for reuse by GPOS.
- Type 8 (`ReverseChainSingleSubstFormat1`) decodes to `{ type: 8, format: 1, coverage, backtrackCoverages, lookaheadCoverages, substitutes }`: the three coverages are decoded Coverage objects (the two arrays in file order, possibly empty) and `substitutes` is the `number[]` of substitute glyph IDs. Any other type 8 format throws a `ParseError` with code `fonts/gsub-reverse-format`. Substitutions are decoded, not applied. Type 8 is verified against synthetic subtables built from the specification: no font in the test corpus carries a type 8 lookup.
- Sub-lookup logic is split across `./gsub/script-feature-list.js`, `./gsub/types-1-4.js` (Single/Multiple/Alternate/Ligature), `./gsub/types-5-7.js` (Context/Chaining/Extension/Reverse Chaining).

## See also

- [table/gpos](./gpos.md) [table/gdef](./gdef.md)
- [layout/classDefinitions](../layout/classDefinitions.md)
