---
module: pdfActionGoTo
category: pdf/action
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfActionGoTo

> GoTo / GoToR / GoToE — ISO 32000-2 §12.6.4.2 / §12.6.4.3 / §12.6.4.4.

**Module** `pdfActionGoTo` | **Source** `packages/front/office/pdf/src/action/goTo.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Three navigation variants:
- **GoTo** (`/S /GoTo`) — destination inside the current document, `/D` entry.
- **GoToR** (`/S /GoToR`) — remote file, `/F` (file spec) and `/D` entries, optional `/NewWindow`.
- **GoToE** (`/S /GoToE`) — embedded file, `/D` entry plus optional `/F` and `/T` (target dict), optional `/NewWindow`.

## Resolve

```js
const goto = runtime.resolve('pdfActionGoTo');
// Returns: { typeGoTo, typeGoToR, typeGoToE }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeGoTo` | `(dict) => { kind: 'GoTo', dest, raw }` | Internal destination. |
| `typeGoToR` | `(dict) => { kind: 'GoToR', file, dest, newWindow?, raw }` | Remote file. |
| `typeGoToE` | `(dict) => { kind: 'GoToE', dest, file?, target?, newWindow?, raw }` | Embedded file. |

## Examples

### Internal link via outline

```js
const a = runtime.resolve('pdfActionGoTo').typeGoTo(actionDict);
const d = runtime.resolve('pdfDestination').typeDestination(a.dest, names, resolveRef);
```

### Remote link

```js
const a = runtime.resolve('pdfActionGoTo').typeGoToR(actionDict);
a.file;          // file spec (/F)
a.dest;          // destination inside the remote document (/D)
a.newWindow;     // boolean, when /NewWindow is present
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/action/goto/missing-d` | `ParseError` | `/D` absent. |
| `pdf/action/gotor/missing-f` | `ParseError` | `/F` absent. |
| `pdf/action/gotor/missing-d` | `ParseError` | `/D` absent. |
| `pdf/action/gotoe/missing-d` | `ParseError` | `/D` absent. |
| `pdf/action/goto/not-dict` · `gotor/not-dict` · `gotoe/not-dict` | `ParseError` | Argument is not a dict. |

## See also

- [`pdfAction`](./action.md) · [`pdfDestination`](../destination/destination.md) · [`pdfFileSpec`](../embedded/fileSpec.md)
