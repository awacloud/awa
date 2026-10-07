---
module: blockParser
category: md/block
dependencies: [mdErrors, mdNode, mdAstTypes, refsLinkRefs, mdBlockHtmlPatterns, mdBlockLinkRef, mdBlockListData, mdBlockTable, mdBlockTaskList, mdBlockTypes, mdBlockStarts, mdBlockCursor]
returns: object
worker-safe: true
status: complete
---

# block/parser

> CommonMark 0.31 block-phase parser — paragraphs, lists, GFM tables, link refs.

**Module** `blockParser` | **Source** `packages/front/office/md/src/block/parser.js` | **Deps** `mdErrors`, `mdNode`, `mdAstTypes`, `refsLinkRefs`, `mdBlockHtmlPatterns`, `mdBlockLinkRef`, `mdBlockListData`, `mdBlockTable`, `mdBlockTaskList`, `mdBlockTypes`, `mdBlockStarts`, `mdBlockCursor` | **Worker-safe** yes

The block-structure phase of parsing (CommonMark appendix "A parsing strategy"): tokenizes the text line by line into blocks (CommonMark §4) — paragraphs, headings, thematic breaks, code blocks, HTML blocks, block quotes, lists, tables (GFM). Detects and extracts link reference definitions at finalize time. **Inline parsing is delegated** to `inlineParser` via the `inlineParser` hook passed in options.

`blockParser` is a pure orchestrator over the sibling `mdBlock*` sub-modules, each promoted to its own factory descriptor and listed above as a dependency (`mdBlockHtmlPatterns`, `mdBlockLinkRef`, `mdBlockListData`, `mdBlockTable`, `mdBlockTaskList`, `mdBlockTypes`, `mdBlockStarts`, `mdBlockCursor`).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const bp = runtime.resolve('blockParser');
// { parse }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(text: string, opts?) => {document, refmap}` | AST root + link refs map |

### `parse` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inlineParser` | `(blockNode, refmap) => void` | none | Hook called on each paragraph / heading / table-cell to parse inlines |

`parse` reads no other option: every block node carries a `sourcepos` already, and the inline `sourcepos` / `smart` / `extendedAutolinks` options belong to the [inline parser](../inline/parser.md) (bound through `md.createMd(opts)`).

## Examples

### Standalone (without an inline parser)

```js
const bp = runtime.resolve('blockParser');
const { document, refmap } = bp.parse('# Hi\n\n[foo]: /url');
document.firstChild.type;            // 'heading'
refmap.FOO.destination;              // '/url'
```

### Wired with the inline parser (the `md.js` pattern)

```js
const bp = runtime.resolve('blockParser');
const ip = runtime.resolve('inlineParser');
const { document } = bp.parse('# Hi *there*', { inlineParser: ip.parse });
```

## Notes

- Link reference definitions are detected while finalizing paragraphs — not in the inline phase (per spec §4.7).
- Full lazy-continuation handling: a paragraph can continue across multiple lines even inside block quotes / list items.
- GFM tables are parsed if the line following the header is a valid separator row (`| --- | :--- | ---: |`).
- The parser is split into this orchestrator plus the `mdBlock*` sub-modules listed above as dependencies.

## See also

- [`inline/parser`](../inline/parser.md) — the inline phase, wired via options
- [`refs/link-refs`](../refs/link-refs.md) — map exposed on `document.data.refmap`
- [`ast/types`](../ast/types.md) — produced types
- [`md`](../md.md) — full wiring with inline
