---
module: wmlNumberingDetails
category: extra
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# wmlNumberingDetails

> WML — advanced `numbering.xml` details: `lvl`, `abstractNum`, `num`, `lvlOverride`, `numPicBullet`.

**Module** `wmlNumberingDetails` | **Source** `packages/front/office/ooxml/src/extra/wml-numbering-details.js` | **Deps** `xml` | **Worker-safe** yes

Provides typed parse/render for `<w:lvl>`, `<w:abstractNum>`, `<w:num>`, `<w:lvlOverride>` and `<w:numPicBullet>` and all their children.

## Resolve

```js
const ext = wmlNumberingDetails.factory(xml);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseLvl` / `renderLvl` | `(el) => Lvl` / `(l) => xmlNode` | full level (`start`, `numFmt`, `lvlText`, `lvlJc`, `nfc`, `suff`, `lvlPicBulletId`, `lvlRestart`, `pStyle`, `isLgl`, `legacy`, raw `pPr`/`rPr`) |
| `parseAbstractNum` / `renderAbstractNum` | `(el) => AbstractNum` | `<w:abstractNum>` (`nsid`, `multiLevelType`, `tmpl`, `tplc`, `name`, `styleLink`, `numStyleLink`, `lvls[]`) |
| `parseNum` / `renderNum` | `(el) => Num` | `<w:num>` (`abstractNumId`, `lvlOverrides[]`) |
| `parseLvlOverride` / `renderLvlOverride` | `(el) => LvlOverride` | `<w:lvlOverride>` (`startOverride`, `numStart`, `numRestart`, `lvl?`) — `startOverride` is a plain field here, there is no standalone `parseStartOverride` |
| `parseNumPicBullet` / `renderNumPicBullet` | `(el) => {attrs, children}` | `<w:numPicBullet>` (image bullet part) — there is no standalone `parseLvlPicBullet`; `lvlPicBulletId` is just a field on `parseLvl`'s output |
| `findChild` | `(parent, name) => xmlNode` | re-exported from `xml` |

## Elements typed

`lvl`, `abstractNum`, `num`, `lvlOverride`, `startOverride`, `numStart`, `numRestart`, `numPicBullet`, `abstractNumId`, `nsid`, `multiLevelType`, `tmpl`, `tplc`, `name`, `numStyleLink`, `styleLink`, `nfc`, `isLgl`, `suff`, `lvlPicBulletId`, `legacy`, `lvlRestart`, `pStyle`, `lvlJc`, `numFmt`, `start`, `lvlText`.

## Roundtrip example

```js
const ext = wmlNumberingDetails.factory(xml);
const lvlEl = xml.parse('<w:lvl xmlns:w="..." w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>');
const lvl = ext.parseLvl(lvlEl);
// → { attrs: {'w:ilvl':'0'}, start:'1', numFmt:'decimal', lvlText:'%1.' }
```

## Notes

- This module does not register any hook on `docx.use()`; it provides pure parse/render helpers used when manipulating the `numbering` part directly.
- Level text token escapes (`%1`, `%2`) are kept verbatim.

## See also

- [docxNumbering](../docx/numbering.md)
