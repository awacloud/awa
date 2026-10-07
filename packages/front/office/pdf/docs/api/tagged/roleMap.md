---
module: pdfRoleMap
category: pdf/tagged
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfRoleMap

> RoleMap — ISO 32000-2 §14.7.4 — maps custom roles onto standard structure types.

**Module** `pdfRoleMap` | **Source** `packages/front/office/pdf/src/tagged/roleMap.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/RoleMap` (on the `StructTreeRoot`) is a dict `name → name`. It lets a custom role (e.g. `MyTitle`) be interpreted as a standard structure type (e.g. `H1`). Resolution is iterative with cycle detection. The module knows the PDF 2.0 standard types (§14.8.4) — `Document`, `DocumentFragment`, `Part`, `Art`, `Sect`, `Div`, `BlockQuote`, `Caption`, `TOC`, `TOCI`, `Index`, `NonStruct`, `Private`, `Aside`, `Title`, `FENote`, `P`, `H`, `H1`–`H7`, `L`, `LI`, `Lbl`, `LBody`, `Table`, `TR`, `TH`, `TD`, `THead`, `TBody`, `TFoot`, `Span`, `Quote`, `Note`, `Reference`, `BibEntry`, `Code`, `Link`, `Annot`, `Em`, `Strong`, `Ruby`, `RB`, `RT`, `RP`, `Warichu`, `WT`, `WP`, `Figure`, `Formula`, `Form`, `Artifact`. It also supports the PDF 2.0 namespace model (`/Namespaces`, per-element `/NS`, and a namespace's own `/RoleMapNS` taking precedence via `resolveStandardType`'s `namespaceMap` argument).

## Resolve

```js
const rm = runtime.resolve('pdfRoleMap');
// Returns: { typeRoleMap, resolveStandardType, isStandardType, STANDARD_TYPES }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeRoleMap` | `(dict) => { map: Record<string,string>, raw }` | Typing — `map` is a **plain object**, not a `Map`. |
| `resolveStandardType` | `(name, map, namespaceMap?) => { standard: string \| null, chain: string[] }` | Recursively resolves toward a standard type; cycle-safe. |
| `isStandardType` | `(name) => boolean` | Tests against the §14.8.4 table. |
| `STANDARD_TYPES` | `Set<string>` | The full standard-type set used by `isStandardType`/`resolveStandardType`. |

## Examples

### Resolution

```js
const rm = runtime.resolve('pdfRoleMap');
const r  = rm.typeRoleMap(root.roleMap);
const out = rm.resolveStandardType('MyTitle', r.map);
out.standard;  // 'H1'
out.chain;     // ['MyTitle', 'Heading', 'H1']
```

### PDF/UA validation

```js
for (const [custom, target] of Object.entries(r.map)) {
    void target;
    if (!rm.isStandardType(rm.resolveStandardType(custom, r.map).standard)) {
        /* warning: custom role unresolved */
    }
}
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/role-map/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/tagged/role-map/bad-value` | `ParseError` | A value is not a name. |
| `pdf/tagged/role-map/cycle` | `ParseError` | Cycle detected while resolving. |

## See also

- [`pdfStructTree`](./structTree.md) · [`pdfStructElement`](./structElement.md)
