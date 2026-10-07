---
module: mdCommon
category: md
dependencies: [htmlEntities, url]
returns: object
worker-safe: true
status: complete
---

# common

> Char codes + HTML entity helpers + URL percent-encoder.

**Module** `mdCommon` | **Source** `packages/front/office/md/src/common.js` | **Deps** `htmlEntities`, `url` | **Worker-safe** yes

Helpers shared by the parsers and renderers. The HTML5 entity table (strict WHATWG) and the CommonMark URL percent-encoder are provided by `@awacloud/fw` (`htmlEntities` and `url.encodeSafe` modules).

## Resolve

```js
import { runtime } from '@awacloud/fw';
import { fw_require, modules } from '@awacloud/md';
runtime.registerAll(fw_require);
runtime.registerAll(modules);

const {
    unescapeString, normalizeURI, escapeXml,
    OPENTAG, CLOSETAG, ESCAPABLE, ENTITY, reHtmlTag,
    C_NEWLINE, C_SPACE, C_BACKTICK /* etc. */
} = runtime.resolve('mdCommon');
```

Or resolve the fw deps and call the factory directly (no runtime needed, since `mdCommon` has no other `@awacloud/md` dependency):

```js
import { mdCommon } from '@awacloud/md';
import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url } from '@awacloud/fw/io/codec/url.js';

const common = mdCommon.factory(htmlEntities.factory(), url.factory());
```

## API

### `src/common.js`

| Export | Signature | Description |
|--------|-----------|-------------|
| `unescapeString` | `(s: string) => string` | Decodes HTML entities + backslash escapes |
| `normalizeURI` | `(uri: string) => string` | CommonMark percent-encode |
| `escapeXml` / `escapeHtml` | `(s: string) => string` | Escapes `&<>"` (`escapeHtml` is an alias of `escapeXml`) |
| `encodeUrl` | `(url: string) => string` | Percent-encodes non-ASCII and unsafe characters of a URL (keeps valid `%HH`) |
| `TAGNAME` | `string` (regex piece) | HTML tag name |
| `OPENTAG` / `CLOSETAG` | `string` (regex piece) | Opening / closing HTML tag |
| `ESCAPABLE` / `ENTITY` | `string` (regex piece) | Backslash-escapable punctuation / HTML entity |
| `reHtmlTag` | `RegExp` | Matches `<tag>`, `</tag>`, comment, PI, CDATA |
| `C_NEWLINE`, `C_SPACE`, `C_TAB`, `C_BANG`, `C_DOUBLEQUOTE`, `C_SINGLEQUOTE`, `C_OPEN_PAREN`, `C_CLOSE_PAREN`, `C_ASTERISK`, `C_COLON`, `C_LESSTHAN`, `C_GREATERTHAN`, `C_OPEN_BRACKET`, `C_BACKSLASH`, `C_CLOSE_BRACKET`, `C_UNDERSCORE`, `C_BACKTICK`, `C_AMPERSAND` | `number` | ASCII char codes (10, 32, 9, …) |

### Helpers delegated to `@awacloud/fw`

Two fw helpers do the heavy lifting: `decodeHtmlStrict` (from `@awacloud/fw/io/text/html-entities.js`, decodes `&amp;`, `&#10;`, `&#xA;`, … against the full WHATWG table) and `encodeSafe` (from `@awacloud/fw/io/codec/url.js`, the CommonMark percent-encode that preserves valid `%HH`).

Neither is a member of what `mdCommon` returns; `common.js` consumes them internally (injected via `mdCommon`'s factory params) to provide `unescapeString` and `normalizeURI`.

## Examples

### Decode an entity

```js
const { unescapeString } = runtime.resolve('mdCommon');
unescapeString('&amp;&#65;\\*'); // '&A*'
```

### Encode a URL

```js
const { normalizeURI } = runtime.resolve('mdCommon');
normalizeURI('https://ex.com/?q=hello world');
// 'https://ex.com/?q=hello%20world'
```

### Char code constant

```js
const { C_BACKTICK } = runtime.resolve('mdCommon');
'`'.charCodeAt(0) === C_BACKTICK; // true
```

## Notes

- The HTML5 entity table is provided by `@awacloud/fw/io/text/html-entities.js` (strict WHATWG form, entries terminated by `;`). No local copy.
- `normalizeURI` is tolerant: on error (malformed URL), returns the input unchanged.
- Char codes are `number`s (result of `charCodeAt`) — no string allocations in the parser's hot loops.
- `reHtmlTag` matches every variant: open-tag, close-tag, comment, processing instruction, declaration, CDATA.

## See also

- [`block/parser`](./block/parser.md) — main consumer of `reHtmlTag`
- [`inline/parser`](./inline/parser.md) — uses `ESCAPABLE`, `ENTITY`, etc.
- [`render/html`](./render/html.md) — keeps its own `escapeHtml` / `encodeUrl` copies on purpose (a worker-safe factory closes only over its own scope)
- [`refs/link-refs`](./refs/link-refs.md) — label normalization
