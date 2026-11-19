---
module: fontType1Charstring
category: type1/charstring
dependencies: [fontErrors, encodingStandard]
returns: object
worker-safe: true
status: complete
---

# fontType1Charstring

> Type 1 charstrings: decryption and drawing.

**Module** `fontType1Charstring` | **Source** `packages/front/office/fonts/src/type1/charstring.js` | **Deps** `fontErrors`, `encodingStandard` | **Worker-safe** yes

The interpreter behind [type1](./type1.md)'s `glyph(name)` (*Adobe Type 1 Font Format*, ch. 6–8).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `decrypt` | function | `(bytes, key, skip) => Uint8Array`: the plain bytes of an encrypted run (key 55665 for eexec, 4330 for a charstring), the first `skip` dropped. |
| `draw` | function | `(charstring, { subrs, glyph }) => { advanceWidth, leftSideBearing, path }`: a decrypted charstring run. `subrs` are the decrypted subroutines; `glyph(name)` gives a glyph's decrypted charstring or `null` (for `seac`). |
| `fontType1Charstring` | factory | Factory. |

## Notes

- **Path**: the commands `{ type: 'M' | 'L' | 'C', x, y, … }` and `{ type: 'Z' }`, in character space, as the other outline modules write them.
- `hsbw` and `sbw` set the side bearing point (the current point) and the advance.
- `rmoveto`, `hmoveto`, `vmoveto` start a subpath (`M`). A line or curve with no open subpath starts one at the current point. `closepath` closes it (`Z`) and keeps the current point.
- **`callothersubr`** hands its arguments to a PostScript operand stack, which `pop` reads back:
  - **1, 2, 0** — flex: the seven points the moves reach between `1` and `0` are drawn as two curves, and the final point is handed back for `setcurrentpoint`;
  - **3** — hint replacement: hands back its subroutine number;
  - **any other number** — hands its arguments back in order.
- **`seac`** draws the base and the accent by `StandardEncoding` through `glyph(name)`. The accent is moved by `adx − asb` plus the composite's side bearing; a `seac` inside a `seac` throws.
- `div` divides. The hints (`hstem`, `vstem`, `hstem3`, `vstem3`, `dotsection`) are read and ignored.
- **Errors** (`ParseError`): subroutines nested past 10 levels, or a charstring past 65,536 operators, throw `fonts/type1-charstring-budget`. A call to a subroutine the font lacks throws `fonts/type1-missing-subr`.

## See also

- [type1](./type1.md) · [table/cff](../table/cff.md) (Type 2 charstrings)
