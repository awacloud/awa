---
module: odt
category: odf/odt
dependencies: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, textParagraph, textContent, odtWalker, styleAutomatic, textStyleRegistry, drawFrame, drawImage]
returns: object
worker-safe: true
status: complete
---

# odt

> Top-level orchestrator for `.odt` (OpenDocument Text) documents.

**Module** `odt` | **Source** `packages/front/office/odf/src/odt/odt.js` | **Deps** see frontmatter | **Worker-safe** yes

`odt` reads/writes a minimal `.odt`:

- `mimetype` (STORED) = `application/vnd.oasis.opendocument.text`
- `META-INF/manifest.xml`
- `content.xml` = `<office:document-content>` → optional `<office:font-face-decls>` and `<office:automatic-styles>`, then `<office:body>` → `<office:text>` → mixed paragraphs / headings / lists / sections / soft-page-breaks (via `textContent`)
- `styles.xml`, `meta.xml`, `settings.xml` minimal
- `Pictures/*` — the optional `doc.pictures` byte map (see [Images](#images-typed-write))

## Resolve

```js
const o = runtime.resolve('odt');
// → { read, write, empty, paragraph, fromText, toText, CT_ODT, use, hasExtensions }
```

## API

| Method | Description |
|---------|-------------|
| `read(bytes, opts?)` | `{ mimetype, body, meta?, settings?, styles?, autoStyles?, fontFaces?, package }`. `opts` (optional) is forwarded to [`pkgPackage.read`](../pkg/package.md): `{ maxParts?, maxUncompressed?, maxRatio? }` — the ZIP-bomb caps (defaults 4096 entries, 256 MiB total, ratio 200 per entry; `0` disables one); a breach throws `ParseError('odf/parse-error/zip-bomb')`. `opts.framesInRuns: true` types every `draw:frame` of a paragraph, heading, span or link body as a `{ type: 'frame', ...drawFrame model }` run at its place in the text (default `false`: the frame stays in `_extras.children`, or a raw entry of a span's `runs`); `write` renders a frame run in place and `toText` reads it as it reads the raw frame. See [paragraph — Frame runs](../text/paragraph.md#frame-runs-opt-in). `opts.elementsInRuns: true` keeps every other untyped element of a paragraph, heading or link body — a comment and its end, a bookmark, a field, a change mark, a soft page break, a frame when `framesInRuns` does not type it — as a raw `{ type: 'element', name, attrs, children }` run at its place (default `false`: it stays in `_extras.children`, re-emitted after the runs); `write` writes it there and `toText` is the same either way. The bundles' extensions that type such elements from `_extras.children` (fields, change markers …) find none of them under this option: they stay raw runs. See [paragraph — Element runs](../text/paragraph.md#element-runs-opt-in). `opts.semanticStyles: true` reads what a style states where the fully-mapped rule reads nothing (see [style-registry — Semantic styles](../text/style-registry.md#semantic-styles-opt-in)): a span whose style holds more than the four emphasis keys, or inherits from a `styles.xml` parent, gains the emphasis the style chain states — keep-and-gain: its `styleName` stays, the automatic style is not consumed, so `write` gives back what the default read gives back — and a nested list with no style name takes its nearest styled ancestor's numbering at its own level (`ordered`, `numFormat`; no `styleName` is added, so a written nested list then names a list style of its own). It applies to the body and to `headerFooterContent`. Default `false`: today's read; another value than a boolean throws `ContractError('odf/contract-error/odt')`. `opts.sectionStyles: true` gives the result a `sectionStyles` map, the document's `section`-family styles by name (content.xml's automatic ones, styles.xml's named and automatic ones), each `{ source, columns?, balance?, backgroundColor?, editable?, writingMode? }` with its columns typed (count, gap, each column's width and indents, the separator; see [style-registry — Section styles typed](../text/style-registry.md#section-styles-typed)); a read view (another value throws with `context.argument: 'opts.sectionStyles'`). `opts.listStyles: true` gives the result a `listStyles` map, the document's list styles by name — content.xml's automatic ones, styles.xml's named and automatic ones and its outline style — each `{ source, levels }`, typed level by level (number format, prefix, suffix, start value, display levels, bullet char, text style, label position …, see [style-registry — List styles typed](../text/style-registry.md#list-styles-typed)); a read view, not written (another value throws `odf/contract-error/odt` with `context.argument: 'opts.listStyles'`). `opts.headerFooterContent: true` gives every `style:header`, `style:header-left`, `style:header-first`, `style:footer`, `style:footer-left` and `style:footer-first` of the `styles.xml` master pages a `content` field: its children typed with the body's model (the nodes `body` holds), resolved against the `styles.xml` automatic styles, named styles and font faces, `framesInRuns` and `elementsInRuns` applying as for the body (a field such as `text:page-number` stays in place with `elementsInRuns`); the raw children stay as read and the rest of the `styles` model is unchanged. The element is a raw node in `styles.masterStyles`, or a `{ kind, attrs, children }` bag in `styles.masterPages` with the large and full bundles. Another value than a boolean throws `ContractError('odf/contract-error/odt')`. `write` writes such a header or footer back: unedited — its `content` structurally equal to what its children parse to under the read's flags (kept in an internal `_contentFlags`) — from its children, byte for byte; edited, from its `content`, through a style registry of its own whose automatic styles (a bold or italic run …) and font faces are added to `styles.xml`, under names that no style of `styles.xml` or of the document's automatic styles uses (the `content.xml` styles then avoid them too). `opts.textBoxes: true` (it needs `framesInRuns: true`; else, or for another value than a boolean, `ContractError('odf/contract-error/odt')`) gives every text-box frame run — in the body, in a box nested in a box, and in the headers and footers typed by `headerFooterContent` — a `child.content` field: the box's children typed with the body's model, `elementsInRuns` and `semanticStyles` applying as for the body, resolved against the same styles by a resolver that consumes no style (the automatic styles a box's paragraphs name stay written); the raw `child.children` stay as read, and an internal `child._contentRead` keeps the content as read. A frame that is not a run (anchored to the page at body level) is not typed. `write` writes a box back unedited — its `content` structurally equal to `_contentRead` — from its children, byte for byte; edited, from its `content`, through the write's style registry, its frames and inline elements in place. `toText` reads a typed box's `content`. Default `false`: today's read. |
| `write(doc, opts?)` | `Uint8Array`. `opts: { meta?, settings?, styles?, mtime?, preserveInput?, keepVersion?, cleanup? }` — `opts.cleanup` is an array of named cleanups applied to a structured clone (the given model is left as it was), with the names `docx.write` uses: `'emptyProperties'` drops every `style:*-properties` element with no attribute and no child (an automatic style's empty properties bag in `content.xml`, a raw empty property element in the `styles.xml` styles); `[]` writes as without it, another value throws `odf/contract-error/odt` with `context.argument: 'opts.cleanup'`. `opts.keepVersion: true` writes each part's root with the `office:version` of the same part of `doc.package` (none when that part has none; a part the source lacks takes the source `content.xml`'s; without a source package, `1.4`) and the manifest's `manifest:version` (root and `/` entry) with the source `content.xml` version from ODF 1.2 on, none for an older source, the source manifest's when `content.xml` has none — so a round trip is checked against the schema of its source's version; for a source older than ODF 1.3 (which has no `draw:mime-type` on images) an image read with LibreOffice's `loext:mime-type` is written under that attribute (see [`drawImage`](../draw/image.md)); the default (`false`) stamps `1.4` and writes `draw:mime-type`, and another value throws `odf/contract-error/odt` with `context.argument: 'opts.keepVersion'`. `opts.preserveInput: true` writes from a structured clone of `doc` (its `package`, only read, excepted) and of `opts`, so the given model is left exactly as it was (without it, an extension's dehydrate hook may change it in place, and writing an edited header or footer `content` (see `headerFooterContent`) replaces that header's or footer's `children` and adds the automatic styles and font faces the edit needs to the given `styles` model — `opts.styles` when passed, else `doc.styles`; the bytes are the same either way; another value throws `odf/contract-error/odt` with `context.argument: 'opts.preserveInput'`); the three `opts.styles` buckets accept raw elements **or** typed named-style specs (see [`odfStyles`](../style/styles.md)). `opts.mtime` (`number \| Date`) is the ZIP entry date handed to [`pkgPackage.write`](../pkg/package.md) — default 1980-01-01 00:00:00, so the same document writes the same bytes. `doc` may carry `autoStyles` / `fontFaces`, and `pictures` (`{ [path]: Uint8Array }`) emitted as package parts with sniffed media types (see [Images](#images-typed-write)). Re-emits the `doc.package` parts the writer does not regenerate (everything but `content.xml`, `meta.xml`, `settings.xml`, `styles.xml`) byte-for-byte with their source manifest media types, plus the source manifest's directory entries, and writes `doc.styles` / `doc.settings` / `doc.meta` unless `opts.*` overrides. `meta:generator` is rewritten to `@awacloud/odf` unless `opts.meta.generator` is given. Precedence: regenerated part, then writer-supplied part (`doc.pictures`), then the carried copy; delete from `doc.package.parts` (or delete `doc.package`) to drop carried material. |
| `empty()` | Document with one empty paragraph. |
| `paragraph(text, { styleName? })` | Paragraph helper. |
| `fromText(strings[])` | Document `body = strings.map(s => paragraph(s))`. |
| `toText(doc)` | One line per paragraph or heading (lists, sections and table cells included), followed by the text of any text box (`draw:frame` / `draw:text-box`) anchored in it; image frames and alternative text contribute nothing; spacing inside a `text:span` (`text:s`, `text:tab`, `text:line-break`) is honoured, and the text of a text box anchored inside a span stays inline with the span. |
| `use(...exts)` | Registers extensions on the underlying `odtWalker` — returns the API for chaining. |
| `hasExtensions` | `true` once any extension is registered. |

## Examples

```js
const o = runtime.resolve('odt');
const bytes = o.write({ body: [o.paragraph('Hello, world.')] });
const back = o.read(bytes);
o.toText(back); // 'Hello, world.'

// A grid table, with a typed named style in styles.xml:
const table = { type: 'table', grid: true, columns: [{ repeated: 2 }], rows: [
    { type: 'row', cells: [
        { type: 'cell', children: [o.paragraph('a')] },
        { type: 'cell', children: [o.paragraph('b')] }
    ] }
] };
const doc2 = o.read(o.write({ body: [table] }, { styles: {
    styles: [{ name: 'Text_20_body', displayName: 'Text body', family: 'paragraph' }],
    automaticStyles: [], masterStyles: []
} }));
doc2.body[0].grid;                          // true
doc2.autoStyles;                            // undefined — awa-c-b / awa-tb-m consumed
doc2.styles.styles[0].attrs['style:name'];  // 'Text_20_body' (raw element on read)
```

## The style seam

`content.xml`'s `<office:automatic-styles>` and `<office:font-face-decls>` are
no longer discarded.

**On read**, both are handed to a
[`textStyleRegistry`](../text/style-registry.md) resolver, together with the
`styles.xml` `<office:styles>` bucket and any font faces declared there. What
the resolver proved and consumed is dropped; the rest is surfaced verbatim:

| key | content |
|-----|---------|
| `autoStyles` | leftover `styleAutomatic` model — omitted when nothing is left |
| `fontFaces` | leftover **content-declared** `style:font-face` elements — omitted when empty |

A content-declared face is dropped only when it was resolved to monospace at
least once **and** no surviving surfaced automatic style still names it via
`properties.text['style:font-name']`. `styles.xml` material is never consumed
or stripped — `styles` comes back exactly as the sidecar parser produced it.

**On write**, `doc.autoStyles` and `doc.fontFaces` are re-emitted verbatim and
merged with whatever the write-side registry generated for the body, in schema
order: `office:font-face-decls?`, `office:automatic-styles?`, `office:body`.
Each container is emitted only when non-empty. Besides the `text`-family
emphasis styles and the `text:list-style`s, the registry emits two more
automatic-style families for [grid tables](../text/content.md#grid-tables--the-grid-field):
`table-cell` (`awa-c-b`, bordered cell) and `table` (`awa-tb-m`, margins
alignment); on read both are resolved and consumed like the others. Generated names are allocated
against the passthrough names, so a `-2`, `-3`, … suffix avoids any collision.

**Read order.** `read()` parses the sidecars (`meta`, `settings`, `styles`)
**before** `content.xml`, because the content-side resolver needs the styles
sidecar. Sidecar parsing has no dependency on the body, so their models are
byte-for-byte what a direct parse of the same parts produces.

**Byte stability.** A document with no `autoStyles`, no `fontFaces`, no
`grid` table and no semantic style fields serialises to exactly the
`content.xml` produced before the seam existed — in particular, no monospace
anywhere means no `<office:font-face-decls>` element at all. (Generated
`text:list-style` levels carry a `style:list-level-properties` child, so a
document with ordered/bullet lists serialises differently from earlier
releases, by design.)

## Images (typed write)

A paragraph run of kind `image` writes an inline picture:

```js
{ type: 'image', href, mimeType?, width?, height?, name?, anchorType?, styleName? }
```

- It renders as `<draw:frame><draw:image/></draw:frame>` at the run's position,
  through the write ctx's `renderImage` sink that `odt` composes from
  [`drawFrame`](../draw/frame.md) and [`drawImage`](../draw/image.md).
  `width` / `height` become `svg:width` / `svg:height`, `name` `draw:name`,
  `styleName` `draw:style-name`, `mimeType` `draw:mime-type` on the
  `draw:image`; the `xlink:type="simple"`, `xlink:show="embed"`,
  `xlink:actuate="onLoad"` defaults are always emitted.
- `anchorType` defaults to `as-char` (inline). A **block image** is a
  paragraph whose only run is an image run.
- No size is invented: `odf` emits exactly the `width` / `height` given, and
  omits the attribute when the field is absent. Sizing is the caller's job.
- `doc.pictures` (`{ [path]: Uint8Array }`) is written as package parts —
  conventionally `Pictures/<name>` — each with the manifest media type sniffed
  from its bytes (`drawImage.sniffImageType`: PNG, JPEG, GIF, BMP, WebP, TIFF,
  SVG, else `application/octet-stream`). Parts follow `content.xml` and the
  sidecars, in `Object.keys` order.
- A reserved or invalid path (`content.xml`, `styles.xml`, `meta.xml`,
  `settings.xml`, `mimetype`, `META-INF/manifest.xml`, an empty, absolute,
  trailing-`/` or `..` path) or a non-`Uint8Array` value throws
  `ContractError('odf/contract-error/odt', …)`.
- `href` is **not** validated against `pictures`: an external `xlink:href` is
  legal ODF, so a frame pointing at a URL is written without any part.

**Read-side asymmetry.** The read side is unchanged: a `draw:frame` inside a
`text:p` is not turned back into an `image` run. It is kept raw in the
paragraph's `_extras.children` (and re-emitted after the runs on a re-write),
while the picture bytes stay reachable through `package.parts`. Read with
`{ framesInRuns: true }` (see [`read`](#api)), the frame becomes a `frame` run
at its place in the text instead.

```js
const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
const bytes = o.write({
    body: [{ type: 'paragraph', runs: [
        { type: 'text', value: 'Logo: ' },
        { type: 'image', href: 'Pictures/logo.png', width: '4cm', height: '3cm', name: 'logo' }
    ] }],
    pictures: { 'Pictures/logo.png': png }
});

const back = o.read(bytes);
back.package.parts['Pictures/logo.png'];          // the same 12 bytes
back.package.manifest.entries.find(e => e.fullPath === 'Pictures/logo.png');
// { fullPath: 'Pictures/logo.png', mediaType: 'image/png' }
back.body[0].runs;                                // [{ type: 'text', value: 'Logo: ' }]
back.body[0]._extras.children[0].name;            // 'draw:frame'
```

## Notes

- A non-boolean `opts.semanticStyles`, `headerFooterContent`, `textBoxes`, `listStyles` or `sectionStyles` of `read` throws `ContractError('odf/contract-error/odt')` with `context.argument: 'opts.<name>'`, as does `textBoxes: true` without `framesInRuns: true`; a non-boolean `opts.preserveInput` or `opts.keepVersion` of `write`, or an invalid `opts.cleanup`, throws the same code.
- `write(undefined)` or `write(null)` throws `ContractError('odf/contract-error/odt', …)`.
- If the mimetype read is not `CT_ODT`, throws `ParseError('odf/parse-error/odt', 'odt: unexpected mimetype …')`.
- Non-paragraph nodes are parsed through `textContent` (headings, lists, sections, tracked changes, ...) — see that module for the supported node types.

## See also

- [pkg/package](../pkg/package.md)
- [text/paragraph](../text/paragraph.md)
- [text/style-registry](../text/style-registry.md) — the read/write style seam
- [style/automaticStyles](../style/automaticStyles.md) — the `autoStyles` model
- [odt/odt-walker](./odt-walker.md)
- [Guide read/write `.odt`](../../guide/read-write-odt.md)
