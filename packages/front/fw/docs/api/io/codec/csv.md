---
module: csv
category: io/codec
dependencies: []
returns: object
worker-safe: true
status: complete
---

# csv

> CSV import/export (RFC 4180) for tabular data. Text API — compose with `utf8` for byte I/O.

**Module** `csv` | **Source** `packages/front/fw/src/io/codec/csv.js` | **Deps** none | **Worker-safe** yes

**Default dialect**: `,` delimiter, quote-doubling for escaping, `\r\n` line separator on output. The parser is tolerant: accepts LF, CR, CRLF, optional UTF-8 BOM, optional trailing newline. Custom dialects (TSV, semicolon-CSV, etc.) via `delimiter`/`quote`/`newline`.

## Resolve

```js
const csv = runtime.resolve('csv');
// Returns: { parse, stringify }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `parse` | `(text: string, options?) => any[][] \| Object[]` | Array of rows (array mode) or objects (header mode) |
| `stringify` | `(data: Array<Array\|Object>, options?) => string` | CSV text terminated by `newline` |

### `parse` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delimiter` | `string` (1 char) | `','` | Field separator (`'\t'` for TSV, `';'` for EU-CSV). |
| `quote` | `string` (1 char) | `'"'` | Quote character (RFC 4180 doubling rule). |
| `header` | `boolean \| string[]` | `false` | `true`: consumes the first row as field names → `Object[]`. `string[]`: uses those names and keeps all rows. |
| `skipEmpty` | `boolean` | `true` | Skip empty rows. |
| `trim` | `boolean` | `false` | Trim whitespace around **unquoted** fields. |
| `cast` | `boolean` | `false` | Auto-detect numeric / boolean / `null`. |
| `comment` | `string \| null` | `null` | Comment-line start character to skip. |
| `skipLines` | `number` | `0` | Skip the first N lines (after blank/comment). |

### `stringify` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delimiter` | `string` | `','` | Field separator. |
| `quote` | `string` | `'"'` | Quote character. |
| `newline` | `string` | `'\r\n'` | Line separator. |
| `header` | `boolean \| string[]` | auto | Object mode: `false` suppresses the header, `string[]` forces column order. Array mode: `string[]` emits that header before the rows. |

## JS ↔ CSV mapping (stringify)

| JS value | Output |
|----------|--------|
| `string` | as-is (quoted if contains delimiter/quote/`\r`/`\n`) |
| `number`, `boolean`, `bigint` | decimal representation |
| `null`, `undefined` | empty field |
| `Date` | ISO 8601 (`toISOString`) |

## Examples

### Array mode (default)

```js
const csv = runtime.resolve('csv');

csv.parse('a,b,c\n1,2,3');
// [['a','b','c'], ['1','2','3']]

csv.stringify([['a','b'], [1, 2]]);
// 'a,b\r\n1,2\r\n'
```

### Header mode (objects)

```js
csv.parse('name,age\nAlice,30\nBob,25', { header: true, cast: true });
// [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]

csv.stringify([
    { name: 'Alice', age: 30 },
    { name: 'Bob',   age: 25 }
]);
// 'name,age\r\nAlice,30\r\nBob,25\r\n'

// Explicit column order
csv.stringify(data, { header: ['age', 'name'] });

// Suppress header
csv.stringify(data, { header: false });
```

### Quoted fields and special characters

```js
// Delimiter, quote, or line break in a field → automatic quoting
csv.stringify([['a,b', 'say "hi"', 'line\nbreak']]);
// '"a,b","say ""hi""","line\nbreak"\r\n'

// Symmetric parse
csv.parse('"a,b","say ""hi""","line\nbreak"');
// [['a,b', 'say "hi"', 'line\nbreak']]
```

### Automatic casting

```js
csv.parse('1,2.5,true,false,null,foo', { cast: true });
// [[1, 2.5, true, false, null, 'foo']]

// Integers outside the safe range remain as strings (no precision loss)
csv.parse('12345678901234567890', { cast: true });
// [['12345678901234567890']]
```

### Dialectes custom

```js
// TSV
csv.parse('a\tb\n1\t2', { delimiter: '\t' });

// EU-CSV (semicolon)
csv.parse('a;b;c\n1;2;3', { delimiter: ';' });

// Sortie LF-only (Unix)
csv.stringify(data, { newline: '\n' });
```

### File with preamble / comments

```js
const text = `# exported 2024-01-01
# version 2
name,age
Alice,30`;

csv.parse(text, { header: true, comment: '#' });
// [{ name: 'Alice', age: '30' }]
```

### Pre-supplied header (no header row in the file)

```js
csv.parse('1,2\n3,4', { header: ['x', 'y'] });
// [{ x: '1', y: '2' }, { x: '3', y: '4' }]
```

## Worker Usage

```js
const worker = fw.createWorker(
    function ({ libs, args }) {
        const [text] = args;
        const rows = libs.csv.parse(text, { header: true, cast: true });
        self.postMessage(rows);
    },
    { dependencies: ['csv'], args: [csvText] }
);
```

## Notes

- **Text** API — to read/write files, compose with `utf8` (`utf8.fromBytes` / `utf8.toBytes`) or the browser Blob API.
- The parser tolerates all three line-ending variants (LF, CR, CRLF) mixed within the same file; the encoder always uses `\r\n` by default (RFC 4180).
- UTF-8 BOM (`\uFEFF`) at the start is automatically stripped during parsing.
- `trim: true` **never** modifies a quoted field: trimming is only applied to unquoted fields to preserve the semantics of the original data.
- Unterminated quoted field at end of stream → **throw** (`csv: unterminated quoted field`).
- `delimiter` and `quote` must be exactly 1 character (RFC constraint) — otherwise throws.
- `cast` does not coerce very large integers to `Number` (loss of precision): they remain as strings. For financial parsing / identifiers, use `cast: false` and convert explicitly to `BigInt`.
- In object mode, `stringify` reads the keys of the **first** object to determine the header; subsequent objects missing a key receive an empty field. For deterministic ordering, pass `header: string[]`.

## See also

- [utf8](./utf8.md) — to convert CSV text to bytes (`utf8.toBytes(csv.stringify(data))`)
- [cbor](./cbor.md), [msgpack](./msgpack.md) — binary alternatives for structured data
