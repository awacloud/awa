---
module: pdfMisc
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfMisc

> Miscellaneous Catalog-level typing (SpiderInfo, Threads, Legal, …).

**Module** `pdfMisc` | **Source** `packages/front/office/pdf/src/extra/misc.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Long tail of Catalog entries that don't warrant their own L1 module:
- `/SpiderInfo` (§14.10.2) — Web-Capture provenance
- `/Threads` (§12.4.3) — articles
- `/Legal` (§12.8.5) — legal attestation
- `/Requirements` (§12.10)
- `/Perms` (§12.8.2) — DocMDP, UR3, UR
- `/NeedsRendering` — XFA indicator

## Resolve

```js
const ext = runtime.resolve('pdfMisc');
// Returns: { typeSpiderInfo, typeThreads, typeLegal, typeRequirements,
//   typeRequirementHandler,
//   typeDocMdpParams, typePerms, typeNeedsRendering,
//   typeViewerPreferences, typeMeasurement, MEASUREMENT_KEYS,
//   typeXObjectEntries, XOBJECT_ENTRY_KEYS, typeWebCapture,
//   WEB_CAPTURE_KEYS, typeFieldLock, typePresentation,
//   PRESENTATION_KEYS, typeCatalogPart, CATALOG_PART_KEYS,
//   typeObjectEntries, OBJECT_ENTRY_KEYS,
//   REQUIREMENT_S_VALUES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeSpiderInfo` | `(dict) => { version?, commands?, raw, _extras }` | §14.10.2. |
| `typeThreads` | `(array) => Array<dict\|ref>` | §12.4.3, entries left unresolved. |
| `typeLegal` | `(dict) => { raw, flags, attestation?, optionalContent?, _extras }` | §12.8.5. `HideAnnotationActions` and `GoToRemoteActions` join `flags` when an integer, `OptionalContent` is `optionalContent` when a boolean (a value of another type stays in `_extras`). |
| `typeRequirements` | `(array) => Array<{ raw, s, standard, rh, type?, v?, penalty?, digSig?, encrypt? }>` | §12.10. ISO 32000-2's keys present only when the key is: `type` and a name `v` by value (a dictionary `v` as read), `penalty` an integer, `digSig` / `encrypt` a dictionary or reference as read; `null` for a value of another type. |
| `typeRequirementHandler` | `(dict) => { type, s, script, raw, _extras }` | A requirement handler (an `/RH` entry): `type`, `s` names by value, `script` the text string's bytes. |
| `typeDocMdpParams` | `(dict) => { permission?, version?, type?, raw, _extras }` | §12.8.2.2. |
| `typePerms` | `(dict) => { docMDP?, ur3?, ur?, raw, _extras }` | §12.8.2. |
| `typeNeedsRendering` | `(value) => boolean` | XFA indicator. |
| `typeViewerPreferences` | `(dict) => { hideToolbar, hideMenubar, hideWindowUI, fitWindow, centerWindow, displayDocTitle, nonFullScreenPageMode, direction, viewArea, viewClip, printArea, printClip, printScaling, duplex, pickTrayByPDFSize, printPageRange, numCopies, enforce, raw, _extras }` | §12.2 Table 147: the booleans (default `false`) and names (default `UseNone`, `L2R`, `CropBox`, `AppDefault`) by value, a value of another type giving the default; `duplex` a name or `null`; `printPageRange` the `[first, last]` pairs of an even-length integer array, else `null`; `numCopies` a positive integer, else `null`; `enforce` the names of an array of names, else `null`; other entries in `_extras`. |
| `typeMeasurement` | `(dict, kind) => Measurement` | A measurement dictionary of the given kind — `rectilinear` (`/Measure` `/RL`), `geospatial` (`/Measure` `/GEO`), `numberFormat`, `viewport`, `pointData`, the coordinate systems `geographicCS` and `projectedCS` (`Type`, `EPSG`, `WKT`), `markupGeo` (a geospatial markup's external data: `Type`, `Subtype`): one field per key of its list, named after the key in lower case (`CYX` → `cyx`, `BBox` → `bbox`, `PtData` → `ptdata`), present only when the key is — a name, a text string (its bytes), a number, the integer `d` of a number format or a boolean by its value, an array (a rectangle included) or a dictionary as read (a reference as read, whatever the key's type), `null` for a value of another type — plus `raw` and `_extras` (the other keys). No default is filled in. |
| `MEASUREMENT_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeXObjectEntries` | `(stream\|dict, kind) => { kind, raw, … }` | The companion of the core `pdfImages` XObject typers: the keys of an XObject they leave out, `kind` `image`, `imageMask`, `softMask`, `form`, `printerMark`, `trapNet`, `ps`, `psPassthrough` — one field per key of its list, named after the key in lower case (`SMaskInData` → `smaskindata`, `LastModified` → `lastmodified`), present only when the key is: a name, a string (its bytes; a date as its string), an integer or a boolean by its value, an array, a dictionary or a stream as read, a reference as read, `null` for a value of another type. No `_extras`: the other keys are the core typers' part. |
| `XOBJECT_ENTRY_KEYS` | frozen object | Kind → the keys it types (the Arlington PDF Model's types). |
| `typeWebCapture` | `(dict, kind) => WebCapture` | A Web Capture page set, image set, command or command settings dictionary (`kind` `pageSet`, `imageSet`, `command`, `commandSettings`): one field per key of its list, named after the key in lower case (`TID` → `tid`, `URL` → `url`), present only when the key is — a name, a string (its bytes; a date as its string), an integer (the `F` bit mask included) by its value, an array, a dictionary or a stream as read, a reference as read, a key of several types (`SI`, `R`, `P`) by the first that fits, `null` for none — plus `raw` and `_extras`. |
| `WEB_CAPTURE_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeFieldLock` | `(dict, kind) => { type?, action?, fields?, p?, v?, raw, _extras }` | A signature field's lock (`kind` `lock`: `p` a number), the FieldMDP transform parameters (`fieldMdp`: `v` a name) or the UR transform parameters (`urTransform`: `type`, `v` names, `msg` the string's bytes, `document`, `annots`, `form`, `signature`, `ef` arrays as read, `p` a boolean); names by value, `fields` as read, present only when the key is. |
| `typePresentation` | `(dict, kind) => Presentation` | A presentation or navigation dictionary (`kind` `floatingWindow`, `transition`, `navNode`, `bead` — the first bead included — `thread`, `slideShow`, `pageLabel`, `viewParams`, `outlines` — the outline root's `Type`, `First`, `Last`, `Count`): one field per key of its list, named after the key in lower case (`StartResource` → `startresource`), present only when the key is — a name, a string (its bytes), a number, an integer or a boolean by its value, an array, a dictionary or a stream as read (a reference as read), a key of several types (`Di`, `Data`) by the first that fits, `null` for a value of another type — plus `raw` and `_extras`. |
| `PRESENTATION_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeCatalogPart` | `(dict, kind) => CatalogPart` | The catalog's name dictionary (`kind` `names`: each tree's root dictionary as read), its extensions dictionary (`extensions`: `Type`, `ISO_` an array or a dictionary as read), a developer extensions dictionary, ISO's included (`devExtensions`: `Type`, `BaseVersion` names, `ExtensionLevel` an integer, `URL`, `ExtensionRevision` a string's bytes) or its URI dictionary (`uri`: `Base`, a string's bytes): one field per key of its list, named after the key in lower case, present only when the key is — a reference as read, `null` for a value of another type — plus `raw` and `_extras`. |
| `CATALOG_PART_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `typeObjectEntries` | `(stream\|dict, kind) => ObjectEntries` | The companion of the core typers that read these keys without putting them in their record: a thumbnail (`kind` `thumbnail`), a CMap or ToUnicode stream (`cmap`), an ICC profile (`iccProfile`), a page tree node, the root included (`pageTree`), a resource dictionary (`resource`), an encoding (`encoding`), the trailer (`trailer`), an object stream (`objectStream`); a stream's dictionary is read. One field per key of its list, named after the key in lower case, present only when the key is — a name or an integer by its value, an array, a dictionary or a stream as read, a key of several types (`ColorSpace`, `UseCMap`, `Alternate`) by the first that fits, a reference as read, `null` for a value of another type — plus `raw` (the value given) and `_extras`. |
| `OBJECT_ENTRY_KEYS` | frozen object | Kind → its keys (the Arlington PDF Model's lists). |
| `REQUIREMENT_S_VALUES` | `Set` | The 27 requirement types of ISO 32000-2 (`3DMarkup` … `glTF`, `STEP`; the Arlington model's), each `standard`. |

## Examples

### SpiderInfo

```js
const ext = runtime.resolve('pdfMisc');
const s = ext.typeSpiderInfo(catalog.spiderInfo);
s.version;  // 1.0
```

### Threads

```js
const ts = ext.typeThreads(catalog.threads);
ts.length;
```

### ViewerPreferences

```js
const { obj } = runtime.resolve('pdfParserObj');
const vp = ext.typeViewerPreferences(obj.dict({
    DisplayDocTitle: obj.bool(true), Direction: obj.name('R2L'),
    PrintPageRange: obj.array([1, 3, 7, 7].map(obj.int)), NumCopies: obj.int(2)
}));
vp.displayDocTitle;   // true
vp.direction;         // 'R2L'
vp.printPageRange;    // [[1, 3], [7, 7]]
vp.printScaling;      // 'AppDefault' (the Table 147 default)
```

### NeedsRendering

```js
ext.typeNeedsRendering({ type: 'bool', value: true });  // true
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/misc/spider-not-dict` | `ParseError` | SpiderInfo is not a dict. |
| `pdf/misc/spider-bad-V` | `ParseError` | `/V` is not numeric. |
| `pdf/misc/spider-bad-C` | `ParseError` | `/C` is not an array. |
| `pdf/misc/threads-not-array` | `ParseError` | `/Threads` is not an array. |
| `pdf/misc/thread-bad-entry` | `ParseError` | Entry is neither dict nor ref. |
| `pdf/misc/legal-not-dict` | `ParseError` | Legal is not a dict. |
| `pdf/misc/legal-bad-flag` | `ParseError` | A flag is not an int. |
| `pdf/misc/legal-bad-attestation` | `ParseError` | `/Attestation` is not a string. |
| `pdf/misc/viewer-prefs-not-dict` | `ParseError` | ViewerPreferences is not a dict. |
| `pdf/misc/measurement/not-dict` | `ParseError` | `typeMeasurement`: not a dict. |
| `pdf/misc/measurement/kind` | `ContractError` | `typeMeasurement`: `kind` missing or not a key of `MEASUREMENT_KEYS`. |
| `pdf/misc/xobject/not-dict` | `ParseError` | `typeXObjectEntries`: neither a stream nor a dict. |
| `pdf/misc/xobject/kind` | `ContractError` | `typeXObjectEntries`: `kind` missing or not a key of `XOBJECT_ENTRY_KEYS`. |
| `pdf/misc/web-capture/not-dict` | `ParseError` | `typeWebCapture`: not a dict. |
| `pdf/misc/web-capture/kind` | `ContractError` | `typeWebCapture`: `kind` missing or unknown. |
| `pdf/misc/field-lock/not-dict` | `ParseError` | `typeFieldLock`: not a dict. |
| `pdf/misc/field-lock/kind` | `ContractError` | `typeFieldLock`: `kind` not `lock`, `fieldMdp` or `urTransform`. |
| `pdf/misc/presentation/not-dict` | `ParseError` | `typePresentation`: not a dict. |
| `pdf/misc/presentation/kind` | `ContractError` | `typePresentation`: `kind` missing or not a key of `PRESENTATION_KEYS`. |
| `pdf/misc/catalog-part/not-dict` | `ParseError` | `typeCatalogPart`: not a dict. |
| `pdf/misc/catalog-part/kind` | `ContractError` | `typeCatalogPart`: `kind` missing or not a key of `CATALOG_PART_KEYS`. |
| `pdf/misc/object-entries/not-dict` | `ParseError` | `typeObjectEntries`: neither a stream nor a dict. |
| `pdf/misc/object-entries/kind` | `ContractError` | `typeObjectEntries`: `kind` missing or not a key of `OBJECT_ENTRY_KEYS`. |
| `pdf/misc/req-not-array` | `ParseError` | Requirements is not an array. |
| `pdf/misc/req-bad-entry` | `ParseError` | Entry is not a dict. |
| `pdf/misc/req-missing-S` | `ParseError` | `/S` absent. |
| `pdf/misc/req-handler-not-dict` | `ParseError` | `typeRequirementHandler`: not a dict. |
| `pdf/misc/docmdp-not-dict` | `ParseError` | DocMDP is not a dict. |
| `pdf/misc/docmdp-bad-P` | `ParseError` | `/P` is not an int. |
| `pdf/misc/docmdp-bad-V` | `ParseError` | `/V` is not a name. |
| `pdf/misc/perms-not-dict` | `ParseError` | Perms is not a dict. |
| `pdf/misc/needsrendering-bad` | `ParseError` | Not a bool. |

## See also

- [`pdfCatalog`](../document/catalog.md)
- [Extras index](./README.md)
