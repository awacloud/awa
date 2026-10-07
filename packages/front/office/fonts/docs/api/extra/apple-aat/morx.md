---
module: aatMorx
category: extra/apple-aat/morx
dependencies: [fontErrors, fontReader]
returns: object
worker-safe: true
status: complete
---

# aatMorx

> Table `morx` — Extended Glyph Metamorphosis (Apple TT RM06).

**Module** `aatMorx` | **Source** `packages/front/office/fonts/src/extra/apple-aat/morx.js` | **Deps** `fontErrors`, `fontReader` | **Worker-safe** yes

Parses the structural envelope: header, chain headers, feature table, subtable directory. State-machine bodies are kept as `Uint8Array` — their decoding is deferred.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseMorx` | function | `(bytes) => { version, nChains, chains }`. Each `chains[i]` is `{ defaultFlags, chainLength, features, subtables }`, `features[i]` is `{ featureType, featureSetting, enableFlags, disableFlags }`, and `subtables[i]` is `{ length, coverage, type, vertical, descending, bothOrientations, logicalOrder, subFeatureFlags, body: Uint8Array, parsed: false }` (`morx.js` lines 48–122; not documented on a previous revision of this page). |
| `aatMorx` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseMorx } = fw.runtime.resolve('aatMorx');
const morx = parseMorx(sfnt.tables.morx.bytes);
```

## Notes

- Subtable `type` values (from `coverage & 0xFF`): 0 rearrangement / 1 contextual / 2 ligature / 4 noncontextual / 5 insertion.
- Every subtable carries `parsed: false` — the state machine itself is never executed by this module.
- Requires the `fonts-apple-aat` bundle.

## See also

- [kerx](./kerx.md) [feat](./feat.md)
