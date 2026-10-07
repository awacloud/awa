# Tagged PDF — ISO 32000-2 §14.6 / §14.7 / §14.8

Logical layer: structure tree, marked content, role mapping. Basis of PDF/UA-2 (ISO 14289-2).

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [`pdfStructTree`](./structTree.md) | `{ typeStructTreeRoot }` | `pdfErrors`, `pdfParser` | Root, §14.7.2. |
| [`pdfStructElement`](./structElement.md) | `{ typeStructElement }` | `pdfErrors`, `pdfParser` | Elem, §14.7.3. |
| [`pdfRoleMap`](./roleMap.md) | `{ typeRoleMap, resolveStandardType, isStandardType, STANDARD_TYPES }` | `pdfErrors`, `pdfParser` | RoleMap, §14.7.4. |
| [`pdfParentTree`](./parentTree.md) | `{ lookupParent }` | `pdfErrors`, `pdfParser` | ParentTree, §14.7.5. |
| [`pdfClassMap`](./classMap.md) | `{ typeClassMap, getClassAttributes }` | `pdfErrors`, `pdfParser` | ClassMap, §14.7.6. |
| [`pdfMarkedContent`](./markedContent.md) | `{ extractMcids, resolveMcidToStruct }` | `pdfErrors`, `pdfParser`, `pdfParentTree` | BMC/BDC/EMC, §14.6. |

## PDF/UA-2 pattern

```js
const st = runtime.resolve('pdfStructTree');
const root = st.typeStructTreeRoot(doc._raw.resolve(doc.catalog.structTreeRoot));
// walk root.kids → pdfStructElement.typeStructElement
```

## See also

- [Content streams](../content/README.md)
- [Annot — Widget](../annot/widget.md)
