---
module: tableFvar
category: table/fvar
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# tableFvar

> Table `fvar` — Font Variations (OT §10.6.2).

**Module** `tableFvar` | **Source** `packages/front/office/fonts/src/table/fvar.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Declares the variation axes (`wght`, `wdth`, `opsz`, `slnt`, `ital`, + customs) with their `[min, default, max]` bbox in Fixed, and the named instances (per-axis coordinates).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseFvar` | function | `(bytes) => { majorVersion, minorVersion, axes: Axis[], instances: Instance[] }`. |
| `tableFvar` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseFvar } = fw.runtime.resolve('tableFvar');
const fvar = parseFvar(sfnt.tables.fvar.bytes);
console.log(fvar.axes.map(a => a.tag)); // ['wght','wdth',…]
```

## Notes

- `instances[i].postScriptNameID` is optional (present when `instanceSize > 4 + 4*axisCount`).
- Coordinates in Fixed 16.16; values outside `[min,max]` are clamped by instantiation.

## See also

- [avar](./avar.md) — non-linear remapping
- [gvar](./gvar.md) — per-glyph deltas
- [stat](./stat.md)
