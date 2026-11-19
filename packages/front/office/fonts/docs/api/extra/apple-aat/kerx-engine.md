---
module: aatKerxEngine
category: extra/apple-aat/kerx-engine
dependencies: []
returns: object
worker-safe: true
status: complete
---

# aatKerxEngine

> The `kerx` and `kern` engine: a parsed `kerx` or `kern` table applied to a positioned glyph run, as HarfBuzz applies them.

**Module** `aatKerxEngine` | **Source** `packages/front/office/fonts/src/extra/apple-aat/kerx-engine.js` | **Deps** none | **Worker-safe** yes

`applyKerx(kerx, glyphs, opts?)` takes a [`parseKerx`](./kerx.md) result, `applyKern(kern, glyphs, opts?)` a [`parseKern`](../../table/kern.md) result; both take `[{ glyph, xAdvance, yAdvance, xOffset, yOffset, attach }]` in logical order, change the positions in place and return `{ truncated }`. [`fontShaper`](../shaper.md) calls them when it chooses `kerx` or `kern` for the positioning.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `applyKerx` | function | `(kerx, glyphs, opts?) => { truncated }`. |
| `applyKern` | function | `(kern, glyphs, opts?) => { truncated }`: the horizontal format 0 subtables. |
| `aatKerxEngine` | factory | Factory. |

## Options

| Option | Default | Effect |
|---|---|---|
| `direction` | `'ltr'` | `'rtl'` for right-to-left text: it orders a subtable's processing. |
| `kern` | `true` | `false` turns off the pair machine and format 1 (not format 4's attachments). |
| `isMark` | none | `(glyph) => boolean`: the glyphs the pair machine steps over. |
| `point` | none | `(glyph, index) => { x, y } \| null`: a glyph's outline point, for format 4's control-point actions. |
| `anchors` | none | `(glyph) => [{ x, y }]`: a glyph's anchors, for format 4's anchor actions. |
| `state` | a fresh one | `{ budget, truncated }`, shared with the caller. |

## Notes

- **Subtables** run in order; a vertical one, or one that did not decode, is skipped. The run is reversed for a subtable, and restored after, when its backwards bit (`kerx` `0x10000000`; `kern` has none) differs from right-to-left text.
- **Cross-stream**: at the first cross-stream subtable every glyph is chained to the one before it (`attach: { to, kind: 'cursive' }`), so that y offsets add up along the run.
- **The pair machine** (`kern` format 0, `kerx` formats 0, 2 and 6): from each glyph to the next that is not a mark, the pair's value is added to the first glyph's advance; a cross-stream subtable sets the second glyph's y offset instead.
- **`kerx` format 1**: push (`0x8000`) the current glyph on a stack of 8 (a push on a full stack clears it), reset (`0x2000`) the stack. An action (an index other than `0xFFFF`) needs one value per glyph on the stack (times the tuple count), else it clears the stack; it pops glyphs, each taking its value on its advance and x offset (cross-stream: on its y offset when it is chained; `-0x8000` unchains it), an odd value ending the list.
- **`kerx` format 4**: mark (`0x8000`) records the current glyph; an action at a later glyph sets that glyph's offset to the mark's point minus its own and attaches it to the mark (`attach: { to, kind: 'mark' }`). Its points are control points (`point`), anchors (`anchors`, `{ x: 0, y: 0 }` when absent) or the coordinates in the action's data.
- **Attachments** end as glyph indices of the run; the caller adds the base's offset and the advances in between, as after GPOS.
- **Budget**: a step of a state table that does not advance spends one unit; past the budget the driver advances anyway and `truncated` is `true`.

## See also

- [kerx](./kerx.md) [ankr](./ankr.md) [`tableKern`](../../table/kern.md) [`fontShaper`](../shaper.md)
