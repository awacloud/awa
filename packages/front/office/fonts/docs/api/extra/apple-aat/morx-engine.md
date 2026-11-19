---
module: aatMorxEngine
category: extra/apple-aat/morx-engine
dependencies: []
returns: object
worker-safe: true
status: complete
---

# aatMorxEngine

> The `morx` engine: a parsed `morx` table applied to a glyph run, as HarfBuzz's AAT layout applies it.

**Module** `aatMorxEngine` | **Source** `packages/front/office/fonts/src/extra/apple-aat/morx-engine.js` | **Deps** none | **Worker-safe** yes

`applyMorx(morx, glyphs, opts?)` takes a [`parseMorx`](./morx.md) result and `[{ glyph, cluster }]` in logical order, and returns `{ glyphs, truncated }`. [`fontShaper`](../shaper.md) calls it for a font with `morx` and no GSUB.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `applyMorx` | function | `(morx, glyphs, opts?) => { glyphs, truncated }`. |
| `chainFlags` | function | `(chain, features) => flags`: a chain's flags under the requested feature settings. |
| `aatMorxEngine` | factory | Factory. |

## Options

| Option | Default | Effect |
|---|---|---|
| `features` | `[]` | `[{ type, setting }]`: the AAT feature settings requested. |
| `direction` | `'ltr'` | `'rtl'` for right-to-left text: it orders a layout-order subtable's processing. |
| `state` | a fresh one | `{ budget, truncated }`, shared with the caller (`fontShaper` passes its own). |

## Notes

- **Flags**: each chain starts from its default flags; each requested setting applies `(flags & disableFlags) | enableFlags` of every feature entry with that type and setting, in the entries' order.
- **Subtables**: a decoded one runs when its `subFeatureFlags` meet the flags and it applies to horizontal text (the vertical bit clear, or the both-orientations bit set). The run is reversed for it and restored after as HarfBuzz reads the coverage bits: with the logical-order bit, when the descending bit is set; without it, when the descending bit differs from right-to-left text.
- **The driver** starts in state 0, reads each glyph's class (end of text past the last glyph), takes the entry, runs its action, then moves on unless the entry's don't-advance flag (`0x4000`) is set.
- **Type 0, rearrangement**: mark first (`0x8000`), mark last (`0x2000`), and the 16 verbs (Ax ⇒ xA to ABxCD ⇒ DCxBA) on a range of at most 64 glyphs; the range's clusters merge.
- **Type 1, contextual**: the marked glyph and the current glyph through their substitution lookups; set-mark (`0x8000`) marks the current glyph; at the end of text nothing is done before a mark is set.
- **Type 2, ligature**, through an output buffer (HarfBuzz's: the glyphs passed are written out, and a move to an output position rewinds or advances): set-component (`0x8000`) pushes the current output position on a stack of 64, once per position; perform-action (`0x2000`), not at the end of text and with a non-empty stack, runs the actions from the entry's index. Each action pops a component and adds `component(glyph + offset)` (its 30-bit signed offset) to the ligature index; on store (`0x40000000`) or last (`0x80000000`) it writes `ligature(index)` in place of that component, the later components become deleted glyphs and the clusters merge. Last ends the run; an empty stack clears it; a read past the body stops it.
- **Type 4, noncontextual**: every glyph through the lookup.
- **Type 5, insertion**, through the output buffer: the marked insertion (count `flags & 0x1F`, before the marked glyph with `0x0400`, else after it) and the current insertion (count `(flags & 0x3E0) >> 5`, before with `0x0800`). Set-mark records the output position the step started on; a mark never set is position 0. After a current insertion the cursor sits on the last glyph inserted, or, with don't-advance, on the current glyph again, so that the machine reads the insertion. The inserted glyphs copy the current glyph's cluster. The kashida-like flags are ignored, as HarfBuzz ignores them.
- A subtable that did not decode is skipped.
- After the last chain the deleted glyphs (`0xFFFF`) are removed.
- **Budget**: a step that does not advance spends one unit, and so does each glyph inserted; past the budget the driver advances anyway, an insertion is not made, and `truncated` is `true`.

## See also

- [morx](./morx.md) [lookup](./lookup.md) [`fontShaper`](../shaper.md)
