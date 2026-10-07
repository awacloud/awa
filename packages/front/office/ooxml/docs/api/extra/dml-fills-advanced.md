---
module: dmlFillsAdvanced
category: extra
dependencies: [xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# dmlFillsAdvanced

> DML — advanced fills: gradient, blip (image), pattern.

**Module** `dmlFillsAdvanced` | **Source** `packages/front/office/ooxml/src/extra/dml-fills-advanced.js` | **Deps** `xml`, `ooxmlShared` | **Worker-safe** yes

Provides typed parse/render for the three DrawingML fill kinds beyond the simple `solidFill` / `noFill` already handled by core. The color codec is delegated to `ooxmlShared.createDmlColorCodec` with `withMods: false` (flat `<a:gs>` / `<a:fgClr>` / `<a:bgClr>` colors keep no color-transform children — those are tracked by [dml-effects](./dml-effects.md) when needed).

## Resolve

```js
const ext = dmlFillsAdvanced.factory(xml, ooxmlShared);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `parseAny` | `(el) => *` | dispatches by element name across every entry below |
| `parseGradFill` / `renderGradFill` | — | `<a:gradFill>` with stops + path/lin |
| `parseBlipFill` / `renderBlipFill` | — | `<a:blipFill>` with embed rId, tile/stretch |
| `parsePattFill` / `renderPattFill` | — | `<a:pattFill>` with fg/bg |
| `parseColor` / `renderColor` | — | typed color tree (srgb / scheme / sys / hsl / scrgb / prst), no mods |
| `COLOR_TAGS` | — | tag list re-exported from the shared color codec |

There is no `grpFill` support in this module — `<a:grpFill>` (inherit-from-group) is not typed by any `extra/` module today.

## Elements typed

`gradFill`, `gsLst`, `gs`, `lin`, `path`, `tileRect`, `srcRect`, `fillToRect`, `blipFill`, `blip`, `tile`, `stretch`, `fillRect`, `pattFill`, `fgClr`, `bgClr`, `srgbClr`, `schemeClr`, `prstClr`, `hslClr`, `scrgbClr`, `sysClr`.

## Notes

- The `embed` attribute on `<a:blip>` is a relationship id — pair this module with [docx-large](../bundles/docx-large.md) so the `media/image*` parts resolve.
- Linear gradient angles use 60000ths of a degree (e.g. `5400000` = 90°).

## See also

- [dml-effects](./dml-effects.md)
- [dml-shapes-advanced](./dml-shapes-advanced.md)
