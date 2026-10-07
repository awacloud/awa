---
module: tableStat
category: table/stat
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# tableStat

> Table `STAT` — Style Attributes (OT §10.6.4).

**Module** `tableStat` | **Source** `packages/front/office/fonts/src/table/stat.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Describes a variable font's design axes and named values (e.g. `wght=400 → "Regular"`). Bridges `fvar` instances and a style picker.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseStat` | function | `(bytes) => { majorVersion, minorVersion, designAxes, axisValues, elidedFallbackNameID }`. |
| `tableStat` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseStat } = fw.runtime.resolve('tableStat');
const stat = parseStat(sfnt.tables.STAT.bytes);
```

## Notes

- Versions 1.1 and 1.2 supported (axis-value formats 1..4).
- `elidedFallbackNameID` points to a `name` entry (the style to omit when every axis sits at its elided value).

## See also

- [fvar](./fvar.md) [avar](./avar.md)
- [name](./name.md)
