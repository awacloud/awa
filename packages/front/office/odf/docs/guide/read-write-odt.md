# Read & write `.odt`

How to write a text document with the `odt` orchestrator, read it back, and use
the typed body model (paragraphs, headings, lists, sections, tables).

**Prerequisites.** `@awacloud/odf` and `@awacloud/fw`, with a `runtime` wired as in
[Getting started](./getting-started.md) (`fw_require` + `modules` registered on an
`@awacloud/fw` `ModuleRuntime`); the snippets below reuse that `runtime`.

## Writing

```js
const odt = runtime.resolve('odt');

const doc = {
    body: [
        odt.paragraph('Title', { styleName: 'Title' }),
        odt.paragraph('First paragraph.'),
        odt.paragraph('Second paragraph.')
    ]
};

const bytes = odt.write(doc, {
    meta: { title: 'My Doc', creator: 'Alice' }
});
// bytes: Uint8Array ready to download / save
```

## Reading

```js
const back = odt.read(bytes);
back.mimetype;      // 'application/vnd.oasis.opendocument.text'
back.body.length;   // 3
back.body[0].styleName;       // 'Title'
back.body[1].runs[0].value;   // 'First paragraph.'
back.meta.title;    // 'My Doc'
```

## Paragraph model

```js
{
    type: 'paragraph',
    styleName?: 'P1',
    runs: [
        { type: 'text', value: 'plain ' },
        { type: 'span', value: 'styled', styleName: 'T1' },
        { type: 'tab' },
        { type: 'line-break' },
        { type: 'space', count: 3 }
    ]
}
```

## Helpers

| Helper | Role |
|--------|------|
| `odt.empty()` | Document with a single empty paragraph. |
| `odt.fromText(['a','b'])` | Multi-paragraph document. |
| `odt.toText(doc)` | One line per paragraph or heading (lists, sections and table cells included), followed by the text of any text box (`draw:frame` / `draw:text-box`) anchored in it; image frames and alternative text contribute nothing; spacing inside a `text:span` (`text:s`, `text:tab`, `text:line-break`) is honoured, and the text of a text box anchored inside a span stays inline with the span. |

## Rich example

The `<office:text>` body can mix paragraphs, headings
(`heading`), lists, sections and soft-page-breaks. The
`textHeading.heading` helper builds a heading, and the list model
expects items containing typed paragraphs:

```js
const heading = runtime.resolve('textHeading');
const para = runtime.resolve('textParagraph');

const doc = {
    body: [
        heading.heading('Chapter 1', { outlineLevel: 1, styleName: 'H1' }),
        para.paragraph('Intro.'),
        { type: 'list', styleName: 'L1', items: [
            { children: [para.paragraph('item one')] },
            { children: [para.paragraph('item two')] }
        ] },
        { type: 'section', name: 'Appendix', children: [
            para.paragraph('section content')
        ] }
    ]
};

const bytes = odt.write(doc);
const back = odt.read(bytes);
back.body[0].type;        // 'heading'
back.body[2].items.length;// 2
odt.toText(back);
// "Chapter 1\nIntro.\nitem one\nitem two\nsection content"
```

## Semantic runs, links, lists and tables

The typed write model also covers span emphasis (`bold`/`italic`/`strike`/
`monospace`), `text:a` link runs, ordered/bullet lists, and typed
text-body tables. Behind the scenes `odt.write`/`odt.read` thread an
internal style seam (`textStyleRegistry`) through every paragraph,
heading, list and table cell, so these semantic fields become real ODF
styles on write and resolve back to the same fields on read — no
`styleName` bookkeeping required from the caller.

```js
const runtime = new ModuleRuntime();
runtime.registerAll(fw_require);
runtime.registerAll(modules);
const odt = runtime.resolve('odt');
const xml = runtime.resolve('xml');

// A styles.xml named text style, referenced explicitly below — resolved
// AND kept (a named style's binding is never consumed, unlike a generated
// automatic style; its resolved flags are added).
const emphasisStyle = xml.el('style:style',
    { 'style:name': 'Emphasis', 'style:family': 'text' },
    [xml.el('style:text-properties', { 'fo:font-style': 'italic' }, [])]);

const doc = {
    body: [
        {
            type: 'paragraph',
            runs: [
                { type: 'text', value: 'Read this ' },
                { type: 'span', value: 'code()', bold: true, monospace: true },
                { type: 'text', value: ' then follow the ' },
                { type: 'link', href: 'https://awa.example/spec',
                  runs: [{ type: 'text', value: 'spec' }] }
            ]
        },
        // References the `emphasisStyle` passed via `opts.styles` below.
        { type: 'paragraph', runs: [
            { type: 'span', value: 'stressed', styleName: 'Emphasis' }
        ] },
        { type: 'list', ordered: true, numFormat: 'a', items: [
            { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'first' }] }] },
            { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'second' }] }] }
        ] },
        { type: 'list', ordered: false, items: [
            { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'bullet one' }] }] },
            { children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'bullet two' }] }] }
        ] },
        { type: 'table', name: 'T1', columns: [{}, {}], rows: [
            { type: 'row', cells: [
                { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'h1' }] }] },
                { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'h2' }] }] }
            ] },
            { type: 'row', cells: [
                { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'a' }] }] },
                { type: 'cell', children: [{ type: 'paragraph', runs: [{ type: 'text', value: 'b' }] }] }
            ] }
        ] }
    ]
};

const bytes = odt.write(doc, {
    styles: { styles: [emphasisStyle], automaticStyles: [], masterStyles: [] }
});
const back = odt.read(bytes);
```

`content.xml` now carries a real bold+monospace style AND its font-face
declaration (the earlier `fo:font-family` guess is fully displaced by a
declared `office:font-face-decls` face):

```xml
<office:font-face-decls>
  <style:font-face style:name="awa-mono" svg:font-family="monospace"
      style:font-family-generic="modern" style:font-pitch="fixed"/>
</office:font-face-decls>
<office:automatic-styles>
  <style:style style:name="awa-t-bm" style:family="text">
    <style:text-properties fo:font-weight="bold" style:font-name="awa-mono"/>
  </style:style>
  <text:list-style style:name="awa-l-na">…</text:list-style>
  <text:list-style style:name="awa-l-b">…</text:list-style>
</office:automatic-styles>
```

And `odt.read(bytes)` recovers the exact typed fields — the named style
kept AND resolved side by side (measured against the live tree):

```js
back.body[0].runs[1];
// { type: 'span', value: 'code()', bold: true, monospace: true }
back.body[1].runs[0];
// { type: 'span', value: 'stressed', styleName: 'Emphasis', italic: true }
back.body[2].ordered;      // true
back.body[2].numFormat;    // 'a'
back.body[4].rows[0].cells[1].children[0].runs[0].value; // 'h2'
'autoStyles' in back;      // false — the generated style was fully consumed
'fontFaces' in back;       // false — ditto for the font-face declaration
```

**Resolution scope.** The read-side resolver covers `content.xml`
automatic styles and `styles.xml` `office:styles` fully-mapped entries
only — never parent-style-name chains; monospace requires a declared
fixed-pitch or generic-modern font face.

## Embedding an image

A picture is an `image` run inside a paragraph, plus its bytes in
`doc.pictures`. The run becomes a `<draw:frame>` / `<draw:image>` pair
anchored `as-char` (inline) unless `anchorType` says otherwise; a paragraph
whose only run is an image is a block image. The bytes become a package part
whose manifest media type is sniffed from the bytes themselves.

```js
const odt = runtime.resolve('odt');
const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);

const bytes = odt.write({
    body: [
        { type: 'paragraph', runs: [{ type: 'text', value: 'Figure 1:' }] },
        { type: 'paragraph', runs: [
            { type: 'image', href: 'Pictures/figure1.png',
              width: '8cm', height: '6cm', name: 'figure1' }
        ] }
    ],
    pictures: { 'Pictures/figure1.png': pngBytes }
});

const back = odt.read(bytes);
back.package.parts['Pictures/figure1.png'].length;   // 12
back.package.manifest.entries
    .find(e => e.fullPath === 'Pictures/figure1.png').mediaType;   // 'image/png'
back.body[1]._extras.children[0].name;               // 'draw:frame'
```

Points to keep in mind:

- **Sizes are yours.** `width` / `height` are emitted exactly as given
  (`'8cm'`, `'2in'`, …); nothing is defaulted when they are absent.
- **`href` is not checked** against `pictures`. An external URL is legal ODF,
  so `{ type: 'image', href: 'https://…' }` without any `pictures` entry writes
  a frame and no part.
- **Reserved paths throw.** A `pictures` key naming `content.xml`,
  `styles.xml`, `meta.xml`, `settings.xml`, `mimetype` or
  `META-INF/manifest.xml`, an absolute or `..` path, or a value that is not a
  `Uint8Array` throws `ContractError('odf/contract-error/odt')`.
- **The read side stays untyped.** `odt.read` keeps the frame raw in the
  paragraph's `_extras.children` rather than rebuilding an `image` run; the
  bytes are under `back.package.parts`.
- **Only `odt` has the sink.** `.ods` / `.odp` paragraphs drop an `image` run
  silently.

## See also

- [API odt](../api/odt/odt.md)
- [API text/paragraph](../api/text/paragraph.md)
- [API text/content](../api/text/content.md)
- [API text/heading](../api/text/heading.md)
- [API text/list](../api/text/list.md)
- [API text/style-registry](../api/text/style-registry.md)
