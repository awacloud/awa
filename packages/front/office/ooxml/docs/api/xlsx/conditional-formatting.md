---
module: xlsxConditionalFormatting
category: ooxml/xlsx
dependencies: [xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxConditionalFormatting

> `<conditionalFormatting>` blocks inside a sheet — rules + visualisations (§18.3.1.18).

**Module** `xlsxConditionalFormatting` | **Source** `packages/front/office/ooxml/src/xlsx/conditionalFormatting.js` | **Deps** `xml`, `ooxmlShared` | **Worker-safe** yes

Four families of rules: operator-based (cellIs, expression, containsText, top10, aboveAverage, …) applying a `dxf`; colour scale (2- or 3-colour gradient); data bar (in-cell horizontal bar); icon set (pictograms).

## Resolve

```js
const cf = runtime.resolve('xlsxConditionalFormatting');
// Returns: { parseBlock, renderBlock,
//            parseRule, renderRule,
//            parseCfvo, renderCfvo,
//            parseColorScale, renderColorScale,
//            parseDataBar, renderDataBar,
//            parseIconSet, renderIconSet,
//            parseColor, renderColor }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseBlock` / `renderBlock` | `<conditionalFormatting>` | Block with `sqref` + rules. |
| `parseRule` / `renderRule` | `<cfRule>` | A single rule. |
| `parseCfvo` / `renderCfvo` | `<cfvo>` | Conditional Formatting Value Object. |
| `parseColorScale` / `renderColorScale`, `parseDataBar` / `renderDataBar`, `parseIconSet` / `renderIconSet` | symmetric | Visualisations. |
| `parseColor` / `renderColor` | `<color>` | Colour helper. |

## Model

```js
block := {
    sqref: 'A1:A10' | 'A1:A5 C1:C5',     // multiple ranges, space-separated
    rules: [{
        type, priority, dxfId?, stopIfTrue?,
        // operator-based:
        operator?, formulas?: [string], text?,
        // top10 / aboveAverage:
        rank?, bottom?, percent?, aboveAverage?, equalAverage?, stdDev?,
        // timePeriod:
        timePeriod?,
        // visualisations:
        colorScale?: { cfvos: [cfvo], colors: [color] },
        dataBar?: { cfvos, color, showValue?, minLength?, maxLength? },
        iconSet?: { iconSet, cfvos, showValue?, percent?, reverse? },
        _extras?
    }],
    _extras?
}

cfvo := { type: 'min'|'max'|'num'|'percent'|'percentile'|'formula',
          val?: string, gte?: boolean }
color := { rgb?: 'AARRGGBB', theme?: number, tint?: number }
```

Blocks are attached to a sheet as `sheet.conditionalFormatting` (an array of
blocks) — [`xlsx`](./xlsx.md) calls `parseBlock` / `renderBlock` for each of
them during the sheet pass.

## Examples

### Red background above 100

```js
const cf = runtime.resolve('xlsxConditionalFormatting');
sheet.conditionalFormatting = [{
    sqref: 'B2:B100',
    rules: [{
        type: 'cellIs', priority: 1, dxfId: 0,
        operator: 'greaterThan', formulas: ['100']
    }]
}];
// dxfId indexes into workbook.styles.dxfs.
```

### Three-colour scale

```js
sheet.conditionalFormatting.push({
    sqref: 'C2:C50',
    rules: [{
        type: 'colorScale', priority: 2,
        colorScale: {
            cfvos: [
                { type: 'min' },
                { type: 'percentile', val: '50' },
                { type: 'max' }
            ],
            colors: [{ rgb: 'FFF8696B' }, { rgb: 'FFFFEB84' }, { rgb: 'FF63BE7B' }]
        }
    }]
});
```

### Data bar

```js
sheet.conditionalFormatting.push({
    sqref: 'D2:D20',
    rules: [{
        type: 'dataBar', priority: 3,
        dataBar: {
            cfvos: [{ type: 'min' }, { type: 'max' }],
            color: { rgb: 'FF638EC6' },
            minLength: 0, maxLength: 100
        }
    }]
});
```

## Notes

- `priority` is the tiebreaker (lower wins). It must be unique across the sheet's rules.
- `dxfId` references `xlsxStyles.dxfs[]`. Visualisations use no dxf — the colour/icon is inline.
- `iconSet.iconSet` values: `'3Arrows'`, `'3TrafficLights1'`, `'4RedToBlack'`, `'5Rating'`, and so on.
- The module is a pure codec — it never touches the sheet itself; use [`xlsxStyles.withDxfs`](./styles.md) to allocate the `dxfId` values first.

## See also

- [xlsx](./xlsx.md) — sheet host (`sheet.conditionalFormatting`).
- [xlsx-styles](./styles.md) — the `dxfs` registry.
