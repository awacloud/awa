---
module: tableGpos
category: table/gpos
dependencies: [fontErrors, fontReader, tableGsubScriptFeatureList, tableGposValueRecord, tableGposType1, tableGposType2, tableGposType3, tableGposType46, tableGposType78, tableGposType9]
returns: object
worker-safe: true
status: complete
---

# tableGpos

> Table `GPOS` — Glyph Positioning (OT §6.5.8).

**Module** `tableGpos` | **Source** `packages/front/office/fonts/src/table/gpos.js` | **Deps** `fontErrors`, `fontReader`, `tableGsubScriptFeatureList`, `tableGposValueRecord`, `tableGposType1`, `tableGposType2`, `tableGposType3`, `tableGposType46`, `tableGposType78`, `tableGposType9` | **Worker-safe** yes

Header identical to GSUB. Every lookup subtable type 1–9 is decoded: Type 1 (Single Adjustment), Type 2 (Pair Adjustment — OT kerning), Type 3 (Cursive Adjustment), Types 4–6 (Mark-to-Base / Mark-to-Ligature / Mark-to-Mark attachment), Types 7–8 (Context / Chaining Context Positioning, formats 1–3), Type 9 (Extension Positioning). Only lookup types outside 1–9 fall back to metadata only (`{ type, parsed: false }`).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `VALUE_FORMAT` | const | Bitfield `{ X_PLACEMENT, Y_PLACEMENT, X_ADVANCE, Y_ADVANCE, ... DEVICE_OFFSET bits }`. |
| `parseGpos` | function | `(bytes) => { majorVersion, minorVersion, scripts, features, lookups }`. |
| `buildKerningTable` | function | `(gpos) => Map<number, number>` — memoised kerning map keyed by `(leftGid<<16)\|rightGid`, built from every Type 2 (Pair Adjustment) subtable's `value1.xAdvance`. Callers cache the result themselves. |
| `parseGposSubtable` | function | `(type, bytes) => subtable` — dispatches to the per-type decoder; unknown types return `{ type, parsed: false }`. |
| `valueRecordSize` | function | Computes a ValueRecord's byte size from its `valueFormat` bitfield. |
| `tableGpos` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseGpos } = fw.runtime.resolve('tableGpos');
const gpos = parseGpos(sfnt.tables.GPOS.bytes);
const kern = gpos.features.find(f => f.tag === 'kern');
```

## Notes

- ValueRecord is variable-size depending on `valueFormat` — decoded byte-by-byte.
- Reuses `parseScriptList` / `parseFeatureList` / `parseLookupList` from GSUB.
- `buildKerningTable` only captures `value1.xAdvance` — consumers needing richer ValueRecords should walk `gpos.lookups` directly.
- Sub-lookup logic is split across `./gpos/value-record.js`, `./gpos/type1-single.js`, `./gpos/type2-pair.js`, `./gpos/type3-cursive.js`, `./gpos/type4-6-mark.js`, `./gpos/type7-8-context.js`, `./gpos/type9-extension.js`.

## See also

- [table/gsub](./gsub.md) [table/gdef](./gdef.md) [table/kern](./kern.md)
