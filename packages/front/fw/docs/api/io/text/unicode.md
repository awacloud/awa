---
module: unicode
category: io/text
dependencies: []
returns: object
worker-safe: true
status: complete
---

# unicode

> Native Unicode helpers — normalization, casefold, collation, grapheme clusters, width, strip diacritics.

**Module** `unicode` | **Source** `packages/front/fw/src/io/text/unicode.js` | **Deps** none | **Worker-safe** yes

Everything delegated to `String.prototype` and `Intl.*` — no embedded custom tables.

## Resolve

```js
const unicode = runtime.resolve('unicode');
// Returns: { normalize, casefold, compare, collator, graphemes, width, stripDiacritics }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `normalize` | `(str: string, form?: string) => string` | NFC/NFD/NFKC/NFKD |
| `casefold` | `(str: string, locale?: string) => string` | Lowercase locale-aware |
| `compare` | `(a, b, options?) => number` | One-shot Intl.Collator.compare |
| `collator` | `(options?) => {compare, sort}` | Reusable collator |
| `graphemes` | `(str: string) => Iterator<string>` | Grapheme clusters via Intl.Segmenter |
| `width` | `(str: string) => number` | Visual width (ASCII=1, CJK=2) |
| `stripDiacritics` | `(str: string) => string` | Removes diacritic marks |

## Examples

### Normalization

```js
const unicode = runtime.resolve('unicode');

unicode.normalize('café', 'NFD').length; // 5 (e + combining)
unicode.normalize('café', 'NFC').length; // 4 (precomposed)

unicode.stripDiacritics('café');    // 'cafe'
unicode.stripDiacritics('Ångström'); // 'Angstrom'
```

### Collation and sorting

```js
const coll = unicode.collator({ numeric: true });
coll.sort(['a10', 'a2', 'a1']); // ['a1', 'a2', 'a10']

unicode.compare('é', 'e', { sensitivity: 'base' }); // 0 (equivalent)
```

### Grapheme clusters

```js
[...unicode.graphemes('👨‍👩‍👧')].length; // 1 (single family unit)
unicode.width('日本');  // 4 (2 CJK × 2)
unicode.width('hello'); // 5
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        return libs.unicode.stripDiacritics(args[0]);
    },
    { dependencies: ['unicode'], args: ['café'] }
);
```

## Notes

- `graphemes` uses `Intl.Segmenter` if available; falls back to code points (ZWJ sequences not merged).
- `width` is heuristic — for exact console rendering, refer to the official EastAsianWidth tables.
- `stripDiacritics` does not translate `ß` → `ss` (Unicode decomposition does not decompose ß).
- `normalize` throws if `str` is not a string.

## See also

- [str](./str.md) — slug and case conversions (uses unicode)
- [i18n](../i18n/i18n.md) — locale-aware formatting
