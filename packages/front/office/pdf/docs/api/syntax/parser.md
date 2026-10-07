---
module: pdfParser
category: pdf/syntax
dependencies: [pdfErrors, pdfParserObj, pdfTokenizer]
returns: object
worker-safe: true
status: complete
---

# pdfParser

> Typed PDF objects, ISO 32000-2 §7.3 — token stream → `{ type, value/items/entries }` tree.

**Module** `pdfParser` | **Source** `packages/front/office/pdf/src/syntax/parser.js` | **Deps** `pdfErrors`, `pdfParserObj`, `pdfTokenizer` | **Worker-safe** yes

Produces the typed objects `null`, `bool`, `int`, `real`, `name`, `string`,
`array`, `dict`, `ref`, `stream`. The `<int> <int> R` form is recognised
speculatively as a `ref`. Indirect definitions `<num> <gen> obj … endobj` are
read by `parseIndirect`, which promotes `dict + stream` into
`{ type: 'stream', dict, raw }`. The parser validates neither xref integrity nor
`/Length` — that is the document layer's job.

The module re-exposes the injected `pdfTokenizer`'s `tokenize` and the whole
`pdfParserObj` surface (`obj`, `getEntry`, `isType`) so a consumer needs a
single resolve to go from bytes to a typed tree.

## Resolve

```js
const parser = runtime.resolve('pdfParser');
// Returns: { tokenize, parseObject, parseIndirect, parseFromBytes,
//            parseIndirectFromBytes, parserLimits, setParserLimits,
//            obj, getEntry, isType }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `tokenize` | `(bytes: Uint8Array, opts?) => Tokenizer` | Re-export of [`pdfTokenizer.tokenize`](./tokenizer.md). |
| `parseObject` | `(tok: Tokenizer) => PdfObject` | One typed object. |
| `parseIndirect` | `(tok: Tokenizer, resolveRef?) => { num, gen, value }` | Full indirect definition. |
| `parseFromBytes` | `(bytes: Uint8Array) => PdfObject` | Helper — tokenize then `parseObject`. |
| `parseIndirectFromBytes` | `(bytes: Uint8Array, at: number, resolveRef?) => { num, gen, value }` | Offset helper. |
| `parserLimits` | `{ maxDepth, maxArrayLen, maxStreamBytes }` | Live, mutable per-instance guard-rails. |
| `setParserLimits` | `(partial) => parserLimits` | Merges positive integer overrides and returns the updated object. |
| `obj` | builders | Primitive constructors (see below). |
| `getEntry` | `(dict, key: string) => PdfObject \| undefined` | Lookup on `{type:'dict'}`. |
| `isType` | `(v, kind: string) => boolean` | Test `v.type === kind`. |

### `parserLimits` defaults

| Key | Default | Guards |
|-----|---------|--------|
| `maxDepth` | `200` | Nesting depth — `pdf/parser/depth-exceeded`. |
| `maxArrayLen` | `1_000_000` | Array element count — `pdf/parser/array-too-long`. |
| `maxStreamBytes` | `268_435_456` (256 MiB) | Stream payload quota during `parseIndirect`. |

Only positive integers are accepted; anything else is ignored, so
`setParserLimits({})` is a no-op that simply returns the current limits.

### `obj` builders

| Helper | Signature |
|--------|-----------|
| `obj.nul()` | `→ { type: 'null' }` |
| `obj.bool(v)` | `→ { type: 'bool', value }` |
| `obj.int(v)` | `→ { type: 'int', value }` |
| `obj.real(v)` | `→ { type: 'real', value }` |
| `obj.name(s)` | `→ { type: 'name', value }` |
| `obj.string(bytes, syntax?)` | `syntax ∈ 'lit'\|'hex'` |
| `obj.array(items?)` | |
| `obj.dict(entries?)` | |
| `obj.ref(num, gen?)` | |
| `obj.stream(dict, raw)` | |

## Token → type mapping

| Token | Output type |
|-------|-------------|
| `kw 'null'/'true'/'false'` | `null` / `bool` |
| `name` | `name` |
| `string` | `string` (`syntax:'lit'`) |
| `hex` | `string` (`syntax:'hex'`) |
| `int` + `int` + `kw 'R'` | `ref` |
| `int` | `int` |
| `real` | `real` |
| `open_arr … close_arr` | `array` |
| `open_dict … close_dict` | `dict` |
| `dict` + `kw 'stream'` (via `parseIndirect`) | `stream` |

## Examples

### Parse a standalone object

```js
const parser = runtime.resolve('pdfParser');
const o = parser.parseFromBytes(new TextEncoder().encode('<< /Size 6 /Root 1 0 R >>'));
o.type;                            // 'dict'
parser.getEntry(o, 'Size').value;  // 6
parser.getEntry(o, 'Root');        // { type: 'ref', num: 1, gen: 0 }
```

### Read an indirect definition carrying a stream

```js
const tok = parser.tokenize(bytes, { start: offset });
const def = parser.parseIndirect(tok, ref => doc._raw.resolve(ref));
def.value.type;            // 'stream'
def.value.raw;             // Uint8Array
```

### Tighten the limits for untrusted input

```js
parser.setParserLimits({ maxDepth: 32, maxStreamBytes: 8 * 1024 * 1024 });
parser.parserLimits.maxDepth;   // 32
```

### Build with `obj`

```js
const o = parser.obj.dict({
    Type: parser.obj.name('Catalog'),
    Pages: parser.obj.ref(2, 0)
});
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/parser/eof` | `ParseError` | End of stream during `parseObject`. |
| `pdf/parser/unexpected-keyword` | `ParseError` | Unrecognised keyword in object position. |
| `pdf/parser/unexpected-token` | `ParseError` | Foreign token (e.g. a lone `n`). |
| `pdf/parser/unbalanced` | `ParseError` | `]` or `>>` without an opener. |
| `pdf/parser/unterminated-array` | `ParseError` | `[` never closed. |
| `pdf/parser/unterminated-dict` | `ParseError` | `<<` never closed. |
| `pdf/parser/dict-key-not-name` | `ParseError` | Dictionary key is not a name. |
| `pdf/parser/depth-exceeded` | `ParseError` | Nesting deeper than `parserLimits.maxDepth`. |
| `pdf/parser/array-too-long` | `ParseError` | Array longer than `parserLimits.maxArrayLen`. |
| `pdf/parser/indirect-bad-num` / `-bad-gen` / `-missing-obj` / `-missing-endobj` | `ParseError` | Malformed `<n> <g> obj … endobj`. |
| `pdf/parser/stream/no-endstream` | `ParseError` | `endstream` not found. |
| `pdf/parser/stream/expected-endstream` | `ParseError` | Something else found instead. |

## See also

- [`pdfTokenizer`](./tokenizer.md)
- [`pdfParserObj`](./parser-obj.md)
- [`pdfXref`](./xref.md) — uses `parseObject` for the trailer.
- [`pdfErrors`](../errors.md)
