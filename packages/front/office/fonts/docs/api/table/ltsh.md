---
module: tableLtsh
category: table/ltsh
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# tableLtsh

> Table `LTSH` — per-glyph Linear Threshold (OT §6.4.21).

**Module** `tableLtsh` | **Source** `packages/front/office/fonts/src/table/ltsh.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

For each glyph, the ppem above which the advance width becomes strictly linear (deviation = 0 relative to the upem/1000-scaled value).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseLtsh` | function | `(bytes) => { version, numGlyphs, yPels: Uint8Array }`. |
| `tableLtsh` | factory | Factory `{ name, dependencies, factory }`. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseLtsh } = fw.runtime.resolve('tableLtsh');
const ltsh = parseLtsh(sfnt.tables.LTSH.bytes);
console.log(ltsh.yPels[10]); // ppem threshold for gid 10
```

## Notes

- `yPels` is a `Uint8Array` (independent copy of the source buffer).
- Throws `fonts/ltsh-truncated` if the payload is shorter than `4 + numGlyphs`.

## See also

- [hdmx](./hdmx.md) — companion table
