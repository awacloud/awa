---
module: dmlWpDrawing
category: extra
dependencies: [xml, ooxmlShared, docxDrawing, drawingmlShape, docxStructure]
returns: object
worker-safe: true
status: complete
---

# dmlWpDrawing

> WML — a docx drawing's edits written into its kept source (`<w:drawing>`).

**Module** `dmlWpDrawing` | **Source** `packages/front/office/ooxml/src/extra/dml-wp-drawing.js` | **Deps** `xml`, `ooxmlShared`, `docxDrawing`, `drawingmlShape`, `docxStructure` | **Worker-safe** yes

`docx.read` keeps each drawing's `<w:drawing>` element (`_source`) and its typed fields as read (`_read`), and `docx.write` writes an untouched drawing from that source ([docxDrawing](../docx/drawing.md), Kept source). Without this extension an **edited** drawing is rebuilt from its typed fields, so a resize or a new alt text loses everything they do not hold: a picture's locks, blip state, extension list, line and fill, `cNvPr` description, a shape's style references … Under it, `dehydrateDrawing` writes each edited core field into a copy of the source and makes that copy the drawing's source (`docxDrawing.keepSource`), so the rest stays.

A **picture** drawing also gets a typed `picture` field at hydrate (its alt text, hyperlink, locks, blip state and colour effects, blip fill, black-and-white mode, transform, adjust guides, fill, line and effect list — see The `picture` model), a **shape** drawing a typed `shape` field (its flags and locks, shape properties, style references, body properties and the text box's paragraphs — see The `shape` model), a **group** or **canvas** drawing a typed `group` / `canvas` (its properties and its children, each a typed shape, picture or nested group), and **every** drawing a typed `frame` (Word's ids, the effect extent, the frame locks, `wp:docPr`'s hidden flag, hyperlink and decorative flag), an anchored one a typed `layout` (its position, wrap and relative size) — see The `frame` and `layout` models, The `group` and `canvas` models; their edits are written into the source the same way.

## Resolve

```js
const ext = runtime.resolve('dmlWpDrawing');
docx.use(ext);
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `hydrateDrawing` | `(drawing) => drawing` | the drawing with its typed `frame`, an anchor with its `layout`, a picture with its `picture`, a shape with its `shape`, a group with its `group`, a canvas with its `canvas` (in place) |
| `dehydrateDrawing` | `(drawing) => drawing` | those fields removed; an edited drawing with its edits written into a new `_source` (in place); an untouched one, or one whose structure changed, unchanged |
| `readPicture` | `(picEl) => picture` | the `picture` of a `pic:pic` element |
| `writePicture` | `(picEl, picture, base, force?) => boolean` | writes into `picEl` (in place) each field of `picture` that differs from `base` (every field under `force`); false when one has no place there |
| `readShape` | `(wspEl) => shape` | the `shape` of a `wps:wsp` element |
| `writeShape` | `(wspEl, shape, base, force?) => boolean` | as `writePicture`, for a `wps:wsp` |
| `readFrame` / `writeFrame` | `(wrapperEl)` / `(wrapperEl, frame, base, force?)` | the `frame` of a `wp:inline` / `wp:anchor` |
| `readLayout` / `writeLayout` | `(anchorEl)` / `(anchorEl, layout, base, force?)` | the `layout` of a `wp:anchor` |
| `readGroup` / `writeGroup` | `(groupEl)` / `(groupEl, group, base, force?)` | the `group` of a `wpg:wgp` / `wpg:grpSp` |
| `readCanvas` / `writeCanvas` | `(canvasEl)` / `(canvasEl, canvas, base, force?)` | the `canvas` of a `wpc:wpc` |

## Hooks

| Hook | Triggered on |
|------|--------------|
| `hydrateDrawing` | every drawing of a run in the document, headers, footers, footnotes, endnotes and comments, after `read()` |
| `dehydrateDrawing` | the same drawings, before `write()` |

## Fields written in place

| Field | Written to |
|-------|------------|
| `distT` / `distB` / `distL` / `distR` | the `wp:inline` / `wp:anchor` attributes (removed with the field) |
| `cx` / `cy` | `wp:extent`, and the picture's `pic:spPr/a:xfrm/a:ext` |
| `offsetX` / `offsetY` | the picture's `pic:spPr/a:xfrm/a:off` |
| `docName`, `description`, `title` | `wp:docPr name` / `descr` / `title` (a removed alt text or title removes its attribute) |
| `anchorAttrs` | the `wp:anchor` attributes other than the distances, in the source's order, new ones after |
| `anchorChildren` | the anchor's positioning and wrap children, in `CT_Anchor` order |
| `picName` / `picId` | `pic:cNvPr name` / `id` |
| `linkRef` | `a:blip r:link` |
| `srcRect` | `a:srcRect`, added after the blip, replaced or removed |
| `prstGeom` | the picture's `a:prstGeom prst` |
| `shapeProps` | the shape's `wps:spPr`, rendered from the typed bag ([drawingml-shape](../drawingml/shape.md)) with the source element's attributes kept |
| `_wpsTxbx` / `_wpsBodyPr` | the shape's `wps:txbx` / `wps:bodyPr`, replaced |
| `_gdRaw` | the unknown graphic's `a:graphicData`, replaced |

## The `picture` model

Each field is present only when the source holds it. A colour is `{ kind, attrs, mods }` — `kind` the colour element's local name (`srgbClr`, `schemeClr`, `prstClr`, `hslClr`, `scrgbClr`, `sysClr`), `attrs` its attributes, `mods` every transform child in order (`{ kind, attrs }`: `tint`, `shade`, `alpha`, `satMod`, `lumMod` …).

| Field | Read from | Value |
|-------|-----------|-------|
| `description`, `title` | `pic:cNvPr descr` / `title` | string (an empty one kept) |
| `hidden` | `pic:cNvPr hidden` | boolean |
| `hyperlink` | `pic:cNvPr/a:hlinkClick` | `{ rId, tooltip?, targetFrame?, extraAttrs?, _extras? }` (the `r:id` must name a relationship the written part holds — a hyperlink of `docx.write`'s `hyperlinks`, or a carried one) |
| `decorative` | `adec:decorative val` (an extension item of `pic:cNvPr`) | boolean |
| `preferRelativeResize` | `pic:cNvPicPr preferRelativeResize` | boolean |
| `locks` | `a:picLocks` | `{ noChangeAspect?: boolean, noChangeArrowheads?: boolean, noCrop?: boolean, … }`, one entry per attribute |
| `cstate` | `a:blip cstate` | string |
| `useLocalDpi` | `a14:useLocalDpi val` (an extension item of `a:blip`) | boolean |
| `blipEffects` | the `a:blip` children but its extension list | `[effect]` (see `effects`; `duotone` holds `colors`, `clrChange` holds `from` / `to`) |
| `dpi`, `rotWithShape` | `pic:blipFill` attributes | number, boolean |
| `fillMode`, `fillRect`, `tile` | `a:stretch` (with its `a:fillRect` attributes) or `a:tile` (its attributes) | `'stretch'` / `'tile'`, attribute bags |
| `bwMode` | `pic:spPr bwMode` | string |
| `rotation`, `flipH`, `flipV` | `a:xfrm rot` / `flipH` / `flipV` | number (60000ths of a degree), booleans |
| `adjust` | the preset's `a:avLst/a:gd` | `[{ name, fmla }]` |
| `fill` | the `pic:spPr` fill | `'none'`, `'group'`, `{ solid: color }`, `{ gradient: { attrs, stops: [{ pos, color }], lin?, path?, tileRect? } }`, `{ pattern: { attrs, fg?, bg? } }`, `{ node }` (a picture fill, verbatim) |
| `line` | `a:ln` | `{ width?, cap?, compound?, align?, extraAttrs?, fill?, dash? (preset name or { custom: [{ d, sp }] }), join? ('round' / 'bevel' / 'miter'), miterLimit?, headEnd?, tailEnd? (attribute bags), _extras? }` |
| `effects` | `a:effectLst` | `[{ kind, attrs, color? }]` (`fillOverlay` holds `fill`); an effect of another shape is `{ kind, node }`, verbatim |

Writing a `picture` field sets or removes an attribute, or replaces, removes or creates an element at its schema place; a removed field removes its element, and an extension item removed with the last of its list removes the list. Booleans keep the source's spelling (`1` / `true`) while unchanged. What the model does not type stays where the source has it: the hover link, the other extension items (the artistic `a14:imgProps` effects, the `a14:` hidden fill and line, `a14:shadowObscured`), `a:effectDag`, `a:scene3d`, `a:sp3d`.

## The `shape` model

A `wps:wsp` shape's `shape`, each field present only when the source holds it, written as the `picture` is. The shape properties (`bwMode`, `rotation`, `flipH`, `flipV`, `adjust`, `fill`, `line`, `effects`) and the non-visual ones of an optional `wps:cNvPr` (`description`, `title`, `hidden`, `hyperlink`, `decorative`) are the `picture`'s fields with the same codecs.

| Field | Read from | Value |
|-------|-----------|-------|
| `isTextBox` | `wps:cNvSpPr txBox` | boolean |
| `locks` | `wps:cNvSpPr/a:spLocks` | flags, one entry per attribute |
| `connector` | a connector's `wps:cNvCnPr` | `{ locks?, start?, end? }`: the `a:cxnSpLocks` flags, the `a:stCxn` / `a:endCxn` `{ id, idx }` |
| `style` | `wps:style` | `{ line?, fill?, effect?, font? }`, each `{ idx, color? }` from `a:lnRef` / `a:fillRef` / `a:effectRef` / `a:fontRef` (`idx` a number, the font's `'major'` / `'minor'` / `'none'`); a written style holds the references given, in schema order |
| `body` | `wps:bodyPr` | `{ rotation?, vertical?, wrap?, anchor?, anchorCenter?, upright?, insets? ({ l, t, r, b }), columns? ({ count, spacing, rtl }), extraAttrs?, warp? ({ preset, adjust? }), autofit? ('none' / 'shape' / { normal: attrs }) }` |
| `content` | `wps:txbx/w:txbxContent` | the text box's blocks as [docxStructure](../docx/structure.md) types the body: paragraphs, tables, controls, markers |

The core's `shapeProps`, `_wpsBodyPr` and `_wpsTxbx` edits are written first and the `shape` edits over them. `content` written replaces the blocks of `w:txbxContent` (the `wps:txbx` created before `wps:bodyPr` when there is none, removed with the field); its paragraphs go through `docxStructure` and keep what it keeps (revision ids and `xml:space` are not kept, as in the body). A drawing inside a text box is a block's drawing written from its own source; the walker does not hydrate it. What the model does not type stays: a custom geometry, the extension lists and 3D of `wps:spPr` and `wps:bodyPr`, a linked text box, the `wps:txbx` attributes.

## The `frame` and `layout` models

Every drawing's `frame`, each field present only when the source holds it:

| Field | Read from | Value |
|-------|-----------|-------|
| `anchorId`, `editId` | `wp14:anchorId` / `wp14:editId` on the `wp:inline` / `wp:anchor` (kept by the read under `extensions: 'keep'`) | string |
| `effectExtent` | `wp:effectExtent` | `{ l, t, r, b }` |
| `frameLocks` | `wp:cNvGraphicFramePr/a:graphicFrameLocks` | flags, one entry per attribute |
| `hidden`, `hyperlink`, `decorative` | `wp:docPr`: `hidden`, `a:hlinkClick`, the `adec:decorative` item | as the `picture`'s |

An anchored drawing's `layout`:

| Field | Read from | Value |
|-------|-----------|-------|
| `simplePos` | `wp:simplePos` | `{ x, y }` |
| `horizontal`, `vertical` | `wp:positionH` / `wp:positionV` | `{ relativeFrom, offset? (wp:posOffset) or align? (wp:align), pctOffset? (wp14:pctPosHOffset / VOffset) }` |
| `wrap` | the anchor's wrap | `{ type: 'none' / 'square' / 'tight' / 'through' / 'topAndBottom', wrapText?, distT?, distB?, distL?, distR?, effectExtent?, polygon? ({ edited?, start, lineTo: [{ x, y }] }) }` |
| `relativeSize` | `wp14:sizeRelH` / `wp14:sizeRelV` | `{ horizontal?, vertical? }`, each `{ relativeFrom, pct }` |

A number a strict document writes with its unit (`10cm`, `40%`) is kept as that string. The core's `docName`, `description`, `title`, the distances and `anchorAttrs` stay the core's fields; the core's `anchorChildren` edits are written first, the `layout` edits over them. An `mc:AlternateContent` among the anchor's children is kept as it is.

## The `group` and `canvas` models

A group's (`wpg:wgp`, or a nested `wpg:grpSp`) `group`: the non-visual fields of an optional `wpg:cNvPr` (as the `picture`'s), `locks` (`a:grpSpLocks`), from `wpg:grpSpPr` `bwMode`, `rotation`, `flipH`, `flipV`, `fill`, `effects` (the `picture`'s codecs) and `offset` / `extent` / `childOffset` / `childExtent` (`a:off`, `a:ext`, `a:chOff`, `a:chExt`: `{ x, y }` / `{ cx, cy }`), and `children`, in order: `{ shape }`, `{ picture }`, `{ group }`, or `{ node }` (a graphic frame, a content part …, verbatim).

A canvas's (`wpc:wpc`) `canvas`: `background` (`wpc:bg`: `{ fill?, effects? }`), `whole` (`wpc:whole`: `{ line?, effects? }`) and `children`, as a group's (a nested group is a `wpg:wgp`).

The children are written each into its own element. A changed number of children, or a child of another kind, is not written: the drawing is left to the core, which writes a group or canvas from its graphic as read (`_gdRaw`). A picture inside a group names its image's relationship, which a save-back does not hold yet: the core then rebuilds the drawing from its typed fields, its graphic as read.

## Roundtrip example

```js
docx.use(runtime.resolve('dmlWpDrawing'));
const r = docx.read(bytes);
const pic = r.document.body[0].children[0].children[0];   // a drawing
pic.cx *= 2; pic.cy *= 2;
pic.description = 'The 2026 results';
const out = docx.write(r.document, { ...r, carry: r });
// the picture is twice as large, with its new alt text, and keeps its
// locks, blip state, line and extension list

pic.picture.locks.noChangeAspect = false;
pic.picture.line = { width: 12700, fill: { solid: { kind: 'srgbClr', attrs: { val: '1F4E79' }, mods: [] } } };
// written into the picture's source: its other properties stay

const box = r.document.body[1].children[0].children[0];   // a text-box shape
box.shape.body.anchor = 'ctr';
box.shape.content = [docx.paragraph('Updated caption')];
// the text box's style references, locks and body properties stay

box.layout.wrap = { type: 'square', wrapText: 'bothSides' };
box.layout.horizontal = { relativeFrom: 'margin', align: 'center' };
// the anchor's other children stay where they are
```

## Notes

- A drawing whose **structure** changed is left to the core, which rebuilds it from its typed fields as without the extension: a changed `mode` or `kind`, an edited field with no place in the source (`prstGeom` on a picture without `a:prstGeom`, `cx` without `wp:extent`, a removed `docName`, `shapeProps` or `_wpsBodyPr`), or a field this module does not know.
- This module's fields' edits are written with the core fields' edits; a drawing the core rebuilds (a structure change) loses them. A key this module does not know in one of them is ignored; a shape's alt text without a `wps:cNvPr` has no place (the core's `description`, on `wp:docPr`, is the shape's alt text).
- An edited `shapeProps` rewrites `wps:spPr` from the typed bag: what [drawingml-shape](../drawingml/shape.md) types plus its `_extras`, with the source element's attributes; edit the `shape` fields instead to keep the rest of `wps:spPr` in place.
- The written source still goes through the core's checks: the ids the write assigns are set in it, and a relationship reference it names that the written part does not hold makes the core rebuild it ([docxDrawing](../docx/drawing.md), Kept source).
- `docx.write` dehydrates the tree it is given in place: after a write, an edited drawing's `_source` and `_read` are the written ones.

## See also

- [docxDrawing](../docx/drawing.md) — the drawing model, `typedFields`, `keepSource`
- [docxWalker](../docx/docx-walker.md) — the `hydrateDrawing` / `dehydrateDrawing` contract
