# Read & write `.ods`

How to write a spreadsheet with the `ods` orchestrator, read it back, and use
the typed cell model.

**Prerequisites.** `@awacloud/odf` and `@awacloud/fw`, with a `runtime` wired as in
[Getting started](./getting-started.md) (`fw_require` + `modules` registered on an
`@awacloud/fw` `ModuleRuntime`); the snippets below reuse that `runtime`.

## Writing

```js
const ods = runtime.resolve('ods');

const doc = {
    spreadsheet: { tables: [
        ods.sheet('Numbers', [[1, 2, 3], [4, 5, 6]]),
        ods.sheet('Strings', [['a', 'b'], ['c', 'd']])
    ] }
};

const bytes = ods.write(doc, {
    meta: { title: 'Quarterly', creator: 'Alice' }
});
```

## Reading

```js
const back = ods.read(bytes);
back.mimetype;                          // 'application/vnd.oasis.opendocument.spreadsheet'
back.spreadsheet.tables.length;         // 2
back.spreadsheet.tables[0].name;        // 'Numbers'
back.spreadsheet.tables[0].rows[0].cells[0].value; // '1'
```

## Typed cells

`tableCell` supports the `office:value-type` types:

| Type | ODF attribute | Model field |
|------|--------------|-------------|
| `float` | `office:value` | `value` (decimal string) |
| `percentage` | `office:value` | `value` |
| `currency` | `office:value` + `office:currency` | `value`, `currency` |
| `date` | `office:date-value` | `value` (ISO 8601) |
| `time` | `office:time-value` | `value` (`PT…`) |
| `boolean` | `office:boolean-value` | `value` (`'true'` / `'false'`) |
| `string` | `office:string-value` | `value` |

The `ods.cell(v)` helper coerces common JS types:

```js
ods.cell(42);                  // { valueType: 'float', value: '42', children: [<text:p>] }
ods.cell('hello');             // { valueType: 'string', value: 'hello', … }
ods.cell(true);                // { valueType: 'boolean', value: 'true', … }
ods.cell(new Date());          // { valueType: 'date', value: '2026-…', … }
```

## Formulas

OpenFormula formulas are preserved verbatim, including the namespace
prefix:

```js
const c = {
    type: 'cell', valueType: 'float', value: '6',
    formula: 'of:=SUM(A1:A3)', children: []
};
```

## Helpers

| Helper | Role |
|--------|------|
| `ods.empty()` | Document with a single empty `Sheet1`. |
| `ods.sheet(name, rows)` | Builds a `table:table` from a 2-D array. |
| `ods.fromArrays([{name, rows}, …])` | Multi-sheet document. |
| `ods.cell(value, opts?)` | Coerces a primitive into a typed cell model. |
| `ods.toText(doc)` | Tab-separated values, rows separated by `\n`. |

## See also

- [API ods/ods](../api/ods/ods.md)
- [API ods/spreadsheet](../api/ods/spreadsheet.md)
- [API table/cell](../api/table/cell.md)
