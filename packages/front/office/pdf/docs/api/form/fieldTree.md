---
module: pdfFieldTree
category: pdf/form
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfFieldTree

> Form-field tree walker — ISO 32000-2 §12.7.4.

**Module** `pdfFieldTree` | **Source** `packages/front/office/pdf/src/form/fieldTree.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Form fields form a tree rooted at `AcroForm./Fields`. Each node may carry `/Kids` (refs to child fields or widget annotations) and **inherits** `/FT`, `/Ff`, `/V`, `/DV`, `/DA`, `/Q`, `/MaxLen` from its ancestors (§12.7.4.2). A **terminal** field is one whose kids are widgets (no `/T`) or has none. Guardrails: max depth 32, max total 100,000 fields, cycle detection via a `Set<num:gen>`.

## Resolve

```js
const ft = runtime.resolve('pdfFieldTree');
// Returns: { walkFieldTree, getInherited }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `walkFieldTree` | `(rootRefs, resolveRef, opts?) => FieldRecord[]` | Pre-order walk. |
| `getInherited` | `(node, ancestors, key) => PdfObject \| undefined` | Inherited lookup. |

### Options

```js
{ maxDepth?: number = 32, maxFields?: number = 100000 }
```

### Shape `FieldRecord`

```js
{
    ref:       { num: number, gen: number },
    node:      object,           // typed dict
    ancestors: object[],         // root → parent (typed dicts)
    terminal:  boolean
}
```

`getInherited` only accepts inheritable keys: `FT`, `Ff`, `V`, `DV`, `DA`, `Q`, `MaxLen`. Otherwise returns `undefined`.

## Examples

### Walk from AcroForm

```js
const ft = runtime.resolve('pdfFieldTree');
const records = ft.walkFieldTree(form.fields, doc._raw.resolve);
records.filter(r => r.terminal).length;
```

### Inherited FT

```js
for (const r of records) {
    if (!r.terminal) continue;
    const val = ft.getInherited(r.node, r.ancestors, 'FT');
    if (val && val.value === 'Tx') console.log('text field', r.ref);
}
```

### Custom limits

```js
const records = ft.walkFieldTree(roots, resolveRef, { maxDepth: 8, maxFields: 500 });
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/form/tree/bad-roots` | `ParseError` | `rootRefs` is not an array. |
| `pdf/form/tree/max-depth` | `ParseError` | Depth > `maxDepth`. |
| `pdf/form/tree/bad-ref` | `ParseError` | Malformed reference (no numeric `num`). |
| `pdf/form/tree/cycle` | `ParseError` | Cycle detected (same `num:gen` seen again). |
| `pdf/form/tree/not-dict` | `ParseError` | Resolved node is not a dict. |
| `pdf/form/tree/too-many` | `ParseError` | Total > `maxFields`. |
| `pdf/form/tree/non-ref-kid` | `ParseError` | `/Kids` entry is not a ref. |

## See also

- [`pdfAcroForm`](./acroform.md) — supplies the root refs.
- [`pdfButtonField`](./button.md), [`pdfTextField`](./text.md), [`pdfChoiceField`](./choice.md), [`pdfSignatureField`](./signature.md) — typing by `/FT`.
- [`pdfAppearance`](./appearance.md) — `/AP` on terminal widgets.
