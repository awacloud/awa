---
module: pdf3dRichMedia
category: pdf/extra
dependencies: [pdfErrors, pdfParser]
returns: object
worker-safe: true
status: complete
---

# pdf3dRichMedia

> 3D (§13.6.2) and RichMedia (§13.6.3) annotations — ISO 32000-2.

**Module** `pdf3dRichMedia` | **Source** `packages/front/office/pdf/src/extra/3d-richmedia.js` | **Deps** `pdfErrors`, `pdfParser` | **Worker-safe** yes

`/Subtype /3D` → references a 3D stream via `/3DD`, default view (`/3DV`), activation (`/3DA`), interactive flag (`/3DI`). `/Subtype /RichMedia` → `/RichMediaContent` with `/Assets`, `/Configurations`, `/Views`, and `/RichMediaSettings`.

## Resolve

```js
const ext = runtime.resolve('pdf3dRichMedia');
// Returns: { type3DAnnot, type3DActivation, typeRichMediaAnnot,
//   typeRichMediaContent, classifyRmInstanceState,
//   RM_INSTANCE_STATES, ACTIVATION_CONDITIONS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `type3DAnnot` | `(dict) => ThreeDAnnot` | `{ threeDD, threeDV, threeDA, threeDI, threeDB, raw, _extras }`. |
| `type3DActivation` | `(dict) => Activation` | `/3DA` fields `{ a, ais, d, dis, tb, np, raw }`. |
| `typeRichMediaAnnot` | `(dict) => RichMediaAnnot` | `{ content, settings, raw, _extras }`. |
| `typeRichMediaContent` | `(dict) => Content` | `{ assets, configurations, views, raw }`. |
| `classifyRmInstanceState` | `(name: string) => 'active' \| 'loaded' \| 'uninstantiated' \| null` | Looks up `RM_INSTANCE_STATES`. |
| `RM_INSTANCE_STATES` | frozen catalog | `{ A: 'active', L: 'loaded', U: 'uninstantiated' }`. |
| `ACTIVATION_CONDITIONS` | frozen catalog | `{ XA: 'explicit activate', PO: 'page open', PV: 'page visible' }`. |

## Examples

### 3D annotation

```js
const ext = runtime.resolve('pdf3dRichMedia');
const a = ext.type3DAnnot(annotDict);
a.threeDD;       // ref to the 3D stream
a.threeDA.a;     // 'PO' (activation condition)
```

### RichMedia content

```js
const c = ext.typeRichMediaContent(contentDict);
c.assets;          // raw /Assets entry
c.configurations;  // raw /Configurations entry
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/extra/3d/not-dict` | `ParseError` | Not a dict. |
| `pdf/extra/3d/bad-subtype` | `ParseError` | `/Subtype` is not `/3D`. |
| `pdf/extra/3d/missing-3dd` | `ParseError` | `/3DD` absent. |
| `pdf/extra/3d/act/not-dict` | `ParseError` | Activation is not a dict. |
| `pdf/extra/rm/not-dict` | `ParseError` | Not a dict. |
| `pdf/extra/rm/bad-subtype` | `ParseError` | `/Subtype` is not `/RichMedia`. |
| `pdf/extra/rm/missing-content` | `ParseError` | `/RichMediaContent` absent. |
| `pdf/extra/rm/content/not-dict` | `ParseError` | Content is not a dict. |
| `pdf/extra/rm/state/bad` | `ParseError` | State is not a string. |

## See also

- [`pdfAnnotExtended`](./annot-extended.md)
- [`pdfAnnot`](../annot/annot.md)
- [Extras index](./README.md)
