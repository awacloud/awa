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
// Returns: { type3DAnnot, type3DActivation, type3DMeasure, MEASURE_KEYS,
//   type3DScene, SCENE_KEYS, typeRichMedia, RICH_MEDIA_KEYS,
//   typeRichMediaAnnot, typeRichMediaContent, classifyRmInstanceState,
//   RM_INSTANCE_STATES, ACTIVATION_CONDITIONS }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `type3DAnnot` | `(dict) => ThreeDAnnot` | `{ threeDD, threeDV, threeDA, threeDI, threeDB, raw, _extras }`. |
| `type3DActivation` | `(dict) => Activation` | `/3DA` fields `{ a, ais, d, dis, tb, np, style, window, transparent, raw }` (`style` a name, `window` a dictionary or reference as read, `transparent` a boolean; `null` when absent or of another type). |
| `type3DMeasure` | `(dict) => Measure` | A 3D measurement dictionary (`/Subtype` `RD3` radial, `AD3` angular, `PD3` perpendicular, `LD3` linear, `3DC` comment note): one field per key of its subtype's list, named after the key in lower case (`TRL` → `trl`, `A1` → `a1`), present only when the key is — a name, a text string (its bytes), a number, the integer `p` or a boolean by its value (`null` for a value of another type), an array or the `s` dictionary as read — plus `subtype`, `raw` and `_extras` (the other keys). No default is filled in. |
| `MEASURE_KEYS` | frozen object | Subtype → its keys (the Arlington PDF Model's lists). |
| `type3DScene` | `(dict\|stream, kind) => Scene` | A 3D view or scene dictionary of the given kind — `view` (`/3DView`, ISO 32000-2's `Snapshot` and `Params` included), `crossSection`, `node`, `renderMode`, `background`, `lightingScheme`, `units` (given: `3DUnits` has no `/Type`), `stream` (the 3D stream: its `Resources` name tree as read, its `DV` a dictionary, integer, name or string), `animationStyle`, `reference`, `projection` (`/P` of a 3D view), `markup` (a 3D markup's external data: `Type`, `Subtype`, `3DA`, `3DV`, `MD5`), `measureRef` (a 3D measurement's external data: `M3DREF`) — or a stream (its dictionary read, its Table 5 keys left to `typeStreamEntries`): one field per key of its list, named after the key in lower case (`C2W` → `c2w`, `U3DPath` → `u3dpath`, `TSm` → `tsm`), present only when the key is — a name, a text string (its bytes), a number or a boolean by its value, an array, a dictionary or a stream as read (a reference as read), `null` for a value of none of the key's types (`U3DPath`, `FC`, `Data` take either of two) — plus `raw` and `_extras` (the other keys). No default is filled in. |
| `SCENE_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeRichMediaAnnot` | `(dict) => RichMediaAnnot` | `{ content, settings, raw, _extras }`. |
| `typeRichMediaContent` | `(dict) => Content` | `{ type?, assets, configurations, views, raw }` (`type` the `/Type` name, present only when the key is). |
| `typeRichMedia` | `(dict, kind) => RichMedia` | A RichMedia dictionary of the given kind — `activation`, `animation`, `command`, `configuration`, `deactivation`, `height`, `instance`, `position`, `presentation`, `settings`, `width`, `window`: one field per ISO 32000-2 key of its list (the ISO/TS 32007 `AO`, `Scene` and Adobe's `Params` go to `_extras`), named after the key in lower case (`PlayCount` → `playcount`, `HAlign` → `halign`), present only when the key is — a name, a text string (its bytes), a number, an integer or a boolean by its value, an array or a dictionary as read (a reference as read), a command's `A` read by the first of its types that fits, `null` for a value of none — plus `raw` and `_extras` (the other keys). |
| `RICH_MEDIA_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
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
| `pdf/extra/3d/measure/not-dict` | `ParseError` | `type3DMeasure`: not a dict. |
| `pdf/extra/3d/measure/bad-subtype` | `ParseError` | `type3DMeasure`: `/Subtype` missing or not `RD3`, `AD3`, `PD3`, `LD3`, `3DC`. |
| `pdf/extra/3d/scene/not-dict` | `ParseError` | `type3DScene`: neither a dictionary nor a stream. |
| `pdf/extra/3d/scene/kind` | `ContractError` | `type3DScene`: `kind` missing or not a key of `SCENE_KEYS`. |
| `pdf/extra/rm/dict/not-dict` | `ParseError` | `typeRichMedia`: not a dict. |
| `pdf/extra/rm/dict/kind` | `ContractError` | `typeRichMedia`: `kind` missing or not a key of `RICH_MEDIA_KEYS`. |
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
