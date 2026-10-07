---
module: embedToUnicodeBuilder
category: embed-pdf/toUnicodeBuilder
dependencies: [cmapToUnicode]
returns: object
worker-safe: true
status: complete
---

# embedToUnicodeBuilder

> `embedBuildToUnicode(gidToUnicode, opts)` wrapper around `cmapToUnicode.buildToUnicode`.

**Module** `embedToUnicodeBuilder` | **Source** `packages/front/office/fonts/src/embed-pdf/toUnicodeBuilder.js` | **Deps** `cmapToUnicode` | **Worker-safe** yes

Thin adapter for the embed-pdf API — accepts directly the `Map<gid, unicodeString>` produced by `subsetForPdf`.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `embedBuildToUnicode` | function | `(gidToUnicode: Map, opts?) => string` (PDF stream). |
| `embedToUnicodeBuilder` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules]) fw.runtime.register(m);
const { embedBuildToUnicode } = fw.runtime.resolve('embedToUnicodeBuilder');
const stream = embedBuildToUnicode(subset.glyphMap);
```

## Notes

- No logic of its own — pure delegation to `cmapToUnicode.buildToUnicode`.
- Exists as a convenience wrapper for the embed-pdf API's ergonomics.

## See also

- [../cmap/toUnicode](../cmap/toUnicode.md) [subsetForPdf](./subsetForPdf.md)
