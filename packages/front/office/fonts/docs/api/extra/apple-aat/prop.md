---
module: aatProp
category: extra/apple-aat/prop
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatProp

> Table `prop` — Glyph Properties (Apple TT RM06).

**Module** `aatProp` | **Source** `packages/front/office/fonts/src/extra/apple-aat/prop.js` | **Deps** `fontErrors`, `fontReader`, `aatLookup` | **Worker-safe** yes

Per-glyph properties (directionality, floating accent, hanging) — either a global default (`format=0`) or an AAT lookup (`format=1`), decoded through [`aatLookup`](./lookup.md): `lookup(gid)` gives the glyph's property word, else `defaultProps`. Nothing in the package applies the properties.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `PROP_BITS` | const | `{ DIRECTION_MASK, IS_FLOATER, HANGS_OFF_LEFT, HANGS_OFF_RIGHT, USES_COMPLEX_OT, ATTACHING }` bit masks for the 16-bit per-glyph property word (`prop.js` lines 20–27). |
| `parseProp` | function | `(bytes, opts?) => { version, format, defaultProps, lookup }` for `format=0`; `{ version, format, defaultProps, lookupFormat, lookupBytes, parsed: true, lookup }` for `format=1`, or `parsed: false` with `error` (the `ParseError` code) when its lookup does not decode, every glyph then getting `defaultProps`. `opts.numGlyphs` bounds a format 0 lookup. |
| `aatProp` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseProp, PROP_BITS } = fw.runtime.resolve('aatProp');
const prop = parseProp(sfnt.tables.prop.bytes);
prop.lookup(glyphId); // the glyph's property word, else defaultProps
```

## Notes

- Fixed versions 1.0 / 2.0 / 3.0 are accepted.
- Requires the `fonts-apple-aat` bundle.

## See also

- [morx](./morx.md) [feat](./feat.md)
