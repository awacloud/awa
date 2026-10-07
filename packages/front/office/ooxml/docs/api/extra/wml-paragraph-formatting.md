---
module: wmlParagraphFormatting
category: extra
dependencies: [xml, docxProperties]
returns: object
worker-safe: true
status: complete
---

# wmlParagraphFormatting

> WML — typed `<w:pPr>` fields (tabs, framePr, kinsoku, outlineLvl, cnfStyle, …).

**Module** `wmlParagraphFormatting` | **Source** `packages/front/office/ooxml/src/extra/wml-paragraph-formatting.js` | **Deps** `xml`, `docxProperties` | **Worker-safe** yes

Promotes ~25 secondary `<w:pPr>` children (tabs, framePr, suppressAutoHyphens, kinsoku flags, outlineLvl, cnfStyle, textboxTightWrap, mirrorIndents, …) from `_extras` into typed fields.

## Resolve

```js
const ext = wmlParagraphFormatting.factory(xml, props);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseParagraphProperties` | `(pPrEl) => ParagraphProperties` | typed bag |
| `renderParagraphProperties` | `(pPr) => xmlNode` | `<w:pPr>` |
| `hydrate` / `hydrateParagraphProperties` | `(pPr) => pPr` | promote |
| `dehydrate` / `dehydrateParagraphProperties` | `(pPr) => pPr` | demote |
| `parseTabs` / `renderTabs` | `(el) => Tab[]` / `(arr) => xmlNode` | tab stops |
| `parseFramePr` / `renderFramePr` | `(el) => FrameProps` / `(fp) => xmlNode` | `<w:framePr>` (w, h, hSpace, vSpace, x, y, wrap, hAnchor, vAnchor, xAlign, yAlign, hRule, anchorLock, lines, dropCap) |

## Hooks

| Hook | Triggered on |
|------|--------------|
| `hydrateParagraphProperties` | every `<w:pPr>` after `read()` |
| `dehydrateParagraphProperties` | every `<w:pPr>` before `write()` |

## Elements typed

`tabs` (+ `tab` children with `val`/`pos`/`leader`), `framePr`, `suppressAutoHyphens`, `kinsoku`, `wordWrap`, `overflowPunct`, `topLinePunct`, `autoSpaceDE`, `autoSpaceDN`, `bidi`, `adjustRightInd`, `snapToGrid`, `contextualSpacing`, `mirrorIndents`, `suppressOverlap`, `outlineLvl`, `cnfStyle`, `textboxTightWrap`, `textDirection`, `textAlignment`, `divId`.

## Roundtrip example

```js
import { xml as xmlMod } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from '@awacloud/ooxml';
import { wmlParagraphFormatting } from '@awacloud/ooxml/extra/wml-paragraph-formatting';

const xml   = xmlMod.factory();
const core  = docxProperties.factory(xml);
const ext   = wmlParagraphFormatting.factory(xml, core);

const pPrEl = xml.parse('<w:pPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:outlineLvl w:val="1"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>');
const pPr   = ext.parseParagraphProperties(pPrEl);
// → { outlineLvl: 1, tabs: [{ val: 'left', pos: 720 }] }
```

## Notes

- `tabs` is normalised to an array of `{ val, pos, leader? }`; the wrapper `<w:tabs>` is reconstructed at render.
- Numeric attributes are coerced to `Number` on parse; `String(...)` on render.

## See also

- [wml-run-formatting](./wml-run-formatting.md) — sibling for `<w:rPr>`
- [docxProperties](../docx/properties.md)
