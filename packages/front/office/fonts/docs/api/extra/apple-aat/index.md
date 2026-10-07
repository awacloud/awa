---
module: aatBarrel
category: extra/apple-aat/index
dependencies: [aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat]
returns: object
worker-safe: true
status: complete
---

# apple-aat/index

> Barrel `@awacloud/fonts/extra/apple-aat/index` — bundles the 6 AAT factory descriptors into one array.

**Module** `aatBarrel` | **Source** `packages/front/office/fonts/src/extra/apple-aat/index.js` | **Deps** the 6 AAT modules | **Worker-safe** yes

`index.js`'s only named export is the `aatBarrel` descriptor (`module: aatIndex` on a previous revision of this page was wrong — there is no `aatIndex` descriptor). It does **not** re-export `aatMorx`/`parseMorx`/etc. individually; resolving `aatBarrel` through a `ModuleRuntime` returns a single-key object, `{ aatFactories }`, where `aatFactories` is the array of the six factory *descriptors* (`aatMorx`, `aatKerx`, `aatAnkr`, `aatProp`, `aatLcar`, `aatFeat` themselves — not their `parse*` functions) (`index.js` lines 34–41). The real `fonts-apple-aat` bundle (`bundles/fonts-apple-aat.js`) does not go through this barrel at all — it imports the six AAT modules directly and calls `fonts.use(...)` on them.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `aatBarrel` | factory | `{ name: 'aatBarrel', dependencies: [...6 names], factory(...) => { aatFactories } }`. |
| `aatFactories` | const (via resolve) | `[aatMorx, aatKerx, aatAnkr, aatProp, aatLcar, aatFeat]` — the factory descriptor objects, obtained only by resolving `aatBarrel`, not as a static export of `index.js`. |

## Usage

There is no `./extra/apple-aat` sub-path (the `./extra/*` export maps to `src/extra/*.js`, and no `apple-aat.js` file exists): import the barrel file itself.

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';
import { aatBarrel } from '@awacloud/fonts/extra/apple-aat/index';

for (const m of [...fw_require, ...modules, ...extras, aatBarrel]) fw.runtime.register(m);
const { aatFactories } = fw.runtime.resolve('aatBarrel');
```

## Notes

- Not used by the `fonts-apple-aat` bundle — see above. Its practical purpose is metaprogramming convenience for a consumer that wants the AAT factory list without hand-listing the six module files.
- AAT state-machine bodies are not decoded by these modules — see [`./README.md`](./README.md) for which modules actually signal that at runtime.

## See also

- [morx](./morx.md) [kerx](./kerx.md) [ankr](./ankr.md) [prop](./prop.md) [lcar](./lcar.md) [feat](./feat.md)
- [../../bundles/fonts-apple-aat](../../bundles/fonts-apple-aat.md)
