---
module: dmlMainMisc
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# dmlMainMisc

> DML main — long-tail sweeper for shared DrawingML (`dml-main.xsd`) elements.

**Module** `dmlMainMisc` | **Source** `packages/front/office/ooxml/src/extra/dml-main-misc.js` | **Deps** `xml` | **Worker-safe** yes

Bulk parser/renderer for the residual DrawingML elements not covered by [dml-effects](./dml-effects.md), [dml-fills-advanced](./dml-fills-advanced.md), [dml-shapes-advanced](./dml-shapes-advanced.md), or [dml-chart-misc](./dml-chart-misc.md).

## Resolve

```js
const ext = dmlMainMisc.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseElement` / `renderElement` | — | generic dispatcher |
| `ELEMENTS` | `string[]` | tag names handled |

## Notes

- Covers theme scheme color slots (`accent1-6`, `dk1`/`dk2`/`lt1`/`lt2`, `hlink`/`folHlink`), color transforms (`alphaMod`, `hueMod`, `satMod`, `redMod`, `greenMod`, `blueMod`, `gamma`, …), table style parts (`a:tblStyle`, `a:tblStyleLst`, `a:tcTxStyle`, `a:tcBdr`, `firstRow`/`lastRow`/`band1H`/…), theme overrides (`a:themeOverride`, `a:themeManager`), connector/group shape locks, and media refs (`audioFile`, `videoFile`, `quickTimeFile`, …). It does **not** cover `<a:hslClr>` or `mc:AlternateContent` — those are out of scope for this module.
- Round-trip is byte-stable: add this module only if you need the long-tail DrawingML elements recognised and preserved.

## See also

- [dml-effects](./dml-effects.md)
- [docx-full bundle](../bundles/docx-full.md)
