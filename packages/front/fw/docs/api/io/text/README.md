# IO / Text

Text helpers: Unicode, string manipulation.

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [ansi](./ansi.md) | `{parser, sgr, cursor, clear, osc}` | none | ANSI / VT100 / xterm parser + serialiser (CSI, OSC, SGR, cursor) |
| [semver](./semver.md) | `{valid, parse, compare, satisfies, maxSatisfying, range}` | none | Validation, parsing and range matching for strict semver 2.0.0 |
| [str](./str.md) | `{camelCase, slug, truncate, ...}` | `unicode` | Case conversions, slug, truncate, format, similarity |
| [unicode](./unicode.md) | `{normalize, casefold, compare, collator, graphemes, width, stripDiacritics}` | none | Normalization + collation + graphemes |
| [htmlEntities](./html-entities.md) | `{decodeHtmlStrict, decodeHtml, decodeCodePoint, HTML5_ENTITIES}` | none | WHATWG HTML5 entities decoder (2,125 entries, CommonMark §6.2) |

## Common pattern

```js
const unicode = runtime.resolve('unicode');
unicode.normalize('café', 'NFC');
unicode.stripDiacritics('café'); // 'cafe'

const str = runtime.resolve('str');
str.slug('Café & Crème!'); // 'cafe-creme'
str.camelCase('hello world'); // 'helloWorld'
```
