---
module: pdfOCConfig
category: pdf/ocg
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfOCConfig

> Optional Content Configuration — ISO 32000-2 §8.11.4.

**Module** `pdfOCConfig` | **Source** `packages/front/office/pdf/src/ocg/config.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types the OC configuration dict referenced by `/OCProperties /D` (default config) or an entry of `/OCProperties /Configs`. Entries: `/Name`, `/Creator`, `/BaseState` (`ON`/`OFF`/`Unchanged`), `/ON` (refs forced visible), `/OFF` (refs forced hidden), `/Locked` (refs the user cannot toggle), `/Intent` (a name or array of names), `/AS` (auto-state — array of UsageApplication dicts), `/Order` (display tree for viewers, kept raw), `/ListMode` (`AllPages`/`VisiblePages`), `/RBGroups` (radio-button groups).

## Resolve

```js
const cfg = runtime.resolve('pdfOCConfig');
// Returns: { typeOCConfig, typeUsageApp }
```

## API

| Method | Signature | Returns |
|---------|-----------|----------|
| `typeOCConfig` | `(dict) => OCConfig` | Typing. |
| `typeUsageApp` | `(d) => UsageApplication` | Typing of one `/AS[*]` entry. |

### Shape `OCConfig`

```js
{
    name?, creator?,
    baseState?: 'ON' | 'OFF' | 'Unchanged',
    on?: PdfRef[], off?: PdfRef[], locked?: PdfRef[],
    intent?: string[],
    as?: UsageApplication[],
    order?: PdfNode[],                 // /Order items, kept raw
    listMode?: string,
    rbGroups?: PdfRef[][],
    raw, _extras
}
```

### Shape `UsageApplication`

```js
{ event?: string, ocgs?: PdfRef[], category?: string[], raw }
```

## Examples

### Default configuration

```js
const cfg = runtime.resolve('pdfOCConfig');
const c = cfg.typeOCConfig(doc._raw.resolve(catalog.ocProperties.entries.D));
c.baseState;      // 'ON'
c.on;             // [ref, …] forced ON
c.rbGroups;       // mutually-exclusive groups
```

### Applying UsageApplication entries

```js
for (const uaDict of c.as ?? []) {
    const ua = cfg.typeUsageApp(uaDict);
    ua.event;       // 'View' | 'Print' | 'Export'
    ua.ocgs;        // refs this application applies to
    ua.category;    // ['Zoom', …]
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/ocg/config/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/ocg/config/bad-name` | `ParseError` | `/Name` is not a string. |
| `pdf/ocg/config/bad-creator` | `ParseError` | `/Creator` is not a string. |
| `pdf/ocg/config/bad-base-state` | `ParseError` | `/BaseState` outside `ON`/`OFF`/`Unchanged`. |
| `pdf/ocg/config/bad-intent` | `ParseError` | `/Intent` is neither a name nor an array. |
| `pdf/ocg/config/bad-as` | `ParseError` | `/AS` is not an array. |
| `pdf/ocg/config/bad-order` | `ParseError` | `/Order` is not an array. |
| `pdf/ocg/config/bad-list-mode` | `ParseError` | `/ListMode` is not a name. |
| `pdf/ocg/config/bad-rb` | `ParseError` | `/RBGroups` is not an array. |
| `pdf/ocg/config/bad-refs` | `ParseError` | `/ON`/`/OFF`/`/Locked` is not an array. |
| `pdf/ocg/config/as/not-dict` | `ParseError` | An `/AS` entry is not a dict. |

## See also

- [`pdfOCG`](./ocg.md) · [`pdfCatalog`](../document/catalog.md)
