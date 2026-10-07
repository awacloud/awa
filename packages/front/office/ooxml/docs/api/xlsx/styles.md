---
module: xlsxStyles
category: ooxml/xlsx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxStyles

> `xl/styles.xml` part — indexed registries (numFmts/fonts/fills/borders/cellXfs/dxfs) §18.8.

**Module** `xlsxStyles` | **Source** `packages/front/office/ooxml/src/xlsx/styles.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

Cells point into `cellXfs` through their `s` attribute. Six indexed tables: `numFmts` (format codes), `fonts`, `fills`, `borders`, `cellStyleXfs` (templates) and `cellXfs` (concrete formats), plus `dxfs` (differential formats) for conditional formatting.

## Resolve

```js
const styles = runtime.resolve('xlsxStyles');
// Returns: { parse, serialize, bytesOf, defaults, withCellXfs, withDxfs,
//            parseFont, renderFont, parseFill, renderFill,
//            parseBorder, renderBorder,
//            parseXf, renderXf, parseDxf, renderDxf,
//            parseColor, renderColor,
//            REL_TYPE_STYLES, CT_STYLES }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => stylesObj` | Typed model. |
| `serialize` | `(obj) => string` | `<styleSheet>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `defaults` | `() => stylesObj` | Minimal valid skeleton. |
| `withCellXfs` | `(xfs: xf[]) => { styles, indices }` | Builds a **fresh** `defaults()` object and appends `xfs` to its `cellXfs`. |
| `withDxfs` | `(stylesObj, dxfs: dxf[]) => number[]` | Appends to an **existing** object's `dxfs` in place and returns the allocated indices. |
| `parseFont` / `renderFont`, `parseFill` / `renderFill`, `parseBorder` / `renderBorder`, `parseXf` / `renderXf`, `parseDxf` / `renderDxf`, `parseColor` / `renderColor` | element round-trips | Isolated elements. |
| `REL_TYPE_STYLES`, `CT_STYLES` | string | OPC bindings. |

The two helpers are **not symmetric**: `withCellXfs` ignores any object you
already have and starts from `defaults()`, whereas `withDxfs` takes the target
object as its first argument and mutates it.

## Model (summary)

```js
{
    numFmts: [{ id, formatCode }],
    fonts: [{ size?, color?, name?, family?, scheme?, bold?, italic?, underline?, strike? }],
    fills: [{ patternType, fgColor?, bgColor? }],
    borders: [{ left?, right?, top?, bottom?, diagonal?, diagonalUp?, diagonalDown? }],
    cellStyleXfs: [xf],
    cellXfs: [xf],
    cellStyles: [{ name, xfId, builtinId? }],
    dxfs?: [dxf],
    _extras?
}

xf := { numFmtId?, fontId?, fillId?, borderId?, xfId?,
        applyFont?, applyFill?, applyBorder?, applyNumberFormat?, applyAlignment?,
        alignment?: { horizontal?, vertical?, wrapText?, indent?,
                      textRotation?, shrinkToFit? } }

borderSide := { style?, color? }   // 'thin'|'medium'|'thick'|…
color := { rgb?: 'AARRGGBB', theme?: number, tint?: number, indexed?: number }
```

`defaults()` returns one Calibri 11 font, the two mandatory fills
(`none` + `gray125`), one empty border, one `cellStyleXfs` / `cellXfs` entry
and the `Normal` cell style.

## Examples

### Allocate a bold red format

```js
const styles = runtime.resolve('xlsxStyles');

// `withCellXfs` starts from defaults() — build the object it returns,
// then extend it.
const { styles: obj, indices } = styles.withCellXfs([
    { fontId: 1, applyFont: true }
]);
obj.fonts.push({ size: 11, name: 'Calibri', bold: true, color: { rgb: 'FFCC0000' } });
const sIndex = indices[0];    // set `s: sIndex` on the relevant cells
```

### Custom number format

```js
obj.numFmts.push({ id: 164, formatCode: '0.00%;[Red]-0.00%' });
obj.cellXfs.push({ numFmtId: 164, applyNumberFormat: true, xfId: 0 });
```

### Differential formats for conditional formatting

```js
const dxfIndices = styles.withDxfs(obj, [
    { fill: { patternType: 'solid', bgColor: { rgb: 'FFFFC7CE' } } }
]);
// dxfIndices[0] is the `dxfId` a conditional-formatting rule references.
```

## Notes

- numFmt ids **0–163 are reserved** (built-ins). User-defined ones start at 164.
- `color.rgb` is `AARRGGBB` (alpha first); prefix `FF` for fully opaque.
- `xf.xfId` references `cellStyleXfs` (the parent template); `cellXfs[*].xfId` is usually 0 (Normal).
- The `applyFont` / `applyFill` flags are required for Excel to honour the overrides; without them the style inherits from its parent `xfId`.
- Attach the object as `workbook.styles` before calling `xlsx.write(workbook)`.
- A root other than `<styleSheet>` raises `ParseError('xlsx/styles-bad-root')`.

## See also

- [xlsx](./xlsx.md) — `cell.s` points here.
- [xlsx-conditional-formatting](./conditional-formatting.md) — references `dxfs`.
