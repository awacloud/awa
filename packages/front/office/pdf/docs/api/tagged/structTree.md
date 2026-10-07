---
module: pdfStructTree
category: pdf/tagged
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdfStructTree

> Structure Tree Root — ISO 32000-2 §14.7.2, basis of PDF/UA-2 (ISO 14289-2).

**Module** `pdfStructTree` | **Source** `packages/front/office/pdf/src/tagged/structTree.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

Types the `/Type /StructTreeRoot` dict referenced by the Catalog. Carries `/K` (root kid(s)), `/IDTree` (ID name tree), `/ParentTree` (number tree mapping MCIDs and OBJRs), `/ParentTreeNextKey`, `/RoleMap`, `/ClassMap`, `/Namespaces` (PDF 2.0), `/AF`, `/PronunciationLexicon`. `/K` is normalized to `Array<ref|dict>`.

## Resolve

```js
const st = runtime.resolve('pdfStructTree');
// Returns: { typeStructTreeRoot }
```

## API

| Method | Signature | Returns |
|--------|-----------|---------|
| `typeStructTreeRoot` | `(dict) => StructTreeRoot` | Typing of the root. |

### Shape

```js
{
    kids: Array<ref|dict>,
    idTree, parentTree,
    parentTreeNextKey: number,
    roleMap, classMap, namespaces, af, pronunciationLexicon,
    raw, _extras
}
```

## Examples

### Walking from the Catalog

```js
const st = runtime.resolve('pdfStructTree');
const root = st.typeStructTreeRoot(doc._raw.resolve(doc.catalog.structTreeRoot));
for (const kid of root.kids) {
    const el = runtime.resolve('pdfStructElement').typeStructElement(
        kid.type === 'ref' ? doc._raw.resolve(kid) : kid
    );
}
```

### Mapping custom roles

```js
const rm = runtime.resolve('pdfRoleMap').typeRoleMap(root.roleMap);
rm.map.MyCustomP;   // -> 'P'
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/tagged/struct-tree/not-dict` | `ParseError` | Argument is not a dict. |
| `pdf/tagged/struct-tree/bad-type` | `ParseError` | `/Type` ≠ `/StructTreeRoot`. |
| `pdf/tagged/struct-tree/bad-kid` | `ParseError` | `/K` is neither ref/dict, or an array with an invalid entry. |

## See also

- [`pdfStructElement`](./structElement.md) · [`pdfRoleMap`](./roleMap.md) · [`pdfParentTree`](./parentTree.md) · [`pdfClassMap`](./classMap.md)
- [`pdfMarkedContent`](./markedContent.md)
