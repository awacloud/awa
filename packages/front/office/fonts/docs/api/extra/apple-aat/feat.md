---
module: aatFeat
category: extra/apple-aat/feat
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatFeat

> Table `feat` — Feature Names (Apple TT RM06).

**Module** `aatFeat` | **Source** `packages/front/office/fonts/src/extra/apple-aat/feat.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Lists AAT feature types/settings (e.g. "Letter Case → Small Caps") with a `nameIndex` into the human-readable labels.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `FEAT_FLAGS` | const | `{ EXCLUSIVE: 0x8000, DYNAMIC_DEFAULT: 0x4000, DEFAULT_MASK: 0x00FF }` — bit masks applied to each feature's `featureFlags` (`feat.js` lines 22–26). |
| `parseFeat` | function | `(bytes) => { version, featureNameCount, features }`. Each `features[i]` is `{ feature, nSettings, settingTableOffset, featureFlags, exclusive, defaultSetting, nameIndex, settings: { setting, nameIndex }[] }` — a previous revision of this page omitted the top-level `featureNameCount` and the per-feature `settingTableOffset`/`exclusive`/`defaultSetting` fields (`feat.js` lines 52–83). |
| `aatFeat` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseFeat } = fw.runtime.resolve('aatFeat');
const feat = parseFeat(sfnt.tables.feat.bytes);
```

## Notes

- Labels are resolved via the `name` table of the same font.
- This module fully parses every feature/setting record — no state-machine deferral applies here (contrast with `ankr`/`kerx`/`lcar`/`morx`/`prop`, see [`./README.md`](./README.md)).
- Requires the `fonts-apple-aat` bundle.

## See also

- [morx](./morx.md) [../../table/name](../../table/name.md)
