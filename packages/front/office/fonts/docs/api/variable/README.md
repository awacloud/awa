# Variable — OpenType variable-font helpers

Axis coordinate normalisation, `gvar` tuple arithmetic, the item variation store and a `glyf` glyph at coordinates. They work on the output of [fvar](../table/fvar.md), [avar](../table/avar.md), [gvar](../table/gvar.md) and [hvar](../table/hvar.md).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [coordsConvert](./coordsConvert.md) | `{ normaliseAxisValue, normaliseAxesCoords }` | `tableAvar` | User-space axis values to the normalised `[-1, +1]` space, with optional `avar` remapping. |
| [instance](./instance.md) | `{ axisScalar, tupleScalar, applyGvarDeltas }` | `fontErrors` | Tuple scalars and application of decoded `gvar` deltas to glyph points. |
| [itemVariationStore](./itemVariationStore.md) | `{ parseItemVariationStore, parseDeltaSetIndexMap }` | `fontErrors` | The item variation store and the delta-set index map. |
| [instantiate](./instantiate.md) | `{ instantiate }` | `fontSfnt`, the table encoders, `varGlyph`, `varItemStore`, `tableMvar` | A static TrueType font at variation coordinates. |
| [glyph](./glyph.md) | `{ glyphAt, normalise, variations }` | `fontErrors`, the variation tables, `varCoordsConvert`, `varInstance`, `varItemStore`, `fontCompositeResolve` | A `glyf` glyph's outline and advance at variation coordinates. |
