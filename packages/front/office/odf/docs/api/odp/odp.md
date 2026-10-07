---
module: odp
category: odf/odp
dependencies: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, slide, presentationStyle, styleAutomatic, styleMasterPage, drawFrame, textParagraph, odpWalker]
returns: object
worker-safe: true
status: complete
---

# odp

> Top-level reader/writer for `.odp` (OpenDocument Presentation).

**Module** `odp` | **Source** `packages/front/office/odf/src/odp/odp.js` | **Deps** see frontmatter | **Worker-safe** yes

## Resolve

```js
const odp = runtime.resolve('odp');
// → { read, write, empty, slide, fromSlides, toText, CT_ODP, use, hasExtensions }
```

## API

| Method | Description |
|---------|-------------|
| `read(bytes, opts?)` | Parses a `.odp` into `{ mimetype, slides, … }`. `opts` (optional) is forwarded to [`pkgPackage.read`](../pkg/package.md): `{ maxParts?, maxUncompressed?, maxRatio? }` — the ZIP-bomb caps (defaults 4096 entries, 256 MiB total, ratio 200 per entry; `0` disables one); a breach throws `ParseError('odf/parse-error/zip-bomb')`. |
| `write(doc, opts?)` | Writes a typed document. `opts: { meta, settings, styles }`. Re-emits the `doc.package` parts the writer does not regenerate (everything but `content.xml`, `meta.xml`, `settings.xml`, `styles.xml`) byte-for-byte with their source manifest media types, plus the source manifest's directory entries, and writes `doc.styles` / `doc.settings` / `doc.meta` unless `opts.*` overrides. `meta:generator` is rewritten to `@awacloud/odf` unless `opts.meta.generator` is given. Precedence: regenerated part, then writer-supplied part, then the carried copy; delete from `doc.package.parts` (or delete `doc.package`) to drop carried material. |
| `empty()` | Document with one empty slide. |
| `slide(name, opts?)` | Helper — builds `{ type: 'slide', name, frames }`. |
| `fromSlides([…])` | Multi-slide document. |
| `toText(doc, opts?)` | Visible text of the deck: text-box frames, then the text of every text-bearing element in each slide's untyped markup — tables (including tables held by a frame or a group), shapes and text boxes nested in groups — in document order; alternative text (`svg:title`/`svg:desc`) is not included; `opts.notes === true` appends the speaker notes; slide names are excluded (they are identifiers); slides are separated by a blank line and empty slides are skipped. |
| `use(...exts)` | Registers extensions on the underlying `odpWalker` — returns the API for chaining. |
| `hasExtensions` | `true` once any extension is registered. |

## Examples

```js
const doc = odp.fromSlides([
    odp.slide('Intro', { masterPageName: 'Default' }),
    odp.slide('Body',  { masterPageName: 'Default' }),
    odp.slide('End',   { masterPageName: 'Default' })
]);
const bytes = odp.write(doc);
const back = odp.read(bytes);
back.slides.length; // 3
odp.toText(back);   // '' — slide names are not text and these slides have no text-box

const para = runtime.resolve('textParagraph');
const p = t => para.renderParagraph(para.paragraph(t));
const withText = odp.fromSlides([
    odp.slide('Intro', { frames: [{ type: 'frame', child: {
        kind: 'text-box', children: [p('Welcome')], attrs: {} } }] }),
    { ...odp.slide('Body'), notes: { body: [p('Speaker note.')] } }
]);
const again = odp.read(odp.write(withText));
odp.toText(again);                   // 'Welcome'
odp.toText(again, { notes: true });  // 'Welcome\n\nSpeaker note.'
```

## Notes

- mimetype: `application/vnd.oasis.opendocument.presentation`.
- Rendering places `<office:automatic-styles>` (optional) before
  `<office:body>` in `content.xml`.

## See also

- [odp/slide](./slide.md)
- [odp/presentationStyle](./presentationStyle.md)
- [odp/odp-walker](./odp-walker.md)
