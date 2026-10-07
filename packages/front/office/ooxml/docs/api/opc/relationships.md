---
module: opcRelationships
category: ooxml/opc
dependencies: [ooxmlErrors, xml]
returns: object
worker-safe: true
status: complete
---

# opcRelationships

> Parses/serialises `.rels` files (OPC, ECMA-376 part 2 §9).

**Module** `opcRelationships` | **Source** `packages/front/office/ooxml/src/opc/relationships.js` | **Deps** `ooxmlErrors`, `xml` | **Worker-safe** yes

Each part may own an adjacent `.rels` file (`<dir>/_rels/<file>.rels`) describing its outgoing typed links. The package itself uses `_rels/.rels` for the root link to the main document. A `Relationship` is `{ Id, Type, Target, TargetMode? }`.

## Resolve

```js
const rels = runtime.resolve('opcRelationships');
// Returns: { parse, serialize, relsPathFor, resolveTarget, NS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parse` | `(text: string) => Rel[]` | List of relationships. |
| `serialize` | `(rels: Rel[]) => string` | `<Relationships>` XML. |
| `relsPathFor` | `(partName: string) => string` | ZIP path of the `.rels` file. |
| `resolveTarget` | `(sourcePart: string, target: string) => string` | Resolved absolute part name. |
| `NS` | string constant | OPC relationships namespace. |

## Examples

### Resolving a relative Target

```js
const rels = runtime.resolve('opcRelationships');
rels.resolveTarget('/word/document.xml', 'styles.xml');
// '/word/styles.xml'
rels.resolveTarget('/word/document.xml', '../customXml/item1.xml');
// '/customXml/item1.xml'
rels.resolveTarget('/word/document.xml', '/media/img.png');
// '/media/img.png'
```

### Path of the `.rels` file

```js
rels.relsPathFor('/');                       // '_rels/.rels'
rels.relsPathFor('/word/document.xml');      // 'word/_rels/document.xml.rels'
```

### Build relationships

```js
const xmlText = rels.serialize([
    { Id: 'rId1', Type: '…/styles', Target: 'styles.xml' },
    { Id: 'rId2', Type: '…/hyperlink', Target: 'https://example.org',
      TargetMode: 'External' }
]);
```

## Notes

- `parse` raises `ParseError('opc/relationships-bad-root')` when the root is not `<Relationships>`.
- `TargetMode` is omitted for internal targets (the default mode). `'External'` must be written explicitly.
- `resolveTarget` handles `..`, `.` and empty segments — escaping above the root is not checked.
- `Id` values must be unique within a `.rels` file (not enforced — the producer's responsibility). [`ooxmlShared.createRidAllocator`](../_shared/README.md) helps keep them unique.

## See also

- [opc-package](./package.md) — the final assembly.
- [opc-content-types](./content-types.md) — the other OPC registry.
