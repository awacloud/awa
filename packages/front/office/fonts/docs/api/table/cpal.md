---
module: tableCpal
category: table/cpal
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableCpal

> Table `CPAL` — Color Palette (OT §8.8.6).

**Module** `tableCpal` | **Source** `packages/front/office/fonts/src/table/cpal.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

RGBA palettes used by COLR layered glyphs. v0 = palettes only; v1 adds paletteTypes/Labels/EntryLabels (light/dark variants).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseCpal` | function | `(bytes) => { version, numPaletteEntries, numPalettes, palettes: Array<{r,g,b,a}[]>, paletteTypesArrayOffset?, paletteLabelsArrayOffset?, paletteEntryLabelsArrayOffset?, paletteTypes? }`. |
| `tableCpal` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseCpal } = fw.runtime.resolve('tableCpal');
const cpal = parseCpal(sfnt.tables.CPAL.bytes);
console.log(cpal.palettes[0][0]); // { r, g, b, a } for palette 0's 1st stop
```

## Notes

- Raw records are BGRA (8-bit) → reformatted to `{ r, g, b, a }`.
- v1 fields are optional (offset 0 = absent).
- Only `paletteTypes` is resolved into an array when its offset is set;
  `paletteLabelsArrayOffset` and `paletteEntryLabelsArrayOffset` are
  stored as-is but not decoded into `paletteLabels` / `paletteEntryLabels`
  arrays — resolving those `name` table indices is left to the consumer.

## See also

- [colr](./colr.md)
