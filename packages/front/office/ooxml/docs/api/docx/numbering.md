---
module: docxNumbering
category: ooxml/docx
dependencies: [ooxmlErrors, xml, docxProperties, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# docxNumbering

> `word/numbering.xml` part — abstract numberings + concrete num instances (§17.9).

**Module** `docxNumbering` | **Source** `packages/front/office/ooxml/src/docx/numbering.js` | **Deps** `ooxmlErrors`, `xml`, `docxProperties`, `ooxmlShared` | **Worker-safe** yes

OOXML lists use a two-level indirection: `<w:abstractNum>` defines a reusable template (one `<w:lvl>` per indentation level), `<w:num>` references an `abstractNumId` and may override individual levels. Paragraphs point at a list through `pPr.numPr.numId` (see [`docx-properties`](./properties.md)).

## Resolve

```js
const num = runtime.resolve('docxNumbering');
// Returns: { parse, serialize, bytesOf,
//            decimalList, bulletList,
//            REL_TYPE_NUMBERING, CT_NUMBERING }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text\|bytes) => numberingObj` | Typed model. |
| `serialize` | `(obj) => string` | `<w:numbering>` XML. |
| `bytesOf` | `(obj) => Uint8Array` | UTF-8 bytes. |
| `decimalList` | `() => { numbering, numId }` | Ready-made numbered list (`numId: 1`). |
| `bulletList` | `() => { numbering, numId }` | Ready-made bullet list (U+2022, no run font — drawn by the paragraph font). |
| `REL_TYPE_NUMBERING`, `CT_NUMBERING` | string | OPC bindings. |

## Model

```js
{
    abstractNums: [{
        abstractNumId: number,
        name?: string,
        multiLevelType?: 'singleLevel'|'multilevel'|'hybridMultilevel',
        levels: [{
            ilvl: number, start?: number,
            numFmt?: 'decimal'|'bullet'|'lowerLetter'|'upperRoman'|…,
            lvlText?: string,         // '%1.', '•', '%1.%2'
            lvlJc?: 'left'|'center'|'right',
            pPr?: ParagraphProperties,
            rPr?: RunProperties,
            _extras?: [xmlNode]
        }],
        _extras?: [xmlNode]
    }],
    nums: [{
        numId: number,
        abstractNumId: number,
        lvlOverrides?: [{ ilvl, startOverride? }]
    }],
    _extras?: [xmlNode]
}
```

## Examples

### Ready-made numbered list

```js
const num = runtime.resolve('docxNumbering');
const { numbering, numId } = num.decimalList();
// numId = 1 — pass it through pPr.numPr.numId

const para = d.listParagraph('First item', numId, 0);
d.write(doc, { numbering });
```

`write()` never derives `word/numbering.xml` on its own — writing `numPr` without
`opts.numbering` throws `docx/numbering-missing`. See [docx `write` Notes](./docx.md#notes).

### Custom hierarchical list

```js
const obj = {
    abstractNums: [{
        abstractNumId: 0, multiLevelType: 'multilevel',
        levels: [
            { ilvl: 0, numFmt: 'decimal',     lvlText: '%1.',
              pPr: { indent: { left: 720, hanging: 360 } } },
            { ilvl: 1, numFmt: 'lowerLetter', lvlText: '%2)',
              pPr: { indent: { left: 1440, hanging: 360 } } }
        ]
    }],
    nums: [{ numId: 1, abstractNumId: 0 }]
};
```

## Notes

- `numFmt: 'bullet'` needs `lvlText` to be a real Unicode character (`'•'` U+2022, `'■'` U+25A0) drawn by the paragraph font; do NOT pair U+2022 with `rPr.font: 'Symbol'` — symbol-encoded fonts have no glyph there. `rPr.font` is for symbol fonts with their matching private-use code points only.
- `lvlText` uses `%1`, `%2`… as placeholders for the parent levels (nested `1.1.2`-style numbering).
- `start` sets the counter's initial value (default 1); `lvlOverrides[].startOverride` resets it without touching the abstract definition.
- `decimalList` / `bulletList` return `{ numbering, numId }` — the `numId` is what `listParagraph` expects.
- A root other than `<w:numbering>` raises `ParseError('docx/numbering-bad-root')`.

## See also

- [docx](./docx.md) — `listParagraph` builder.
- [docx-properties](./properties.md) — the `numPr` link from the paragraph.
- [docx-styles](./styles.md) — a numbering style can reference a `numId`.
