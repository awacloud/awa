---
module: mdAstTypes
category: md/ast
dependencies: []
returns: object
worker-safe: true
status: complete
---

# ast/types

> AST type constants + container helpers.

**Module** `mdAstTypes` | **Source** `packages/front/office/md/src/ast/types.js` | **Deps** none | **Worker-safe** yes

Enumerates every allowed value for `node.type`. Compatible with the CommonMark XML format (`cmark --to xml`) — names are identical. Also includes the extras' types (math, footnotes, …).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const t = runtime.resolve('mdAstTypes');
// { isContainer, T_DOCUMENT, T_PARAGRAPH, …, BLOCK_CONTAINERS, INLINE_CONTAINERS }
```

## API

### Constants

| Family | Constants |
|--------|-----------|
| Core blocks | `T_DOCUMENT`, `T_PARAGRAPH`, `T_HEADING`, `T_THEMATIC_BREAK`, `T_CODE_BLOCK`, `T_HTML_BLOCK`, `T_BLOCK_QUOTE`, `T_LIST`, `T_ITEM` |
| GFM tables | `T_TABLE`, `T_TABLE_ROW`, `T_TABLE_CELL` |
| Core inlines | `T_TEXT`, `T_SOFTBREAK`, `T_LINEBREAK`, `T_CODE`, `T_EMPH`, `T_STRONG`, `T_LINK`, `T_IMAGE`, `T_HTML_INLINE` |
| GFM inline | `T_STRIKETHROUGH` |
| Extras | `T_MATH_INLINE`, `T_MATH_BLOCK`, `T_FOOTNOTE_REF`, `T_FOOTNOTE_DEF`, `T_ADMONITION`, `T_HIGHLIGHT`, `T_SUBSCRIPT`, `T_SUPERSCRIPT` |

### Sets

| Set | Contents |
|-----|----------|
| `BLOCK_CONTAINERS` | `document`, `block_quote`, `list`, `item`, `table`, `table_row`, `admonition`, `footnote_def` |
| `INLINE_CONTAINERS` | `paragraph`, `heading`, `emph`, `strong`, `link`, `image`, `strikethrough`, `table_cell`, `highlight`, `subscript`, `superscript` |

### Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `isContainerType` / `isContainer` | `(type: string) => boolean` | True if the type can have children |

## Examples

### Container test

```js
const t = runtime.resolve('mdAstTypes');
t.isContainer('paragraph');     // true
t.isContainer('text');          // false
t.isContainer('thematic_break'); // false
```

### Switch by type

```js
const { T_HEADING, T_PARAGRAPH } = runtime.resolve('mdAstTypes');
const node = runtime.resolve('md').parse('# Hi').firstChild;
switch (node.type) {
    case T_HEADING: /* … */ break;
    case T_PARAGRAPH: /* … */ break;
}
```

## Notes

- The `extra/*` types are declared here even though the core doesn't produce them — this lets extensions use them in a centralized way.
- `table`, `table_row` and `admonition`, `footnote_def` are special block-containers (table-row holds table-cells, which are inline-containers).
- Set ordering is not significant (use `.has()` for checks).

## See also

- [`ast/node`](./node.md) — uses `isContainerType` via the getter
- [`render/xml`](../render/xml.md) — emits type names as XML elements
- [`extra/`](../extra/README.md) — producer of the extra types
