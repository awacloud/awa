---
module: extraJstf
category: extra/jstf
dependencies: [fontErrors, fontReader, fontTag]
returns: object
worker-safe: true
status: complete
---

# extraJstf

> Table `JSTF` — OpenType Justification.

**Module** `extraJstf` | **Source** `packages/front/office/fonts/src/extra/jstf.js` | **Deps** `fontErrors`, `fontReader`, `fontTag` | **Worker-safe** yes

Decodes the JSTF header + script records. Each `JstfScript` sub-table (extender glyphs + `JstfLangSys` priority lists) is exposed by offset/bytes.

## Exports

| Symbol | Type | Description |
|--------|------|-------------|
| `parseJstf` | function | `(bytes) => { majorVersion, minorVersion, scriptCount, scriptRecords, scripts }`. Each `scripts[i]` is `{ tag, tagStr, offset, extenderGlyphOffset, defaultLangSysOffset, langSysCount, langSysRecords }` — not `{ jstfScriptTag, jstfScriptOffset }` (`jstf.js` lines 56–67, `readJstfScript` lines 70–105). |
| `extraJstf` | factory | Factory. |

## Usage

```js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/fonts';

for (const m of [...fw_require, ...modules, ...extras]) fw.runtime.register(m);
const { parseJstf } = fw.runtime.resolve('extraJstf');
const jstf = parseJstf(sfnt.tables.JSTF.bytes);
```

## Notes

- `JstfScript` / `JstfLangSys` / `JstfPriority` bodies are left as `Uint8Array` for deferred decoding.
- Included in `fonts-large`.

## See also

- [extra/math](./math.md) [table/gsub](../table/gsub.md) [table/gpos](../table/gpos.md)
