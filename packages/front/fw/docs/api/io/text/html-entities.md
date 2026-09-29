---
module: htmlEntities
category: io/text
dependencies: []
returns: object
worker-safe: true
status: complete
---

# htmlEntities

> HTML5 entities decoder — strict and lenient, WHATWG-compliant.

**Module** `htmlEntities` | **Source** `packages/front/fw/src/io/text/html-entities.js` | **Deps** none | **Worker-safe** yes

## Resolve

```js
const ent = runtime.resolve('htmlEntities');
// Returns: { decodeHtmlStrict, decodeHtml, decodeCodePoint, HTML5_ENTITIES }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `decodeHtmlStrict` | `(s: string) => string` | Decodes all HTML entity references (semicolon-terminated only). Unknown entities left as-is. |
| `decodeHtml` | `(s: string) => string` | Decodes HTML entities in lenient mode (semicolon optional). |
| `decodeCodePoint` | `(cp: number) => string` | Decodes a numeric code point to a string. Returns U+FFFD for forbidden values. |
| `HTML5_ENTITIES` | `Record<string, string>` | Full WHATWG table — 2,125 semicolon-terminated entries. |

## Examples

```js
const ent = runtime.resolve('htmlEntities');

// Named entities
ent.decodeHtmlStrict('&amp;');          // → '&'
ent.decodeHtmlStrict('&aacute;');       // → 'á'
ent.decodeHtmlStrict('&Alpha;');        // → 'Α'
ent.decodeHtmlStrict('&unknown;');      // → '&unknown;' (unchanged)

// Numeric
ent.decodeHtmlStrict('&#42;');          // → '*'
ent.decodeHtmlStrict('&#x2A;');         // → '*'
ent.decodeHtmlStrict('&#0;');           // → '�' (U+FFFD)
ent.decodeHtmlStrict('&#128;');         // → '€' (Windows-1252 override)

// Lenient (without semicolon)
ent.decodeHtml('&amp');                 // → '&'

// Low level
ent.decodeCodePoint(42);               // → '*'
ent.decodeCodePoint(0xD800);           // → '�' (surrogate)
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const ent = libs.htmlEntities;
        self.postMessage(ent.decodeHtmlStrict(args[0]));
    },
    { dependencies: ['htmlEntities'], args: ['&lt;p&gt;Hello&lt;/p&gt;'] }
);
```

## Notes

- Implements CommonMark §6.2: surrogates (`0xD800`–`0xDFFF`), `&#0;`, and code points > `0x10FFFF` are all replaced by U+FFFD.
- Applies the 27 Windows-1252 remappings defined by the HTML5 spec (e.g. `&#128;` → `€`).
- The WHATWG table (2,125 entries) is loaded once at module level and shared across all factory instances — no memory duplication.
- Strict mode only: semicolon-less forms like `&amp` are not decoded by `decodeHtmlStrict` (use `decodeHtml` for lenient mode).

## See also

- [str](./str.md) — `escapeHTML` for the reverse encoding (encode `<`, `>`, `&`, `"` as HTML entities)
- [unicode](./unicode.md) — Unicode normalization and collation
