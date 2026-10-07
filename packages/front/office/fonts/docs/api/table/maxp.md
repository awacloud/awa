---
module: tableMaxp
category: table/maxp
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableMaxp

> Table `maxp` — Maximum Profile (OT §6.4.6).

**Module** `tableMaxp` | **Source** `packages/front/office/fonts/src/table/maxp.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Two versions:

- **v0.5** (`0x00005000`) — 6 bytes: `version + numGlyphs`. Used by CFF fonts.
- **v1.0** (`0x00010000`) — 32 bytes: v0.5 + 13 TrueType maxima (`maxPoints`, `maxContours`, `maxCompositePoints`, …).

## Resolve

```js
const { parseMaxp, encodeMaxp, MAXP_V0_5, MAXP_V1_0 } = runtime.resolve('tableMaxp');
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseMaxp` | `(bytes: Uint8Array) => MaxpTable` | Throws on unknown version or insufficient size. |
| `encodeMaxp` | `(maxp: MaxpTable) => Uint8Array` | Emits 6 bytes in v0.5, 32 in v1.0. |
| `MAXP_V0_5` | `number` | `0x00005000`. |
| `MAXP_V1_0` | `number` | `0x00010000`. |

### `MaxpTable`

`version: number`, `numGlyphs: number`, plus in v1.0: `maxPoints`, `maxContours`, `maxCompositePoints`, `maxCompositeContours`, `maxZones`, `maxTwilightPoints`, `maxStorage`, `maxFunctionDefs`, `maxInstructionDefs`, `maxStackElements`, `maxSizeOfInstructions`, `maxComponentElements`, `maxComponentDepth`.

## Examples

```js
const { parseMaxp, MAXP_V1_0 } = runtime.resolve('tableMaxp');
const maxp = parseMaxp(sfnt.tables.maxp.bytes);
if (maxp.version === MAXP_V1_0) console.log(maxp.maxPoints);
```

## Notes

- In v1.0, the 13 maxima fields are not verified against `glyf`'s actual maxima — that check is left to the caller (subset / build tools).
- `numGlyphs` is capped at `0xFFFF` (the OT uint16 ceiling); exceeding it throws `ParseError('fonts/maxp-numglyphs-cap')`.
- Any version outside {v0.5, v1.0} throws `ParseError('fonts/maxp-version')`.

## See also

- [head](./head.md)
- [glyf](./glyf.md) — bounds the maxima values
