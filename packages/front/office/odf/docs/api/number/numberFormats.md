---
module: numberFormats
category: odf/number
dependencies: [xml]
returns: object
worker-safe: true
status: complete
---

# numberFormats

> Parse/render `<number:date-style>`, `<number:time-style>`, `<number:number-style>`, `<number:currency-style>`, `<number:percentage-style>`, `<number:boolean-style>`, `<number:text-style>`.

**Module** `numberFormats` | **Source** `packages/front/office/odf/src/number/numberFormats.js` | **Worker-safe** yes

Model:

```js
{
  formats: [{
    kind,            // 'date' | 'time' | 'number' | 'currency' | 'percentage' | 'boolean' | 'text'
    name,
    parts: [ { type, attrs, text? } ],
    _extras?
  }]
}
```

`type` is the local name minus `number:` (`'day'`, `'month'`, `'year'`,
`'hours'`, `'minutes'`, `'seconds'`, `'number'`, `'fraction'`,
`'scientific-number'`, `'currency-symbol'`, `'text'`, …).

## API

| Method | Description |
|---------|-------------|
| `parse(containerEl)` | Finds the `<number:*-style>` children. |
| `render(model)` | Builds an array of nodes (to splice into a container). |
| `parseFormat(el, kind)` / `renderFormat(f)` | Per-format unit work. |
| `parsePart(el)` / `renderPart(part)` | Per-part unit work (a single `<number:day>`, `<number:text>`, etc. node). |
| `empty()` | `{ formats: [] }`. |
| `KIND_TAGS` | Object mapping `<number:*-style>` tag names to `kind` values. |
