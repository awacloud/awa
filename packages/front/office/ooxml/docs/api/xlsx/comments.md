---
module: xlsxComments
category: ooxml/xlsx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxComments

> Legacy comments + the required VML drawing — `xl/comments*.xml` + `xl/drawings/vmlDrawing*.vml` (§18.7).

**Module** `xlsxComments` | **Source** `packages/front/office/ooxml/src/xlsx/comments.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

Excel's comment model uses two coupled parts: `comments{N}.xml` (authors + rich-text bodies) and `vmlDrawing{N}.vml` (the anchored yellow shape — **required**, Excel ignores comments with no VML). The sheet binds both through relationships plus a `<legacyDrawing r:id="…"/>`.

## Resolve

```js
const com = runtime.resolve('xlsxComments');
// Returns: { parse, serialize, bytesOf,
//            renderText, parseText,
//            renderRPr, parseRPr,
//            vmlForComments, vmlBytes,
//            REL_TYPE_COMMENTS, REL_TYPE_VML_DRAWING,
//            CT_COMMENTS, CT_VML_DRAWING }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => { authors, comments, _extras? }` | Typed model. |
| `serialize` | `(obj) => string` | `<comments>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `parseText` / `renderText` | rich `<text>` | `[{ text, rPr? }]`. |
| `parseRPr` / `renderRPr` | `<rPr>` | Run-formatting subset. |
| `vmlForComments` | `(cellRefs: string[]) => string` | VML for the given cells. |
| `vmlBytes` | `(cellRefs) => Uint8Array` | UTF-8 bytes of that VML. |
| `REL_TYPE_COMMENTS`, `REL_TYPE_VML_DRAWING`, `CT_COMMENTS`, `CT_VML_DRAWING` | string | OPC bindings. |

## Model (sheet level)

```js
sheet.comments: [{
    ref: 'A1',                          // cell reference
    author: string,                     // resolved through the authors registry
    richText: [{ text, rPr? }],         // canonical form
    text?: string,                      // single-run shorthand
    _extras?
}]

sheet.commentAuthors: [string]          // populated on read

rPr := { size?, color?, font?, family?, bold?, italic?, strike?,
         underline?, scheme?, charset? }
```

## Examples

### Simple comment

```js
const sheet = {
    name: 'Sheet1', rows: [/* … */],
    comments: [
        { ref: 'B2', author: 'Alice', text: 'Please double-check this figure' }
    ]
};
// xlsx.write wires comments.xml + vmlDrawing.vml + the relationships.
```

### Rich text (multi-run)

```js
sheet.comments = [{
    ref: 'C5', author: 'Bob',
    richText: [
        { text: 'Important: ', rPr: { bold: true, color: 'CC0000' } },
        { text: 'to validate before Q2.' }
    ]
}];
```

## Notes

- Without the VML part Excel **does not display** the comments — which is why `vmlForComments` is exposed even when you only care about the text.
- Authors are deduplicated on write into a per-file authors table; there is no need to manage it by hand (reads expose it as `sheet.commentAuthors`).
- For threaded comments (Office 2018+) see [xlsx-threaded-comments](./threaded-comments.md) — the two can coexist.
- `text` is a shorthand; it is converted to `richText: [{ text }]` on write.
- A root other than `<comments>` raises `ParseError('xlsx/comments-bad-root')`.

## See also

- [xlsx-threaded-comments](./threaded-comments.md) — the modern equivalent.
- [xlsx](./xlsx.md) — read/write orchestrator.
