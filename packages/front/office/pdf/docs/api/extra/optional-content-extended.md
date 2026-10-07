---
module: pdfOptionalContentExtended
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfOptionalContentExtended

> Extended OCG/OCMD — VE (Visibility Expression), Order tree, RBGroups, Intent — ISO 32000-2 §8.11.

**Module** `pdfOptionalContentExtended` | **Source** `packages/front/office/pdf/src/extra/optional-content-extended.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

§8.11.2.4 defines OCMD `/VE` (Visibility Expression) as a nested array `[op, operand, …]` with ops `And`, `Or`, `Not`. This module evaluates such expressions, types `/Order` (including sub-heading strings), and surfaces RBGroups and `/Intent` (View vs Design).

## Resolve

```js
const ext = runtime.resolve('pdfOptionalContentExtended');
// Returns: { evaluateVE, typeOrderTree, typeRBGroups,
//   classifyOcgIntent, VE_OPERATORS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `evaluateVE` | `(ve, onSet: Set<string>) => boolean` | Recursively evaluates; `onSet` holds `"num gen"` keys of "on" OCGs. |
| `typeOrderTree` | `(orderArray) => OrderNode[]` | Nodes shaped `{ kind: 'heading', text } \| { kind: 'group', children } \| { kind: 'ocg', ref } \| { kind: 'other', value }`. |
| `typeRBGroups` | `(arr) => Array<Array<{ num, gen }>>` | Mutually-exclusive radio-button groups. |
| `classifyOcgIntent` | `(value) => { view: boolean, design: boolean, names: string[] }` | |
| `VE_OPERATORS` | frozen array | `['And','Or','Not']`. |

## Examples

### Evaluate VE

```js
const ext = runtime.resolve('pdfOptionalContentExtended');
const visible = ext.evaluateVE(
    { type: 'array', items: [
        { type: 'name', value: 'And' }, ocgRefA,
        { type: 'array', items: [{ type: 'name', value: 'Not' }, ocgRefB] }
    ] },
    onSet
);
```

### Order tree

```js
const tree = ext.typeOrderTree(orderArr);
// [ { kind: 'heading', text: 'Layer group' }, { kind: 'group', children: [...] }, … ]
```

### Intent

```js
ext.classifyOcgIntent({ type: 'name', value: 'View' });
// { view: true, design: false, names: ['View'] }
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/ocgx/ve/null` | `ParseError` | VE expression is null. |
| `pdf/extra/ocgx/ve/bad-state` | `ParseError` | `onSet` is not a `Set`. |
| `pdf/extra/ocgx/ve/bad-shape` | `ParseError` | Neither an array nor a ref. |
| `pdf/extra/ocgx/ve/bad-op` | `ParseError` | Operator outside `VE_OPERATORS`. |
| `pdf/extra/ocgx/ve/not-arity` | `ParseError` | Wrong arity (`Not` = 1, `And`/`Or` ≥ 1). |
| `pdf/extra/ocgx/order/not-array` | `ParseError` | `/Order` is not an array. |
| `pdf/extra/ocgx/rbg/not-array` | `ParseError` | `/RBGroups` is not an array. |
| `pdf/extra/ocgx/rbg/bad-group` | `ParseError` | A group entry is not an array. |
| `pdf/extra/ocgx/intent/bad` | `ParseError` | Intent is neither a name nor an array. |

## See also

- [`pdfOCG`](../ocg/ocg.md)
- [`pdfOCConfig`](../ocg/config.md)
- [Extras index](./README.md)
