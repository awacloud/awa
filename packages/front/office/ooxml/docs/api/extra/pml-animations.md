---
module: pmlAnimations
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# pmlAnimations

> PML — slide-timing graph (`<p:timing>`, `par`/`seq`/`excl` + `cTn` + child time nodes).

**Module** `pmlAnimations` | **Source** `packages/front/office/ooxml/src/extra/pml-animations.js` | **Deps** `xml` | **Worker-safe** yes

Parses the recursive timing tree that drives PowerPoint animations on a slide.

## Resolve

```js
const ext = pmlAnimations.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseTiming` | `(el) => Timing` | full `<p:timing>` |
| `renderTiming` | `(t) => xmlNode` | back to XML |
| `parseTimeNode` | `(el) => TimeNode` | recursive helper |
| `renderTimeNode` | `(n) => xmlNode` | recursive |
| `parseCTn` / `renderCTn` | — | `<p:cTn>` common time node (cond lists, iterate, child/sub time-node lists, endSync) |
| `parseCBhvr` / `renderCBhvr` | — | `<p:cBhvr>` common behaviour (attrs + cTn + tgtEl + attrNameLst) |
| `parseCond` / `renderCond` | — | `<p:cond>` (tgtEl, tn, rtn) |
| `parseTgtEl` / `renderTgtEl` | — | `<p:tgtEl>` (spTgt/sldTgt/sndTgt/inkTgt) |
| `parseSpTgt` / `renderSpTgt` | — | `<p:spTgt>` (bg/txEl/subSp/oleChartEl/graphicEl) |
| `parseTxEl` / `renderTxEl` | — | `<p:txEl>` (charRg, pRg) |
| `parseIterate` / `renderIterate` | — | `<p:iterate>` (tmAbs, tmPct) |
| `parseTavLst` / `renderTavLst` | — | `<p:tavLst>` (list of `<p:tav>`) |
| `parseAnimVal` / `renderAnimVal` | — | `<p:val>`/`<p:to>`/`<p:from>`/`<p:by>`/`<p:progress>` value variant wrapper |
| `parseClrVal` / `renderClrVal` | — | `<p:clrVal>` (rgb/hsl) |
| `parseCMediaNode` / `renderCMediaNode` | — | `<p:cMediaNode>` shared by `audio`/`video` (cTn + tgtEl) |
| `parseCmd` / `renderCmd` | — | `<p:cmd>` (wraps `cBhvr`) |
| `parseAttrNameLst` / `renderAttrNameLst` | — | `<p:attrNameLst>` (list of `<p:attrName>` text values) |
| `parseBld` / `renderBld` | — | one `<p:bldP>`/`<p:bldDgm>`/`<p:bldGraphic>`/`<p:bldOleChart>`/`<p:bldSub>` build entry (tmplLst, bldAsOne, bldSub) |
| `TIME_NODE_TAGS` | `Set<string>` | tag names accepted as children of a time-node list |
| `BLD_TAGS` | `Set<string>` | tag names accepted as children of `<p:bldLst>` |

## Elements typed

`timing`, `tnLst`, `cTn`, `par`, `seq`, `excl`, `iterate`, `tmAbs`, `tmPct`, `attrNameLst`, `attrName`, `cBhvr`, `set`, `anim`, `animClr`, `animEffect`, `animMotion`, `animRot`, `animScale`, `cmd`, `subTnLst`, `endSync`, `endCondLst`, `stCondLst`, `cond`, `tgtEl`, `spTgt`, `tn`, `tev`.

## Roundtrip example

```js
pptx.use(pmlAnimations.factory(xml));
const r = pptx.read(bytes);
r.slides[0].timing.tnLst[0].cTn.dur; // '500'
```

## Notes

- The behaviour graph is sparse — most slides only set `iterate` / `cTn.dur`.
- Trigger conditions are kept as typed nodes (`cond.evt`, `cond.delay`).

## See also

- [pml-transitions](./pml-transitions.md)
- [Read+write pptx guide](../../guide/read-write-pptx.md)
