---
category: embed-pdf/index
status: complete
---

# embed-pdf — section index

> Overview of the four PDF-facing embed-pdf helpers. This page is a plain section index, not a module page.

**Prerequisites**: `@awacloud/fonts` and an `@awacloud/fw` runtime; a font already read with `fonts.read(bytes)` (see [fonts](../fonts.md)).

There is no `embed-pdf` barrel module and no bare `@awacloud/fonts/embed-pdf` sub-path: each helper is its own module with its own sub-path export (plus the `subsetForPdf/*` internal sub-modules). Nothing is imported from this page.

## Helpers

| Helper | Sub-path | Resolved name | Returns |
|--------|----------|---------------|---------|
| [subsetForPdf](./subsetForPdf.md) | `@awacloud/fonts/embed-pdf/subsetForPdf` | `embedSubsetForPdf` | `{ subsetForPdf }` — subsets a TrueType font. |
| [fontDescriptor](./fontDescriptor.md) | `@awacloud/fonts/embed-pdf/fontDescriptor` | `embedFontDescriptor` | `{ buildFontDescriptor, PDF_FONT_FLAG }` — FontDescriptor dictionary. |
| [cidSystemInfo](./cidSystemInfo.md) | `@awacloud/fonts/embed-pdf/cidSystemInfo` | `embedCidSystemInfo` | `{ buildCidSystemInfo }` — CIDSystemInfo dictionary. |
| [toUnicodeBuilder](./toUnicodeBuilder.md) | `@awacloud/fonts/embed-pdf/toUnicodeBuilder` | `embedToUnicodeBuilder` | `{ embedBuildToUnicode }` — ToUnicode CMap stream. |

## Usage

Every helper is a descriptor of the package manifest: register `fw_require` and `modules`, then resolve the helper by name. `embedSubsetForPdf`'s four sub-modules (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash`) are in `modules` too, so nothing else needs registering.

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { buildFontDescriptor } = fw.runtime.resolve('embedFontDescriptor');
const { buildCidSystemInfo } = fw.runtime.resolve('embedCidSystemInfo');
const { embedBuildToUnicode } = fw.runtime.resolve('embedToUnicodeBuilder');
```

## Notes

- Import only the helper(s) you need: since no barrel exists, nothing is gained from a combined entry point.
- The four helper descriptors and the four `subsetForPdf` sub-modules are all part of the package's `modules` array. No bundle is required to use them.

## See also

- [subsetForPdf](./subsetForPdf.md) [fontDescriptor](./fontDescriptor.md) [cidSystemInfo](./cidSystemInfo.md) [toUnicodeBuilder](./toUnicodeBuilder.md)
