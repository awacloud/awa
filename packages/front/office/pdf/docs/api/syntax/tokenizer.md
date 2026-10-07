---
module: pdfTokenizer
category: pdf/syntax
dependencies: [pdfErrors, pdfShared]
returns: object
worker-safe: true
status: complete
---

# pdfTokenizer

> Binary lexer, ISO 32000-2 §7.2 — bytes → token stream.

**Module** `pdfTokenizer` | **Source** `packages/front/office/pdf/src/syntax/tokenizer.js` | **Deps** `pdfErrors`, `pdfShared` | **Worker-safe** yes

Emits `{ kind, value?, offset, end }` tokens for the PDF lexical conventions.
The tokenizer is **stream-aware at the keyword level**: when it emits
`{ kind: 'kw', value: 'stream' }`, the consumer skips the binary payload itself
(using the preceding dictionary's `/Length`) and then resumes at `endstream`.

## Resolve

```js
const tokMod = runtime.resolve('pdfTokenizer');
// Returns: { tokenize, lastIndexOfBytes }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `tokenize` | `(bytes: Uint8Array, opts?: { keepWhitespace?, start?, end? }) => Tokenizer` | Iterator (`next`, `peek`, `pos`, `seek`, `bytes`). |
| `lastIndexOfBytes` | `(bytes: Uint8Array, needle: Uint8Array, from?: number) => number` | Offset (or `-1`) of the last match. |

### Token kinds

| `kind` | Payload |
|--------|---------|
| `ws` | whitespace run (only when `keepWhitespace`) |
| `comment` | comment body (bytes between `%` and EOL) |
| `name` | `value: string` (`#xx` escapes decoded) |
| `int` / `real` | `value: number`, `raw: string` |
| `string` | `value: Uint8Array` — literal `(...)` form only |
| `hex` | `value: Uint8Array` — hex `<...>` form |
| `open_arr` / `close_arr` | `[` / `]` |
| `open_dict` / `close_dict` | `<<` / `>>` |
| `kw` | `value: string` (`obj`, `endobj`, `R`, `stream`, `endstream`, `xref`, `trailer`, `startxref`, `true`, `false`, `null`, `n`, `f`) |
| `eof_marker` | `%%EOF` |

### Tokenizer interface

| Member | Description |
|--------|-------------|
| `next()` | Consumes and returns the next token (or `null` at EOF). |
| `peek()` | Looks ahead without consuming. |
| `pos()` | Current offset. |
| `seek(n)` | Forces the offset (used after skipping a stream body). |
| `bytes` | Reference to the source `Uint8Array`. |

## Examples

### Iterating a stream

```js
const tok = tokMod.tokenize(bytes);
let t;
while ((t = tok.next())) {
    if (t.kind === 'kw' && t.value === 'xref') break;
}
```

### Locating `startxref` by backward scan

```js
const needle = new Uint8Array([0x73,0x74,0x61,0x72,0x74,0x78,0x72,0x65,0x66]);
const at = tokMod.lastIndexOfBytes(bytes, needle);
```

### Starting from a known offset

```js
const tok = tokMod.tokenize(bytes, { start: 12345 });
tok.next();   // first token at or after 12345
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/tokenizer/bad-input` | `ParseError` | `bytes` is not a `Uint8Array`. |
| `pdf/tokenizer/bad-seek` | `ParseError` | `seek(n)` out of range. |
| `pdf/tokenizer/bad-name-escape` | `ParseError` | `#xx` truncated or non-hex. |
| `pdf/tokenizer/bad-number` | `ParseError` | Empty or unparsable numeric token. |
| `pdf/tokenizer/bad-string` | `ParseError` | Trailing backslash. |
| `pdf/tokenizer/unterminated-string` | `ParseError` | `(...)` never closed. |
| `pdf/tokenizer/bad-hex` | `ParseError` | Non-hex character inside `<...>`. |
| `pdf/tokenizer/unexpected-rangle` | `ParseError` | Lone `>` outside a hex string. |
| `pdf/tokenizer/empty-keyword` | `ParseError` | Empty keyword. |

## See also

- [`pdfParser`](./parser.md) — main consumer.
- [`pdfXref`](./xref.md) — uses `lastIndexOfBytes` for `startxref`.
- [`pdfErrors`](../errors.md)
