---
module: str
category: io/text
dependencies: [unicode]
returns: object
worker-safe: true
status: complete
---

# str

> String utilities — case conversions, slug, truncate, pad, format, escapeHTML, similarity.

**Module** `str` | **Source** `packages/front/fw/src/io/text/str.js` | **Deps** `unicode` | **Worker-safe** yes

## Resolve

```js
const str = runtime.resolve('str');
// Returns: { splitWords, camelCase, pascalCase, kebabCase, snakeCase, constantCase, titleCase,
//             slug, truncate, pad, format, escapeRegExp, escapeHTML, similarity }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `splitWords` | `(s: string) => string[]` | Split on case transitions + separators |
| `camelCase` | `(s: string) => string` | `helloWorld` |
| `pascalCase` | `(s: string) => string` | `HelloWorld` |
| `kebabCase` | `(s: string) => string` | `hello-world` |
| `snakeCase` | `(s: string) => string` | `hello_world` |
| `constantCase` | `(s: string) => string` | `HELLO_WORLD` |
| `titleCase` | `(s: string) => string` | `Hello World` |
| `slug` | `(s: string, options?) => string` | URL slug |
| `truncate` | `(s: string, length: number, options?) => string` | Smart truncation |
| `pad` | `(s: string, length: number, char?, side?) => string` | Padding |
| `format` | `(template: string, params: object) => string` | `{key}` interpolation |
| `escapeRegExp` | `(s: string) => string` | Escapes regex metacharacters |
| `escapeHTML` | `(s: string) => string` | `& < > " '` → entities |
| `similarity` | `(a: string, b: string) => number` | Normalized Levenshtein `[0..1]` |

### Options `slug`

| Option | Default | Description |
|--------|---------|-------------|
| `separator` | `'-'` | Separator between words |
| `lower` | `true` | Lowercase |

### Options `truncate`

| Option | Default | Description |
|--------|---------|-------------|
| `suffix` | `'…'` | Suffix (included in `length`) |
| `wordBoundary` | `true` | Cut on word boundary |

### Options `pad`

| Option | Default | Description |
|--------|---------|-------------|
| `char` | `' '` | Padding character |
| `side` | `'left'` | `'left'` \| `'right'` \| `'both'` |

## Examples

### Case conversions

```js
const str = runtime.resolve('str');

str.camelCase('hello-world');   // 'helloWorld'
str.kebabCase('helloWorld');    // 'hello-world'
str.snakeCase('Hello World');   // 'hello_world'
str.constantCase('helloWorld'); // 'HELLO_WORLD'

// All idempotent
str.kebabCase(str.kebabCase('Hello World')); // 'hello-world'
```

### Slug

```js
str.slug('Café & Crème !');           // 'cafe-creme'
str.slug('Hello World', { separator: '_', lower: false }); // 'Hello_World'
```

### Truncate

```js
str.truncate('A long sentence here', 10);                         // 'A long…'
str.truncate('A long sentence', 10, { wordBoundary: false });     // 'A long se…' (total ≤ 10)
str.truncate('Hi', 20);                                           // 'Hi' (no-op)
```

### Escape + format

```js
str.escapeHTML('<script>alert("xss")</script>');
// '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'

str.format('Hello {name}, age {age}', { name: 'Alice', age: 30 });
// 'Hello Alice, age 30'

str.escapeRegExp('a.b*c'); // 'a\\.b\\*c'
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        return libs.str.slug(args[0]);
    },
    { dependencies: ['str'], args: ['Café & Crème !'] }
);
```

## Notes

- All case conversions are idempotent (apply 2× = apply 1×).
- `slug` on a string with no usable ASCII (e.g. CJK only) returns `''`.
- `truncate`: `length` is the **total** max (suffix included) — `truncate(s, 8)` gives at most 8 chars.
- `similarity`: O(n×m) Levenshtein — avoid on very long strings in production.
- `escapeHTML` covers `& < > " '` — does not protect attributes without quotes.

## See also

- [unicode](./unicode.md) — `stripDiacritics` and `casefold` used by `slug`
- [i18n](../i18n/i18n.md) — interpolation with plurals and locale fallback
