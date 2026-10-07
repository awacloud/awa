---
module: tableGdef
category: table/gdef
dependencies: [fontErrors, fontReader, layoutClassDefinitions]
returns: object
worker-safe: true
status: complete
---

# tableGdef

> Table `GDEF` — Glyph Definition (OT §7.5).

**Module** `tableGdef` | **Source** `packages/front/office/fonts/src/table/gdef.js` | **Deps** `fontErrors`, `fontReader`, `layoutClassDefinitions` | **Worker-safe** yes

Glyph-class metadata for GSUB/GPOS: Base (1), Ligature (2), Mark (3), Component (4). Includes `attachList`, `ligCaretList`, `markAttachClassDef` and — depending on version — `markGlyphSetsDef`, `itemVarStore`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `GDEF_CLASS` | const | Frozen enum `{ BASE:1, LIGATURE:2, MARK:3, COMPONENT:4 }`. |
| `parseGdef` | function | `(bytes) => { majorVersion, minorVersion, glyphClassDef, markAttachClassDef, attachListOffset, ligCaretListOffset, markGlyphSetsDefOffset, itemVarStoreOffset }`. |
| `tableGdef` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseGdef, GDEF_CLASS } = fw.runtime.resolve('tableGdef');
const gdef = parseGdef(sfnt.tables.GDEF.bytes);
const isMark = gdef.glyphClassDef?.lookup(gid) === GDEF_CLASS.MARK;
```

## Notes

- Versions 1.0 / 1.2 / 1.3 supported (markGlyphSets / itemVarStore offsets are 0 when absent, not `undefined`).
- `glyphClassDef` is the result of `parseClassDef` (with `.lookup`).

## See also

- [layout/classDefinitions](../layout/classDefinitions.md)
- [table/gsub](./gsub.md) [table/gpos](./gpos.md)
