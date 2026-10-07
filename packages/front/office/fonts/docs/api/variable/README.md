# Variable — OpenType variable-font helpers

Axis coordinate normalisation and `gvar` tuple arithmetic for variable fonts. These modules do not parse tables themselves; they work on the output of [fvar](../table/fvar.md), [avar](../table/avar.md) and [gvar](../table/gvar.md).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [coordsConvert](./coordsConvert.md) | `{ normaliseAxisValue, normaliseAxesCoords }` | `tableAvar` | User-space axis values to the normalised `[-1, +1]` space, with optional `avar` remapping. |
| [instance](./instance.md) | `{ axisScalar, tupleScalar, applyGvarDeltas }` | `fontErrors` | Tuple scalars and application of decoded `gvar` deltas to glyph points. |
