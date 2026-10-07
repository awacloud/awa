---
module: mdEmoji
category: md/extra
dependencies: [mdNode, mdAstWalker, mdAstTypes]
returns: object
worker-safe: true
status: complete
---

# mdEmoji

> Shortcode emoji — `:smile:` → 😄 (built-in table, extensible).

**Module** `mdEmoji` | **Source** `packages/front/office/md/src/extra/emoji.js` | **Deps** `mdNode`, `mdAstWalker`, `mdAstTypes` | **Worker-safe** yes

Post-parse AST pass — scans runs of adjacent text nodes and replaces `:name:` matches from the table with the corresponding emoji character. Preserves surrounding text. Table is extensible/replaceable at install time.

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules, extras } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);
runtime.registerAll(extras);

const md      = runtime.resolve('md');
const mdEmoji = runtime.resolve('mdEmoji');
const m = md.createMd().use(mdEmoji);
```

## API

| Export | Signature | Description |
|--------|-----------|--------------|
| `name` | `string` | `'mdEmoji'`, the key `.use()` deduplicates on |
| `install` | `(md, opts?) => void` | Patches `md.parse` and `md.renderHtml`; `opts.table` extends the default table |
| `DEFAULT_EMOJI_TABLE` | `Record<string,string>` | Built-in shortcode table (`Object.keys(DEFAULT_EMOJI_TABLE)` lists it) |
| `expandEmojiInAst` | `(root: Node, table: Record<string,string> \| Map<string,string>) => Node` | Standalone helper; replaces `:code:` in runs of adjacent text nodes and returns `root` |

### Overriding the table

```js
md.use({ name: 'emoji-custom', install(md) {
    mdEmoji.install(md, { table: { coffee: '☕', target: '🎯' } });
}});
// or merge with the default:
mdEmoji.install(md, { table: { ...mdEmoji.DEFAULT_EMOJI_TABLE, custom: '🎯' } });
```

## Examples

### Case 1 — built-in

```js
const md      = runtime.resolve('md');
const mdEmoji = runtime.resolve('mdEmoji');
const m = md.createMd().use(mdEmoji);
m.renderHtml(':rocket: launch :tada:');
// '<p>🚀 launch 🎉</p>\n'
```

### Case 2 — extended table

```js
const m = md.createMd().use({ name: 'e', install(md) {
    mdEmoji.install(md, { table: { custom: '🌟' } });
}});
m.renderHtml(':custom:'); // '<p>🌟</p>\n'
```

### Case 3 — a name holding an underscore

```js
const m = md.createMd().use(mdEmoji);
m.renderHtml(':heart_eyes: and *:fox_face:*');
// '<p>😍 and <em>🦊</em></p>\n'
m.renderHtml(':not_a_real_emoji:');
// '<p>:not_a_real_emoji:</p>\n' — unknown names stay verbatim
```

## Notes

- Built-in shortcodes: emotions (smile, grin, wink, …), weather, hands, food, animals, GitHub aliases (+1, -1, tada, rocket, …).
- Unknown shortcode → left as-is (no replacement). The lookup is a `Map`, so a shortcode named like an `Object.prototype` member (`:constructor:`, `:toString:`, `:valueOf:`, `:hasOwnProperty:`) is a miss too and stays verbatim in the document.
- `expandEmojiInAst(root, table)` accepts a plain object or a `Map` as `table` and returns `root`.
- Match pattern: `/:[a-z0-9_+\-]+:/g` — strict (no Unicode in the shortcode).
- Shortcodes are matched over runs of adjacent text nodes, not node by node. The inline parser splits a name holding `_` or `-` into several text nodes (`:heart_eyes:` arrives as `:heart`, `_`, `eyes:`), so scanning each node alone would miss it; the joined run expands, which keeps the underscore-bearing defaults (`heart_eyes`, `fox_face`, `white_check_mark`, …) working. Emphasis that actually formed is a boundary: in `_x_ :fox_face:` the `<em>` is kept and only the text after it is scanned.
- Adjacent `:` (`::name::`) are treated as two consecutive shortcodes.

## See also

- [`mdWikilinks`](./wikilinks.md) — another post-walk extra
- [`mdHighlight`](./highlight.md)
- [Extending](../../guide/extending.md)
