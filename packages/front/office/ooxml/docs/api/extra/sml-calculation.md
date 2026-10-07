---
module: smlCalculation
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# smlCalculation

> SML — calcChain.xml + workbook calc properties (`<calcPr>`).

**Module** `smlCalculation` | **Source** `packages/front/office/ooxml/src/extra/sml-calculation.js` | **Deps** `xml` | **Worker-safe** yes

Parses / writes the `xl/calcChain.xml` part and the workbook-level `<calcPr>` settings.

## Resolve

```js
const ext = smlCalculation.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseCalcChain` | `(rootEl) => CalcChain` | `{ entries: [{ r, i, s?, l? }] }` |
| `renderCalcChain` | `(c) => xmlNode` | `<calcChain>` |
| `parseCalcPr` / `renderCalcPr` | — | workbook `<calcPr>` |

## Elements typed

`calcChain`, `c` (calc entry, `r` ref / `i` sheet id / `s` flag / `l` reset), `calcPr` (`calcId`, `calcMode`, `iterate`, `iterateCount`, `iterateDelta`, `concurrentCalc`, `concurrentManualCount`, `forceFullCalc`, `fullCalcOnLoad`).

## Notes

- The chain is informational — Excel rebuilds it on open.
- Modifying it on write only matters for performance hints.

## See also

- [xlsx](../xlsx/xlsx.md)
- [sml-workbook-config](./sml-workbook-config.md)
