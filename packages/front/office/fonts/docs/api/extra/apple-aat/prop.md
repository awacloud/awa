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

**Module** `aatProp` | **Source** `packages/front/office/fonts/src/extra/apple-aat/prop.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Per-glyph properties (directionality, floating accent, hanging) — either a global default (`format=0`) or an AAT lookup (`format=1`). **The AAT lookup itself (formats 0/2/4/6/8/10) is never decoded** — `format=1` only reads the lookup table's 2-byte `lookupFormat` header and keeps the rest as raw bytes; `lookup(gid)` always returns `defaultProps` for every glyph, regardless of format. This is the module's explicit state-machine-deferred stub — see `reason` below.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `PROP_BITS` | const | `{ DIRECTION_MASK, IS_FLOATER, HANGS_OFF_LEFT, HANGS_OFF_RIGHT, USES_COMPLEX_OT, ATTACHING }` bit masks for the 16-bit per-glyph property word (`prop.js` lines 20–27). |
| `parseProp` | function | `(bytes) => { version, format, defaultProps, lookup }` for `format=0`; `{ version, format, defaultProps, lookupFormat, lookupBytes, parsed: false, reason: 'aat-state-machine-deferred', lookup }` for `format=1`. The `lookup` function (always present, both formats) and, for `format=1`, `lookupFormat`/`parsed`/`reason` were missing from a previous revision of this page (`prop.js` lines 32–77). |
| `aatProp` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseProp, PROP_BITS } = fw.runtime.resolve('aatProp');
const prop = parseProp(sfnt.tables.prop.bytes);
prop.lookup(glyphId); // always defaultProps today, even for format=1
```

## Notes

- Fixed versions 1.0 / 2.0 / 3.0 are accepted.
- `format=1`'s returned object explicitly signals its stub-ness via `parsed: false, reason: 'aat-state-machine-deferred'` — the one AAT module in this directory that documents the deferral this way at runtime (contrast `ankr`/`lcar`, which give no signal — see [`./README.md`](./README.md)).
- Requires the `fonts-apple-aat` bundle.

## See also

- [morx](./morx.md) [feat](./feat.md)
