---
module: wmlFields
category: extra
dependencies: []
returns: object
worker-safe: true
status: complete
---

# wmlFields

> WML — field-instruction tokenizer + catalogue of the standard Word field types.

**Module** `wmlFields` | **Source** `packages/front/office/ooxml/src/extra/wml-fields.js` | **Deps** none | **Worker-safe** yes

A pure-JS helper to inspect / build `<w:fldSimple w:instr="…"/>` and `<w:instrText>` field instruction strings: tokenises the instruction, then either a generic untyped parse or a per-field-type typed parse/render (29 catalogued field codes).

## Resolve

```js
const fields = wmlFields.factory();
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `tokenize` | `(instr: string) => Token[]` | `{kind: 'word'\|'string'\|'switch', value}[]` |
| `parseInstruction` | `(instr: string) => {type, args, switches}` | generic parse (untyped `switches` object) |
| `renderInstruction` | `(parsed) => string` | inverse of `parseInstruction` |
| `parseTyped` | `(instr: string) => Field` | tokenizes then dispatches to the matching `KNOWN_FIELDS[type].parse`; falls back to the generic shape for an unknown type |
| `renderTyped` | `(field) => string` | dispatches to `KNOWN_FIELDS[field.type].render`; falls back to `renderInstruction` |
| `KNOWN_FIELDS` | `Record<string, {parse, render}>` | per-type typed parse/render pair: `PAGE`, `NUMPAGES`, `SECTION`, `SECTIONPAGES`, `DATE`, `TIME`, `CREATEDATE`, `SAVEDATE`, `PRINTDATE`, `MERGEFIELD`, `HYPERLINK`, `IF`, `INCLUDETEXT`, `INCLUDEPICTURE`, `REF`, `STYLEREF`, `TOC`, `INDEX`, `XE`, `RD`, `EQ`, `ASK`, `FILLIN`, `SET`, `BIDIOUTLINE`, `AUTHOR`, `TITLE`, `SUBJECT`, `KEYWORDS`, `FILENAME`, `FILESIZE` |
| `FIELD_NAMES` | `Set<string>` | `new Set(Object.keys(KNOWN_FIELDS))` — the catalogue as a name set |

## Roundtrip example

```js
const fields = wmlFields.factory();
fields.parseTyped('MERGEFIELD CustomerName \\* MERGEFORMAT');
// → { type:'MERGEFIELD', fieldName:'CustomerName', mergeFormat:true, otherSwitches:{} }

fields.renderTyped({ type:'PAGE', switches: { '\\*': 'Arabic' } });
// → 'PAGE \\* Arabic'
```

## Notes

- The tokenizer respects double-quoted arguments (`"Last name"`) and escaped quotes.
- Unknown field types still tokenise via `parseInstruction`/`parseTyped` (which falls back to the generic shape) — `FIELD_NAMES` is purely informational.

## See also

- [docxStructure](../docx/structure.md) — field runs are emitted via `fldSimple` / `instrText`
