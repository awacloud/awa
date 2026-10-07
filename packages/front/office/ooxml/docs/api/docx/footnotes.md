---
module: docxFootnotes
category: ooxml/docx
dependencies: [ooxmlErrors, xml, docxStructure, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxFootnotes

> `word/footnotes.xml` and `word/endnotes.xml` parts — shared model (§17.11).

**Module** `docxFootnotes` | **Source** `packages/front/office/ooxml/src/docx/footnotes.js` | **Deps** `ooxmlErrors`, `xml`, `docxStructure`, `ooxmlShared` | **Worker-safe** yes

Footnotes and endnotes share the same structure; only the root tag differs (`<w:footnotes>` / `<w:endnotes>`). This module exposes two distinct `parse`/`serialize` pairs. In the body, notes are anchored by `<w:footnoteReference w:id="…"/>` (a run child).

## Resolve

```js
const f = runtime.resolve('docxFootnotes');
// Returns: { parseFootnotes, parseEndnotes,
//            serializeFootnotes, serializeEndnotes,
//            footnotesBytes, endnotesBytes,
//            REL_TYPE_FOOTNOTES, REL_TYPE_ENDNOTES,
//            CT_FOOTNOTES, CT_ENDNOTES }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseFootnotes` / `parseEndnotes` | `(input: text\|bytes\|XmlElement) => obj` | Typed model. An already-parsed root element is used as is. |
| `serializeFootnotes` / `serializeEndnotes` | `(obj) => string` | Root XML. |
| `footnotesBytes` / `endnotesBytes` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `REL_TYPE_FOOTNOTES`, `REL_TYPE_ENDNOTES`, `CT_FOOTNOTES`, `CT_ENDNOTES` | string | OPC bindings. |

## Model

```js
{
    notes: [{
        id: number,
        noteType?: 'separator'|'continuationSeparator'|'normal',
        body: [paragraph | table],
        _extras?: [xmlNode]
    }],
    _extras?: [xmlNode]
}
```

## Examples

### Minimal footnotes

```js
const f = runtime.resolve('docxFootnotes');
const footnotes = {
    notes: [
        { id: -1, noteType: 'separator',
          body: [d.paragraph('')] },
        { id: 0,  noteType: 'continuationSeparator',
          body: [d.paragraph('')] },
        { id: 1,  body: [d.paragraph('See [1] for the proof.')] }
    ]
};
d.write(doc, { footnotes });
// Referenced from the body by a run child of type 'footnoteReference', id: '1'.
```

### Endnotes round-trip

```js
const obj = f.parseEndnotes(pkg.parts['/word/endnotes.xml']);
const out = f.endnotesBytes(obj);
```

## Notes

- Word emits at least two synthetic notes with id `-1` (separator) and `0` (continuationSeparator) — keep them through the round-trip or Word will report a "repaired" file on open.
- A missing `noteType` means `'normal'`.
- Notes can contain formatted paragraphs, tables and so on — the body model is identical to the main document's.
- An unexpected root raises `ParseError('docx/footnotes-bad-root')` or `ParseError('docx/endnotes-bad-root')` — the code is derived from the expected root tag.
- `docx.read` passes a root already processed by `markupCompatibility` (ignorable extension content dropped, the two repeating-section elements kept); a standalone call on text or bytes does no markup-compatibility processing.
- The written root declares `w` and `r`, plus `mc`, `w15` and `mc:Ignorable="w15"` when the part holds a `w15` element.

## See also

- [docx](./docx.md) — `write` with `footnotes` / `endnotes`.
- [docx-structure](./structure.md) — `footnoteReference` / `endnoteReference` runs.
