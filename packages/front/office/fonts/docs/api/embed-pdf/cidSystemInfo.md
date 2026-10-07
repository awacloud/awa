---
module: embedCidSystemInfo
category: embed-pdf/cidSystemInfo
dependencies: []
returns: object
worker-safe: true
status: complete
---

# embedCidSystemInfo

> CIDSystemInfo PDF dict for Type0 fonts — `buildCidSystemInfo(font)`.

**Module** `embedCidSystemInfo` | **Source** `packages/front/office/fonts/src/embed-pdf/cidSystemInfo.js` | **Deps** none | **Worker-safe** yes

Returns `{ Registry, Ordering, Supplement }`. Defaults to Adobe/Identity/0; a heuristic based on `OS/2.ulCodePageRange1` selects a CJK ordering (Japan1, GB1, CNS1, Korea1).

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `buildCidSystemInfo` | function | `(font) => { Registry, Ordering, Supplement }`. |
| `embedCidSystemInfo` | factory | Factory. |

## Usage

```js
import { embedCidSystemInfo } from '@awacloud/fonts';
const { buildCidSystemInfo } = embedCidSystemInfo.factory();
const info = buildCidSystemInfo(font); // { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 }
```

## Notes

- CJK heuristic: OS/2 code-page bits 31/30/29/28 → Japan1/GB1/Korea1/CNS1, with Supplement 6/5/2/5 respectively.
- Identity can always be used when the PDF relies on ToUnicode instead of CID ordering.

## See also

- [subsetForPdf](./subsetForPdf.md)
