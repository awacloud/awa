---
module: pdfParserObj
category: pdf/syntax
dependencies: []
returns: object
worker-safe: true
status: complete
---

# pdfParserObj

> Typed constructors and reflection helpers for PDF objects — split out of `parser.js`.

**Module** `pdfParserObj` | **Source** `packages/front/office/pdf/src/syntax/parser-obj.js` | **Deps** none | **Worker-safe** yes

Companion file to [`parser.js`](./parser.md), extracted to keep the orchestrator
under 300 LOC. The factory declares no dependencies and returns three members:

- `obj` — the constructor factory (`obj.nul`, `obj.bool`, `obj.int`, `obj.real`,
  `obj.name`, `obj.string`, `obj.array`, `obj.dict`, `obj.ref`, `obj.stream`).
- `getEntry(dict, key)` — safe `dict.entries[key]` access, `undefined` when
  `dict` is not a typed dictionary.
- `isType(v, kind)` — discriminant test `v && v.type === kind`.

Every builder is **pure** and always returns a fresh object — no cache, no pool.
`pdfParser` re-exposes all three members for convenience.

## Resolve

```js
const po = runtime.resolve('pdfParserObj');
// Returns: { obj, getEntry, isType }
```

`@awacloud/pdf` re-exports module *descriptors* only (`pdfParserObj`), never resolved
instances — always go through `runtime.resolve`.

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `obj.nul` | `() => object` | `{ type: 'null' }` |
| `obj.bool` | `(v: any) => object` | `{ type: 'bool', value: !!v }` |
| `obj.int` | `(v: number) => object` | `{ type: 'int', value: v\|0 }` |
| `obj.real` | `(v: number) => object` | `{ type: 'real', value: +v }` |
| `obj.name` | `(s: string) => object` | `{ type: 'name', value: String(s) }` |
| `obj.string` | `(bytes: Uint8Array, syntax?: 'lit'\|'hex') => object` | `{ type: 'string', value, syntax }` |
| `obj.array` | `(items?: object[]) => object` | `{ type: 'array', items }` |
| `obj.dict` | `(entries?: object) => object` | `{ type: 'dict', entries }` |
| `obj.ref` | `(num: number, gen?: number) => object` | `{ type: 'ref', num, gen }` |
| `obj.stream` | `(dict: object, raw: Uint8Array) => object` | `{ type: 'stream', dict, raw }` |
| `getEntry` | `(dict, key: string) => object\|undefined` | value or `undefined` |
| `isType` | `(v, kind: string) => boolean` | `v?.type === kind` |

## Examples

### Build a literal Catalog

```js
const { obj } = runtime.resolve('pdfParserObj');

const catalog = obj.dict({
    Type:    obj.name('Catalog'),
    Pages:   obj.ref(2, 0),
    Version: obj.name('2.0')
});
```

### Build a stream

```js
const { obj } = runtime.resolve('pdfParserObj');
const data = new TextEncoder().encode('BT /F1 12 Tf (Hi) Tj ET');
const stream = obj.stream(
    obj.dict({ Length: obj.int(data.length) }),
    data
);
```

### Typed lookup

```js
const { getEntry, isType } = runtime.resolve('pdfParserObj');

if (isType(catalog, 'dict')) {
    const pages = getEntry(catalog, 'Pages');
    if (isType(pages, 'ref')) console.log(pages.num);
}
```

## Errors

Pure builders and predicates — this module raises no `PdfError`.

## See also

- [`pdfParser`](./parser.md) — orchestrator that consumes these helpers
