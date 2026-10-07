---
module: tableVorg
category: table/vorg
dependencies: [fontErrors, fontReader, fontWriter]
returns: object
worker-safe: true
status: complete
---

# tableVorg

> Table `VORG` — Vertical Origin (OT §6.4.22).

**Module** `tableVorg` | **Source** `packages/front/office/fonts/src/table/vorg.js` | **Deps** `fontErrors`, `fontReader`, `fontWriter` | **Worker-safe** yes

Gives the per-glyph y-coordinate of the vertical origin for CFF-flavored fonts. A default value applies to every glyph without an explicit entry.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseVorg` | function | `(bytes: Uint8Array) => { majorVersion, minorVersion, defaultVertOriginY, metrics, map, verticalOrigin }`. `metrics` is `Array<{ glyphIndex, vertOriginY }>`, `map` is a `Map<glyphIndex, vertOriginY>` and `verticalOrigin(gid)` returns the explicit entry or `defaultVertOriginY`. |
| `encodeVorg` | function | `(vorg: { majorVersion?, minorVersion?, defaultVertOriginY?, metrics? }) => Uint8Array`. Writes `8 + 4 * metrics.length` bytes. |
| `tableVorg` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseSfnt } = fw.runtime.resolve('fontSfnt');
const { parseVorg, encodeVorg } = fw.runtime.resolve('tableVorg');

const sfnt = parseSfnt(bytes);   // bytes: Uint8Array of a font with a VORG table
const vorg = parseVorg(sfnt.tables.VORG.bytes);
console.log(vorg.verticalOrigin(42));   // explicit entry for glyph 42, else the default
const out = encodeVorg(vorg);
```

## Notes

- `verticalOrigin(gid)` is a pure lookup: it does not validate `gid` against the font's glyph count.
- `encodeVorg` defaults: `majorVersion` 1, `minorVersion` 0, `defaultVertOriginY` 0, `metrics` empty. It writes the entries in the order given and does not sort them or remove duplicates; the OpenType specification requires ascending glyph index.
- Errors (all `ParseError`): `fonts/vorg-short` (fewer than 8 bytes), `fonts/vorg-version` (major version is not 1).

## See also

- [vhea](./vhea.md) — vertical header
- [vmtx](./vmtx.md) — vertical metrics
- [cff](./cff.md) — the outlines `VORG` accompanies
