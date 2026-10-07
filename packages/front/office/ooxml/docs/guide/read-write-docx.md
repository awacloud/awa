# Reading and writing `.docx`

This guide walks through reading a docx, traversing its content, mutating it, and writing it back — first with the [`docx-large`](../api/bundles/docx-large.md) bundle, then with [`docx-full`](../api/bundles/docx-full.md).

**Prerequisites**: `@awacloud/ooxml` and `@awacloud/fw` installed and the install and runtime registration of [Getting started](./getting-started.md); the bundles come from `@awacloud/ooxml/bundles/docx-large` and `@awacloud/ooxml/bundles/docx-full`.

## Bootstrapping with `ModuleRuntime`

`register()` takes **one** descriptor per call — use `registerAll(array)`
for a batch. The extras are **not** re-exported by name from the
`@awacloud/ooxml` root; import the whole `extras` array instead:

```js
// app.js
import fw from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/ooxml';
import { docxLargeBundle } from '@awacloud/ooxml/bundles/docx-large';

fw.runtime.registerAll(fw_require);
fw.runtime.registerAll(modules);
fw.runtime.registerAll(extras);   // every opt-in extra; a bundle only
                                   // resolves the ones it declares
fw.runtime.register(docxLargeBundle);

const word = fw.runtime.resolve('docxLargeBundle'); // enriched docx instance
```

## Reading

```js
const bytes  = await fetch('/sample.docx')
    .then(r => r.arrayBuffer())
    .then(b => new Uint8Array(b));
const result = word.read(bytes);
```

`result` shape (selected fields):

```js
{
    document: { type: 'document', body: [paragraph | table], sectPr? },
    package:  /* raw OPC package */,
    headers:  { /* rId → header tree */ },
    footers:  { /* rId → footer tree */ },
    images:   { /* rId → { partName, data, contentType } */ },
    styles:   { styles: [Style], … },
    settings: { /* settings.xml typed */ },
    hyperlinks: { /* rId → { target, external } */ },
    unmodelledParts: [ /* { partName, contentType } — never written back */ ]
}
```

See [docx model](../api/docx/docx.md) for full shapes.

## Walking the tree

```js
function walkBody(body) {
    for (const node of body) {
        if (node.type === 'paragraph') {
            for (const child of node.children) {
                if (child.type === 'run') {
                    const text = child.children
                        .filter(c => c.type === 'text')
                        .map(c => c.value).join('');
                    console.log('run:', text, child.rPr);
                }
            }
        } else if (node.type === 'table') {
            for (const row of node.rows)
                for (const cell of row.cells)
                    walkBody(cell.children); // recurse — cells contain paragraphs
        }
    }
}

walkBody(result.document.body);
```

## Concrete input → parsed object

Input XML excerpt (inside `word/document.xml`):

```xml
<w:p>
  <w:pPr><w:jc w:val="center"/></w:pPr>
  <w:r>
    <w:rPr><w:b/><w:caps/><w:lang w:val="en-US"/></w:rPr>
    <w:t>Hello, world.</w:t>
  </w:r>
</w:p>
```

After `read()` (with `docx-large` wired):

```js
{
    type: 'paragraph',
    pPr: { align: 'center' },
    children: [{
        type: 'run',
        rPr: { bold: true, caps: true, lang: { val: 'en-US' } },
        children: [{ type: 'text', value: 'Hello, world.' }]
    }]
}
```

The `caps` and `lang` fields are typed thanks to [`wmlRunFormatting`](../api/extra/wml-run-formatting.md) (included in `docx-large`).

## Mutating + writing back

```js
// Add a new paragraph at the end.
result.document.body.push({
    type: 'paragraph',
    pPr: { align: 'right' },
    children: [{
        type: 'run',
        rPr: { italic: true, color: '0070C0' },
        children: [{ type: 'text', value: 'Appended.' }]
    }]
});

// `write` takes the DOCUMENT (`result.document`), not the whole read()
// result — pass through the auxiliary parts you want re-emitted.
const out = word.write(result.document, {
    styles: result.styles, settings: result.settings,
    headers: result.headers, footers: result.footers,
    hyperlinks: result.hyperlinks
});
// → Uint8Array — feed to a Blob to download.
const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
});
window.URL.createObjectURL(blob);
```

Inside the parts the model reads, untyped elements are kept in `_extras`
and re-emitted; `write()` produces the parts its model carries, and a part
`read()` did not model (a theme, the font table, document properties, …)
is not written back — `read()` lists it in `result.unmodelledParts`.

## Tables

```js
result.document.body.push({
    type: 'table',
    rows: [{
        type: 'row',
        cells: [
            { type: 'cell', tcPr: { width: 4000, vAlign: 'center' },
              children: [{ type: 'paragraph', children: [
                  { type: 'run', children: [{ type: 'text', value: 'A1' }] }] }] },
            { type: 'cell',
              children: [{ type: 'paragraph', children: [
                  { type: 'run', children: [{ type: 'text', value: 'B1' }] }] }] }
        ]
    }]
});
```

With `docx-large`, `cell.tcPr` exposes typed `borders`, `vAlign`, `mar`, `gridSpan`, `vMerge` — see [`wmlTableProperties`](../api/extra/wml-table-properties.md).

## With `docx-full`

```js
import { docxFullBundle } from '@awacloud/ooxml/bundles/docx-full';

// `extras` (registered above) already covers docx-full's own extras
// (wmlVmlLegacy, dmlShapesAdvanced, transitional, legacyVml, wmlMisc,
// mathMisc, dmlMainMisc) — only the bundle descriptor itself is new:
fw.runtime.register(docxFullBundle);

const wordFull = fw.runtime.resolve('docxFullBundle');

// Now legacy VML pictures, custom-geometry shapes,
// and all long-tail elements roundtrip with typed fields.
const result = wordFull.read(legacyBytes);
```

Use `docx-full` when round-tripping fixtures from Word 2003 / converted documents that include `<w:pict>`, `<o:OLEObject>`, or `<a:custGeom>` shapes.

## See also

- [docx model](../api/docx/docx.md)
- [docx-large bundle](../api/bundles/docx-large.md)
- [docx-full bundle](../api/bundles/docx-full.md)
- [Extending](./extending.md)
