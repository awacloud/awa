---
module: tableBase
category: table/base
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# tableBase

> Table `BASE` — Baseline Metadata (OT §6.9).

**Module** `tableBase` | **Source** `packages/front/office/fonts/src/table/base.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Per-script baseline metrics (`latn`, `cyrl`, `hani`, …). Two possible axes: horizontal and vertical. Each axis lists the baselines (`romn`, `ideo`, `hang`, …) and the per-script metrics.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseBase` | function | `(bytes) => { majorVersion, minorVersion, horizAxis?, vertAxis?, itemVarStoreOffset? }`. |
| `tableBase` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { parseBase } = fw.runtime.resolve('tableBase');
const base = parseBase(sfnt.tables.BASE.bytes);
```

## Notes

- Missing axis → `undefined` field (offset = 0).
- Version 1.1 adds `itemVarStoreOffset` (baseline variation).

## See also

- [hhea](./hhea.md) [os2](./os2.md)
