---
module: pdfActionUri
category: pdf/action
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfActionUri

> URI action — ISO 32000-2 §12.6.4.7.

**Module** `pdfActionUri` | **Source** `packages/front/office/pdf/src/action/uri.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/S /URI` action — opens an external resource (HTTP, mailto, …). Requires `/URI` (ASCII string), optional `/IsMap` boolean (for server-side image maps). Note: the factory only actually uses its `errors` parameter (a self-contained `isType` helper is inlined so the module tolerates a stub `parser`), even though `pdfParser` is declared as a dependency.

## Resolve

```js
const uri = runtime.resolve('pdfActionUri');
// Returns: { typeUri }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeUri` | `(dict) => { kind: 'URI', uri: string, isMap?: boolean, raw }` | Typing. |

## Examples

```js
const a = runtime.resolve('pdfActionUri').typeUri(actionDict);
a.uri;           // 'https://example.com'
window.open(a.uri, a.isMap ? '_blank' : '_self');
```

### Sanitization

```js
if (a.uri.startsWith('javascript:')) reject();
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/action/uri/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/action/uri/missing` | `ParseError` | `/URI` absent or not a string. |

## See also

- [`pdfAction`](./action.md) · [`pdfLinkAnnot`](../annot/link.md)
