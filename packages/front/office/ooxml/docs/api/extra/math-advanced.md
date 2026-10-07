---
module: mathAdvanced
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# mathAdvanced

> OMML — advanced math constructs (`eqArr`, `groupChr`, `mathPr`, `borderBox`, `phantom`).

**Module** `mathAdvanced` | **Source** `packages/front/office/ooxml/src/extra/math-advanced.js` | **Deps** `xml` | **Worker-safe** yes

Extends the core `math` module with the harder OMML elements: equation arrays, group characters, character boxes, phantoms, and the document-level `<m:mathPr>`.

## Resolve

```js
const ext = mathAdvanced.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseEqArr` / `renderEqArr` | — | aligned equation arrays |
| `parseEqArrPr` / `renderEqArrPr` | — | `<m:eqArrPr>` (maxDist, objDist, rSp, rSpRule, baseJc, ctrlPr) |
| `parseGroupChr` / `renderGroupChr` | — | `<m:groupChr>` (over/under brace) |
| `parseGroupChrPr` / `renderGroupChrPr` | — | `<m:groupChrPr>` (chr, pos, vertJc, ctrlPr) |
| `parseLimLow` / `renderLimLow` | — | `<m:limLow>` (limLowPr + `e` + `lim`) |
| `parseLimUpp` / `renderLimUpp` | — | `<m:limUpp>` (limUppPr + `e` + `lim`) |
| `renderLimLowPr` / `renderLimUppPr` | `(p) => xmlNode` | bare `<m:limLowPr>`/`<m:limUppPr>` renderers (`ctrlPr` only) |
| `parseIntLim` / `renderIntLim` | — | `<m:intLim>` val element |
| `parseBorderBox` / `renderBorderBox` | — | `<m:borderBox>` |
| `parseBorderBoxPr` / `renderBorderBoxPr` | — | `<m:borderBoxPr>` (`BB_FLAGS` hide/strike flags + ctrlPr) |
| `parseBox` / `renderBox` | — | invisible alignment box |
| `parseBoxPr` / `renderBoxPr` | — | `<m:boxPr>` (opEmu, noBreak, diff, brk, aln, ctrlPr) |
| `parsePhant` / `renderPhant` | — | `<m:phant>` (sizing-only) |
| `parsePhantPr` / `renderPhantPr` | — | `<m:phantPr>` (show, zeroAsc, zeroDesc, zeroWid, transp, ctrlPr) |
| `parseMathPr` / `renderMathPr` | — | document `<m:mathPr>` |
| `parseOMathParaPr` / `renderOMathParaPr` | — | `<m:oMathParaPr>` (`jc`) |
| `parseCtrlPr` / `renderCtrlPr` | — | `<m:ctrlPr>` (wraps `w:rPr`) |
| `parseArgPr` / `renderArgPr` | — | `<m:argPr>` (argSz, ctrlPr) |
| `parseMc` / `renderMc` | — | `<m:mc>` (one matrix-column entry, wraps `mcPr`) |
| `parseMcs` / `renderMcs` | — | `<m:mcs>` (list of `<m:mc>`) |
| `parseMcPr` / `renderMcPr` | — | `<m:mcPr>` (count, mcJc) |
| `parseMPr` / `renderMPr` | — | `<m:mPr>` matrix properties (baseJc, plcHide, rSpRule, cGpRule, rSp, cSp, cGp, mcs, ctrlPr) |
| `parseAln`/`renderAln`, `parseAlnScr`/`renderAlnScr`, `parseLit`/`renderLit`, `parseNor`/`renderNor`, `parseScr`/`renderScr`, `parseShow`/`renderShow`, `parseShp`/`renderShp`, `parseSubHide`/`renderSubHide`, `parseSupHide`/`renderSupHide`, `parseTransp`/`renderTransp` | `(el) => {val}` | bare val-only leaf-element pairs (coverage helpers) |
| `parseMathElement` | `(el) => {kind, value}` | dispatcher across every element this module + its `val`-only children handle |
| `MATHPR_VAL` | `string[]` | `<m:mathPr>`'s val-only child names |
| `BB_FLAGS` | `string[]` | `<m:borderBoxPr>`'s hide*/strike* flag names |

## Elements typed

`eqArr`, `eqArrPr`, `maxDist`, `objDist`, `rSp`, `rSpRule`, `groupChr`, `groupChrPr`, `chr`, `vertJc`, `pos`, `borderBox`, `borderBoxPr`, `hideTop`, `hideBot`, `hideLeft`, `hideRight`, `strikeH`, `strikeV`, `strikeBLTR`, `strikeTLBR`, `box`, `boxPr`, `aln`, `diff`, `phant`, `phantPr`, `show`, `zeroAsc`, `zeroDesc`, `zeroWid`, `mathPr`, `mathFont`, `brkBin`, `brkBinSub`, `smallFrac`, `dispDef`, `lMargin`, `rMargin`, `defJc`, `preSp`, `postSp`, `interSp`, `intraSp`, `wrapIndent`, `wrapRight`.

## Notes

- `mathPr` belongs to `word/settings.xml` — wire it via the [wml-settings](./wml-settings.md) extension to surface it on `result.settings.mathPr`.
- Equation arrays drop into `m:eqArr` rows that align around the `=` sign by default.

## See also

- [math (core)](../math.md) — base typed model
