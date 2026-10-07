---
module: docxComments
category: ooxml/docx
dependencies: [ooxmlErrors, xml, docxStructure, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxComments

> `word/comments.xml` part — comment bodies + author/date/initials (§17.13.4).

**Module** `docxComments` | **Source** `packages/front/office/ooxml/src/docx/comments.js` | **Deps** `ooxmlErrors`, `xml`, `docxStructure`, `ooxmlShared` | **Worker-safe** yes

Comments live in a dedicated part. In the body they are anchored by the `<w:commentRangeStart>` / `<w:commentRangeEnd>` / `<w:commentReference>` triple — handled by [`docx-structure`](./structure.md).

## Resolve

```js
const com = runtime.resolve('docxComments');
// Returns: { parse, serialize, bytesOf,
//            REL_TYPE_COMMENTS, CT_COMMENTS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(input: text\|bytes\|XmlElement) => commentsObj` | Typed model. An already-parsed root element is used as is. |
| `serialize` | `(obj) => string` | `<w:comments>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `REL_TYPE_COMMENTS`, `CT_COMMENTS` | string | OPC bindings. |

## Model

```js
{
    comments: [{
        id: number,
        author?: string,
        date?: string,           // ISO 8601
        initials?: string,
        body: [paragraph | table],
        _extras?: [xmlNode]
    }],
    _extras?: [xmlNode]
}
```

## Examples

### Add a comment

```js
const com = runtime.resolve('docxComments');
const obj = {
    comments: [{
        id: 1, author: 'Alice', initials: 'AB',
        date: '2024-01-15T10:00:00Z',
        body: [d.paragraph('Really?')]
    }]
};
d.write(doc, { comments: obj });
// The body-side anchoring uses a run child of type 'commentReference'
// plus w:commentRangeStart/End — see docx-structure.
```

### Read

```js
const obj = com.parse(pkg.parts['/word/comments.xml']);
obj.comments.map(c => `${c.author}: ${docx.toText({ body: c.body })}`);
```

## Notes

- `id` is a per-file unique integer. The body's `commentReference` uses the same `id` (as a string).
- `body` is typed like a regular docx body — tables, lists and so on are accepted.
- The `commentRangeStart`/`commentRangeEnd` anchors must surround the commented content; without them Word shows an orphan comment.
- A bad root element raises `ParseError('docx/comments-bad-root')` — see [`ooxmlErrors`](../errors.md).
- `docx.read` passes a root already processed by `markupCompatibility` (ignorable extension content dropped, the two repeating-section elements kept); a standalone call on text or bytes does no markup-compatibility processing.
- The written root declares `w` and `r`, plus `mc`, `w15` and `mc:Ignorable="w15"` when the part holds a `w15` element.
- For the Office 2018+ threaded model, `@awacloud/ooxml` implements it on the spreadsheet side only — see [`xlsx-threaded-comments`](../xlsx/threaded-comments.md).

## See also

- [docx](./docx.md) — `write` with `comments`.
- [docx-structure](./structure.md) — body-side anchor markers.
