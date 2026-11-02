---
module: ooxmlMath
category: ooxml/math
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# ooxmlMath

> Office Math Markup Language (OMML, ECMA-376 part 1 §22.1) — typed model + builders.

**Module** `ooxmlMath` | **Source** `packages/front/office/ooxml/src/math/math.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

OMML is cross-format: the same `<m:…>` markup appears in docx, pptx and (rarely) xlsx. The module types the structural constructs (fraction, superscript, radical, n-ary, delimiter, function, matrix, accent, bar, box); each "slot" is an array of `mathElement`, so composition is plain concatenation. Unknown elements are preserved as `mathUnknown`.

## Resolve

```js
const m = runtime.resolve('ooxmlMath');
// Returns: { parseOMath, renderOMath, parseOMathPara, renderOMathPara,
//            parseMathElement, renderMathElement,
//            r, frac, sup, sub, subSup, rad, nary, delim, func, matrix,
//            oMath, oMathPara, M_NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseOMath` | `(el: element) => oMathNode` | `{ type:'oMath', children:[…] }`. |
| `renderOMath` | `(node) => element` | `<m:oMath>`. |
| `parseOMathPara` / `renderOMathPara` | symmetric | Block-level wrapper. |
| `parseMathElement` / `renderMathElement` | `(el)` / `(node)` | Dispatch on the tag. |
| `r` | `(text, sty?) => mathRun` | `sty` ∈ `'p'\|'b'\|'i'\|'bi'`. |
| `frac` | `(num, den) => fracNode` | Numerator / denominator (each a slot or a single element). |
| `sup` / `sub` | `(base, exp) => sSupNode \| sSubNode` | Superscript / subscript. |
| `subSup` | `(base, sub, sup) => sSubSupNode` | Both at once. |
| `rad` | `(base, degree?) => radNode` | n-th root (empty degree → square root). |
| `nary` | `(op, sub, sup, body) => naryNode` | Sum / integral / product. |
| `delim` | `(content, opts?) => dNode` | Parens/brackets; `opts: {open,close,sep}`. |
| `func` | `(name, body) => funcNode` | Function application `f(x)`. |
| `matrix` | `(rows: slot[][]) => mNode` | m×n matrix. |
| `oMath` / `oMathPara` | varargs builders | Top-level wrappers. |
| `M_NS` | string | The `…/math` namespace. |

## Model (summary)

```js
mathElement :=
  | { type:'mathRun', text, rPr?:{sty?, _extras?}, _extras? }   // _extras: its w:rPr, verbatim
  | { type:'frac', numerator:[me], denominator:[me] }
  | { type:'sSup'|'sSub', base:[me], sup\|sub:[me] }
  | { type:'sSubSup', base:[me], sub:[me], sup:[me] }
  | { type:'rad', degree:[me], base:[me] }
  | { type:'nary', op:string, sub:[me], sup:[me], body:[me] }
  | { type:'d', open?, close?, sep?, children:[[me]] }
  | { type:'func', name:[me], body:[me] }
  | { type:'m', rows:[[[me]]] }
  | { type:'acc'|'bar'|'box', ... }
  | { type:'mathUnknown', node }

// every construct with a property element (m:fPr, m:dPr, …) also carries
// _prExtras?: [xmlNode] — that element's untyped children (m:ctrlPr …)
// oMathPara := { type:'oMathPara', children:[oMath], _extras? }   // m:oMathParaPr
```

## Examples

### Build `(a+b)² / 2`

```js
const m = runtime.resolve('ooxmlMath');
const expr = m.oMath(
    m.frac(
        m.sup(m.delim([m.r('a+b')]), m.r('2')),
        m.r('2')
    )
);
m.renderOMath(expr);
// → <m:oMath>…</m:oMath>
```

### Sum of `i²` from 1 to n

```js
m.oMath(
    m.nary('∑', m.r('i=1'), m.r('n'), m.sup(m.r('i'), m.r('2')))
);
```

### Round-trip

```js
const node = m.parseOMath(xml.parse(omml));
m.renderOMath(node);
// Equivalent XML (except for `_extras`, which this module does not handle).
```

## Notes

- Every builder accepts either a single element or an array — `r('x')` or `[r('x'), r('+'), r('y')]`.
- `delim` detects single-slot vs multi-slot automatically (`[[…], […]]`).
- `mathRun.rPr.sty` follows §22.1.2.114: `'p'` plain, `'b'` bold, `'i'` italic, `'bi'` both.
- OMML elements that are not modelled (limits, advanced alignment) become `mathUnknown` and are preserved in and out.
- **Property elements**: a construct's property element (`m:fPr`, `m:sSupPr`, `m:radPr`, `m:naryPr`, `m:dPr`, `m:funcPr`, `m:mPr`, `m:accPr`, `m:barPr`, `m:boxPr`) gives its typed children to fields (`op`, `open` / `sep` / `close`, `char`, `pos`) and keeps the others (`m:ctrlPr`, `m:type`, `m:degHide`, `m:grow`, `m:subHide` …) verbatim in `_prExtras` — an empty array for a present, empty element — written after the typed ones. A character with an empty value (`m:begChr m:val=""`, no delimiter) reads as `''`. A math run keeps its `m:rPr` children other than `m:sty` (`m:lit`, `m:nor` …) in `rPr._extras` and its `w:rPr` in `_extras`; an `oMathPara` keeps its `m:oMathParaPr` in `_extras`.
- The `xml:space="preserve"` attribute is set on `<m:t>` so significant whitespace survives the round-trip.

## See also

- [drawingml](./drawingml/drawingml.md) — also accepts math inside text bodies.
- [docx-structure](./docx/structure.md) — `oMathPara` inside the docx body.
- [ooxmlErrors](./errors.md) — `math/unknown-node-type` is raised by the renderer.
