---
module: pdfActionNamed
category: pdf/action
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfActionNamed

> Named action — ISO 32000-2 §12.6.4.11.

**Module** `pdfActionNamed` | **Source** `packages/front/office/pdf/src/action/named.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/S /Named` action — invokes a predefined viewer command. Requires `/N`. Standard names per §12.6.4.11: `NextPage`, `PrevPage`, `FirstPage`, `LastPage`; vendor-defined names are accepted but flagged via `standard: false`. PDF readers often extend the set with `GoBack`, `GoForward`, `GoToPage`, `Find`, `Print`, `SaveAs`.

## Resolve

```js
const named = runtime.resolve('pdfActionNamed');
// Returns: { typeNamed }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeNamed` | `(dict) => { kind: 'Named', name: string, standard: boolean, raw }` | Typing. |

## Examples

```js
const a = runtime.resolve('pdfActionNamed').typeNamed(actionDict);
switch (a.name) {
    case 'NextPage':  viewer.next(); break;
    case 'PrevPage':  viewer.prev(); break;
    case 'FirstPage': viewer.first(); break;
    case 'LastPage':  viewer.last(); break;
    default:
        if (!a.standard) console.warn('vendor-defined named action', a.name);
        viewer.invokeNamed(a.name);
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/action/named/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/action/named/missing-n` | `ParseError` | `/N` absent or not a name. |

## See also

- [`pdfAction`](./action.md)
