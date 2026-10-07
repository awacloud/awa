---
module: docxText
category: ooxml/docx
dependencies: []
returns: object
worker-safe: true
status: complete
---

# docxText

> Plain-text extraction helpers for a typed `docx` document tree — the module behind `docx.toText`.

**Module** `docxText` | **Source** `packages/front/office/ooxml/src/docx/docx-text.js` | **Deps** none | **Worker-safe** yes

Pure functions over the typed model returned by `docx.read` (`result.document`): no runtime dependency, no state, no side effect. The `docx` orchestrator depends on this module and re-exposes its `toText` as `docx.toText` — the two are the same function, so most callers never resolve `docxText` directly.

## Resolve

```js
const text = runtime.resolve('docxText');
// Returns: { toText, textOfParagraph, textOfRun, textOfTable }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `toText` | `(doc: { body? }) => string` | The text of the whole document: one line per top-level `paragraph` or `table`, joined by `\n`. |
| `textOfParagraph` | `(p: paragraph) => string` | The concatenated text of the paragraph's runs, including the runs of `hyperlink` and `ins` children. |
| `textOfRun` | `(r: run) => string` | The text of one run. |
| `textOfTable` | `(t: table) => string` | Rows joined by `\n`, cells by `\t`. |

## Rules

| Node | Contributes |
|------|-------------|
| `text` | its `value` |
| `tab` | `\t` |
| `break` | `\n` |
| `noBreakHyphen` | U+2011 (non-breaking hyphen) |
| `hyperlink`, `ins` | the text of their runs |
| `del` | nothing — deleted text is not visible text |
| table cell | its paragraphs (and nested tables) joined by a single space |

## Examples

```js
const text = runtime.resolve('docxText');

const doc = {
    body: [
        { type: 'paragraph', children: [
            { type: 'run', children: [{ type: 'text', value: 'Hello' }, { type: 'tab' }, { type: 'text', value: 'world' }] },
            { type: 'del', children: [{ type: 'run', children: [{ type: 'text', value: 'gone' }] }] }
        ] },
        { type: 'table', rows: [{ cells: [
            { children: [{ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: 'A1' }] }] }] },
            { children: [{ type: 'paragraph', children: [{ type: 'run', children: [{ type: 'text', value: 'B1' }] }] }] }
        ] }] }
    ]
};

console.log(JSON.stringify(text.toText(doc))); // "Hello\tworld\nA1\tB1"
```

### On a read document

```js
const word = runtime.resolve('docx');
const read = word.read(word.write(word.fromText(['First', 'Second'])));
console.log(word.toText(read.document)); // "First\nSecond"
console.log(word.toText === runtime.resolve('docxText').toText); // true
```

## Notes

- Only top-level `paragraph` and `table` nodes of `doc.body` are visited. Other block-level nodes, such as a `blockSdt` (a structured document tag wrapping paragraphs), contribute nothing, and neither does an inline `sdt` inside a paragraph (see [templating](./templating.md) for the SDT model).
- Headers, footers, footnotes, endnotes and comments are separate parts of the read result, not part of `doc.body`: `toText` does not reach them.
- The output is a flat reading of the text, not a layout: formatting, fields, drawings and list numbers are dropped.

## See also

- [docx](./docx.md) — orchestrator (`toText`).
- [docx-walker](./docx-walker.md) — the other module extracted from the orchestrator.
- [docx-structure](./structure.md) — the node types (`paragraph`, `run`, `table`, …).
