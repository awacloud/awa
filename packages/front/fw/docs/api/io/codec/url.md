---
module: url
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# url

> Robust querystring parsing/serialization + URL helpers + CommonMark encoder. Complement to native `URLSearchParams` (which handles neither structured arrays nor nested objects).

**Module** `url` | **Source** `packages/front/fw/src/io/codec/url.js` | **Deps** none | **Worker-safe** yes

**Why not just `URLSearchParams`**:
- Returns only strings, not arrays or structured objects.
- No support for `a[]=1&a[]=2` (brackets), `a[0]=1` (indices), or `a=1,2` (comma).
- No nested parsing `user[name]=Alice`.
- No `sort` or `skipNull` option.

`url.parseURL` / `url.buildURL` use the native `URL` under the hood — they are simple wrappers that add the decomposed query and a symmetric API for building URLs.

## Resolve

```js
const url = runtime.resolve('url');
// Returns: { parseQuery, stringifyQuery, parseURL, buildURL, encodeSafe, decodeSafe }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parseQuery` | `(str: string, options?) => Object` | Object from querystring |
| `stringifyQuery` | `(obj: Object, options?) => string` | Querystring (without leading `?`) |
| `parseURL` | `(str: string, base?: string) => URLParts` | Decomposed URL + parsed `.query` |
| `buildURL` | `(parts: Object) => string` | Reconstructed URL |
| `encodeSafe` | `(s: string, options?) => string` | URI encoded CommonMark / mdurl@2 style |
| `decodeSafe` | `(s: string) => string` | Best-effort percent decoding (fail-soft) |

### `encodeSafe` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `safe` | `string` | `";/?:@&=+$,-_.!~*'()#"` | ASCII characters to leave verbatim (in addition to alphanumerics) |

### `parseQuery` / `stringifyQuery` options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `arrayFormat` | `'repeat'`, `'brackets'`, `'indices'`, `'comma'`, `'none'` | `'repeat'` | Array form (see table below) |
| `nested` | `boolean` | `false` | Support `a[b]=v` → nested object |
| `space` | `'percent'`, `'plus'` | `'percent'` | `+` = space (`'plus'`, HTML form compat) or literal |
| `delimiter` | `string` | `'&'` | Pair separator |
| `skipNull` | `boolean` (stringify) | `false` | Omit `null`/`undefined` entries |
| `sort` | `boolean` (stringify) | `false` | Lexicographic key sort |

### Array formats

| arrayFormat | Example | Use case |
|-------------|---------|----------|
| `'repeat'` | `a=1&a=2` | W3C form standard, Express `req.query` |
| `'brackets'` | `a[]=1&a[]=2` | PHP, Rails, qs-compat |
| `'indices'` | `a[0]=1&a[1]=2` | PHP, explicit order |
| `'comma'` | `a=1,2` | Swagger/OpenAPI, compact APIs |
| `'none'` | `a=1&a=2` → `a:'2'` | Strict 1-to-1 (last wins) |

## JS ↔ querystring mapping (stringify)

| Value | Output |
|-------|--------|
| `string`, `number`, `boolean`, `bigint` | URI-encoded decimal form |
| `null` | key emitted with empty value (`a=`) |
| `undefined` | pair omitted |
| `Date` | ISO 8601 (`.toISOString()`) |
| `Array` | per `arrayFormat` |
| `Object` | per `nested` (otherwise `[object Object]`) |

## Examples

### Basic

```js
const url = runtime.resolve('url');

url.parseQuery('a=1&b=2');
// { a: '1', b: '2' }

url.stringifyQuery({ q: 'hello world', page: 2 });
// 'q=hello%20world&page=2'
```

### Arrays

```js
// Repeat (default)
url.parseQuery('tag=js&tag=web');
// { tag: ['js', 'web'] }

// Brackets (PHP/qs)
url.parseQuery('tag[]=js&tag[]=web', { arrayFormat: 'brackets' });
// { tag: ['js', 'web'] }

// Indices
url.parseQuery('tag[0]=js&tag[1]=web', { arrayFormat: 'indices' });
// { tag: ['js', 'web'] }

// Comma
url.parseQuery('tags=js,web,ts', { arrayFormat: 'comma' });
// { tags: ['js', 'web', 'ts'] }
```

### Nested objects

```js
url.parseQuery('user[name]=Alice&user[age]=30', { nested: true });
// { user: { name: 'Alice', age: '30' } }

url.stringifyQuery({ user: { name: 'Alice', age: 30 } }, { nested: true });
// 'user%5Bname%5D=Alice&user%5Bage%5D=30'

// Mix with arrays
url.parseQuery('user[tags][]=a&user[tags][]=b', { arrayFormat: 'brackets' });
// { user: { tags: ['a', 'b'] } }
```

### Spaces: `+` vs `%20`

```js
// HTML form (application/x-www-form-urlencoded)
url.parseQuery('q=hello+world', { space: 'plus' });
// { q: 'hello world' }

url.stringifyQuery({ q: 'hello world' }, { space: 'plus' });
// 'q=hello+world'

// Generic URI query (default)
url.stringifyQuery({ q: 'hello world' });
// 'q=hello%20world'
```

### skipNull / sort

```js
url.stringifyQuery({ b: 2, a: 1, c: null }, { sort: true, skipNull: true });
// 'a=1&b=2'
```

### URL helpers

```js
const u = url.parseURL('https://user:pass@example.com:8080/api/users?id=5&tag=new#top');
// {
//   protocol: 'https:', username: 'user', password: 'pass',
//   hostname: 'example.com', port: '8080', host: 'example.com:8080',
//   pathname: '/api/users',
//   search: '?id=5&tag=new', hash: '#top',
//   origin: 'https://example.com:8080',
//   href: 'https://user:pass@example.com:8080/api/users?id=5&tag=new#top',
//   query: { id: '5', tag: 'new' }      // ← decomposed
// }

// Relative resolution via `base`
url.parseURL('/api/users', 'https://example.com');
// .href === 'https://example.com/api/users'

// Inverse construction
url.buildURL({
    protocol: 'https',
    hostname: 'example.com',
    pathname: '/api/search',
    query: { q: 'foo bar', lang: 'fr' }
});
// 'https://example.com/api/search?q=foo%20bar&lang=fr'
```

### `encodeSafe` / `decodeSafe`

```js
const url = runtime.resolve('url');

// Encodes a URI CommonMark-style — space → %20, characters outside the safe-set encoded
url.encodeSafe('http://example.com/?q=foo bar');
// → 'http://example.com/?q=foo%20bar'

// UTF-8 multi-byte
url.encodeSafe('Café');
// → 'Caf%C3%A9'

// Valid %HH → pass-through (no double-encoding)
url.encodeSafe('http://x.com/%20foo');
// → 'http://x.com/%20foo'

// Invalid %HH → re-encoded
url.encodeSafe('http://x.com/%G1');
// → 'http://x.com/%25G1'

// Custom safe-set
url.encodeSafe('foo bar', { safe: 'ABCabc' });
// → 'foo%20bar'

// Surrogate pair (emoji) → full UTF-8
url.encodeSafe('🎉');
// → '%F0%9F%8E%89'

// Lone surrogate → U+FFFD encoded
url.encodeSafe('\uD800');
// → '%EF%BF%BD'

// Symmetric best-effort decoder
url.decodeSafe('Caf%C3%A9');
// → 'Café'

// Fail-soft: invalid sequence returned as-is
url.decodeSafe('%G1');
// → '%G1'
```

## Why not native `encodeURI`

`encodeURI` is similar but has important differences for markup usage (HTML / RSS / Markdown / Org-mode):

| Character | `encodeURI` | `encodeSafe` (CommonMark) |
|-----------|-------------|--------------------------|
| `[` `]` | preserved | encoded (`%5B` `%5D`) |
| `<` `>` | preserved | encoded (`%3C` `%3E`) |
| space | `%20` | `%20` |
| valid `%HH` | double-encoded | pass-through |
| invalid `%HH` | left as-is | `%` → `%25` |
| lone surrogate | error \| `%EF%BF%BD` | `%EF%BF%BD` |

`encodeURIComponent` is too strict: it encodes `/`, `:`, `@`, `&`, `=`, `+`, `$`, `,` — unsuitable for complete URLs.

`encodeSafe` faithfully implements the `mdurl@2` algorithm used by `markdown-it`, guaranteeing CommonMark compatibility without regression.

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [qs] = args;
        const parsed = libs.url.parseQuery(qs, { nested: true });
        self.postMessage(parsed);
    },
    { dependencies: ['url'], args: ['user[name]=Alice&user[age]=30'] }
);
```

## Notes

- Keys and values are percent-decoded/encoded via native `encodeURIComponent` / `decodeURIComponent`. An invalid decode (`%ZZ`) returns the raw string (fail-soft).
- `arrayFormat: 'comma'` does **not** encode the `,` separator (common practice, compatible with OpenAPI `form` style). If values contain literal commas, use a different format.
- `nested` is additive to `arrayFormat: brackets/indices` — both rely on the `[...]` notation in the key.
- `parseURL` delegates to the native `URL` when available (browsers + workers + modern bun/node); a regex fallback exists for ultra-minimal environments.
- `buildURL` accepts `query` as an object **or** a string (e.g. an already-serialized query).
- Duplicate keys in `'none'` mode: the last one wins. In array modes, all occurrences are collected.
- `encodeSafe` faithfully reproduces the `mdurl@2` (CommonMark) algorithm: default safe-set `";/?:@&=+$,-_.!~*'()#"`, pass-through of valid `%HH`, re-encoding of invalid `%`, surrogates → U+FFFD. Worker-safe (no DOM or side-effects).
- `decodeSafe` is a fail-soft wrapper on `decodeURIComponent`: invalid sequences are returned as-is rather than throwing an exception.

## See also

- [csv](./csv.md) — another structured text codec
- [mime](./mime.md) — HTTP headers (body-side counterpart)
- [utf8](./utf8.md) — bytes ↔ string conversion when needed
