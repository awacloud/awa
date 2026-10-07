---
module: pdfOCG
category: pdf/ocg
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfOCG

> Optional Content Group — ISO 32000-2 §8.11.2.

**Module** `pdfOCG` | **Source** `packages/front/office/pdf/src/ocg/ocg.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types a `/Type /OCG` dict — a named optional (togglable) layer. Entries: `/Name` (required string), `/Intent` (a name or an array of names — e.g. `View`, `Design`), `/Usage` (sub-dict — `CreatorInfo`, `Language`, `Export`, `Zoom`, `Print`, `View`, `User`, `PageElement`, plus the state convenience entries `ViewState`/`PrintState`/`ExportState`). `typeUsage` decodes that sub-dict separately.

## Resolve

```js
const ocg = runtime.resolve('pdfOCG');
// Returns: { typeOCG, typeUsage }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeOCG` | `(dict) => { name, intent?, usage?, raw, _extras }` | OCG dict. |
| `typeUsage` | `(dict) => Usage` | The `/Usage` sub-dict. |

### Shape `Usage`

`typeUsage` decodes the three `*State` entries into plain name strings; every other known `/Usage` entry (`creatorInfo`, `language`, `export`, `zoom`, `print`, `view`, `user`, `pageElement`) is copied through **as its raw parsed node** (still a `{ type: 'dict', entries: {...} }` object, not further typed) — callers that need its fields must read `entries` themselves.

```js
{
    creatorInfo?, language?, export?, zoom?, print?, view?, user?, pageElement?,  // raw nodes
    viewState?: string, printState?: string, exportState?: string,               // decoded names
    raw, _extras
}
```

## Examples

### Reading an OCG

```js
const ocg = runtime.resolve('pdfOCG');
const g = ocg.typeOCG(doc._raw.resolve(ocgRef));
g.name;          // 'Layer 1'
g.intent;        // ['View', 'Design']
```

### Visibility state

```js
const u = ocg.typeUsage(g.usage);
u.viewState === 'ON';           // decoded convenience state
u.zoom?.entries?.min?.value;    // /Zoom kept raw — read its entries directly
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/ocg/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/ocg/bad-type` | `ParseError` | `/Type` is not `/OCG`. |
| `pdf/ocg/missing-name` | `ParseError` | `/Name` absent or not a string. |
| `pdf/ocg/bad-usage` | `ParseError` | `/Usage` is not a dict. |
| `pdf/ocg/usage/not-dict` | `ParseError` | `typeUsage` receives a non-dict. |
| `pdf/ocg/usage/bad-state` | `ParseError` | `/ViewState`, `/PrintState` or `/ExportState` is not a name. |

## See also

- [`pdfOCConfig`](./config.md) — OC configuration.
- [`pdfCatalog`](../document/catalog.md) — `/OCProperties`.
