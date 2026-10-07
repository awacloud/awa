---
module: wmlRunFormatting
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# wmlRunFormatting

> WML — typed run-property fields for the long-tail `<w:rPr>` elements.

**Module** `wmlRunFormatting` | **Source** `packages/front/office/ooxml/src/extra/wml-run-formatting.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Promotes ~30 rarely-used `<w:rPr>` children (caps, kern, position, lang, shd, fitText, eastAsianLayout, stylisticSets, …) from the core `_extras` fallback into typed fields on the run-properties bag — when the extra is registered with `docx.use()`, the children it promotes are rendered back on write, and those it does not type stay in `_extras`.

## Resolve

```js
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';
const ext = wmlRunFormatting.factory(xml, props);
// or via runtime: runtime.resolve('wmlRunFormatting')
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseRunProperties` | `(rPrEl) => RunProperties` | bag with typed fields |
| `renderRunProperties` | `(rPr) => xmlNode \| null` | `<w:rPr>` element |
| `parseParagraphProperties` | `(pPrEl) => ParagraphProperties` | wraps inline `rPr` too |
| `renderParagraphProperties` | `(pPr) => xmlNode \| null` | idem |
| `hydrate` / `hydrateRunProperties` | `(rPr) => rPr` | promote `_extras` → typed |
| `dehydrate` / `dehydrateRunProperties` | `(rPr) => rPr` | typed → `_extras` |
| `readToggle` / `writeToggle` / `valOf` / `elVal` | (re-export of core helpers) | — |

## Hooks (used by `docx.use(...)`)

| Hook | Triggered on |
|------|--------------|
| `hydrateRunProperties` | every `<w:rPr>` after `read()` |
| `dehydrateRunProperties` | every `<w:rPr>` before `write()` |

## Elements typed

`caps`, `smallCaps`, `vanish`, `specVanish`, `kern`, `position`, `outline`, `emboss`, `imprint`, `shadow`, `shd`, `noProof`, `lang`, `cs`, `bCs`, `iCs`, `szCs`, `w` (→ `scale`), `dstrike`, `fitText`, `eastAsianLayout`, `oMath`, `em`, `effect`, `ligatures`, `numForm`, `numSpacing`, `stylisticSets`, `cntxtAlts`, `webHidden`, `snapToGrid`.

## Roundtrip example

```js
import { xml as xmlMod } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '@awacloud/ooxml';
import { wmlRunFormatting } from '@awacloud/ooxml/extra/wml-run-formatting';

const xml   = xmlMod.factory();
const core  = docxProperties.factory(xml);
const ext   = wmlRunFormatting.factory(xml, core);

const rPrEl = xml.parse('<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:caps/><w:kern w:val="22"/><w:lang w:val="en-US"/></w:rPr>');
const rPr   = ext.parseRunProperties(rPrEl);
// → { caps: true, kern: 22, lang: { val: 'en-US' } }

const out = ext.renderRunProperties(rPr);
// xml.serialize(out) yields the same three children.
```

## Notes

- Toggles encode `false` as `<w:caps w:val="0"/>` per ECMA-376.
- Unknown children stay in `_extras`; ordering relative to typed siblings is not preserved (Word reorders silently).
- The `w:w` element is exposed as `scale` to avoid collision with the namespace prefix.

## See also

- [docxProperties](../docx/properties.md) — base parser this extension wraps
- [Read+write docx guide](../../guide/read-write-docx.md)
- [docx-large bundle](../bundles/docx-large.md)
