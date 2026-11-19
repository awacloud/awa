---
module: aatMorx
category: extra/apple-aat/morx
dependencies: [fontErrors, fontReader, aatLookup]
returns: object
worker-safe: true
status: complete
---

# aatMorx

> Table `morx` — Extended Glyph Metamorphosis (Apple TT RM06).

**Module** `aatMorx` | **Source** `packages/front/office/fonts/src/extra/apple-aat/morx.js` | **Deps** `fontErrors`, `fontReader`, `aatLookup` | **Worker-safe** yes

Parses the structural envelope (header, chain headers, feature table, subtable directory) and decodes the bodies of its five subtable types — 0 (rearrangement), 1 (contextual), 2 (ligature), 4 (noncontextual), 5 (insertion) — through [`aatLookup`](./lookup.md). [`aatMorxEngine`](./morx-engine.md) applies the decoded chains.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseMorx` | function | `(bytes, opts?) => { version, nChains, chains }`. Each `chains[i]` is `{ defaultFlags, chainLength, features, subtables }`, `features[i]` is `{ featureType, featureSetting, enableFlags, disableFlags }`, and `subtables[i]` is `{ length, coverage, type, vertical, descending, bothOrientations, logicalOrder, subFeatureFlags, body: Uint8Array, parsed }`, with the decoded fields when `parsed` is `true`: type 0 `stateTable`; type 1 `stateTable` (each entry's `data` is `[markIndex, currentIndex]`) and `substitutions` (its lookups); type 2 `stateTable` (`data` is `[ligActionIndex]`) and the readers `action(i)` (32-bit), `component(i)`, `ligature(i)`; type 4 `lookup`; type 5 `stateTable` (`data` is `[currentInsertIndex, markedInsertIndex]`) and the reader `insertion(i)`. A reader gives `null` past the body. `opts.numGlyphs` bounds a format 0 lookup. |
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
- A body that does not decode keeps `parsed: false` and gains `error`, the `ParseError` code (`fonts/aat-*`, `fonts/morx-contextual-short`, `fonts/morx-ligature-short`, `fonts/morx-insertion-short`); `parseMorx` does not throw for it. A type outside the five carries `parsed: false` and no `error`.
- This module decodes; it runs nothing — [`aatMorxEngine`](./morx-engine.md) does.
- Requires the `fonts-apple-aat` bundle.

## See also

- [lookup](./lookup.md) [morx-engine](./morx-engine.md) [kerx](./kerx.md) [feat](./feat.md)
