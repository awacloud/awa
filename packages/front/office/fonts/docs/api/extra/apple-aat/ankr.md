---
module: aatAnkr
category: extra/apple-aat/ankr
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatAnkr

> Table `ankr` — Anchor Points (Apple TT RM06).

**Module** `aatAnkr` | **Source** `packages/front/office/fonts/src/extra/apple-aat/ankr.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Per-glyph anchor coordinates that `kerx` format 4 references. Header + lookup table (only its 2-byte `lookupFormat` is read — the AAT lookup formats 0/2/4/6/8/10 themselves are **not decoded**, no `gid → block offset` resolution ships) + glyph data blocks.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseAnkr` | function | `(bytes) => { version, flags, lookupTableOffset, glyphDataTableOffset, lookupFormat, lookupBytes, glyphDataBytes }` — `lookupFormat` (the lookup table's first uint16) was missing from a previous revision of this page (`ankr.js` lines 70–80). |
| `readAnchorBlock` | function | `(glyphDataBytes, offset) => Array<{x,y}>` — a plain array, **not** `{ numAnchors, anchors }` (`ankr.js` lines 86–98: `return out;`, where `out` is the anchor array itself). |
| `aatAnkr` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseAnkr, readAnchorBlock } = fw.runtime.resolve('aatAnkr');
const ankr = parseAnkr(sfnt.tables.ankr.bytes);
```

## Notes

- No `parsed`/`reason` field signals the stub-ness of the AAT lookup decode — see [`./README.md`](./README.md). A consumer must not assume `parseAnkr`'s `lookupBytes` can be resolved from `gid` to a glyph-data-block offset today.
- Requires the `fonts-apple-aat` bundle.

## See also

- [kerx](./kerx.md) [lcar](./lcar.md)
