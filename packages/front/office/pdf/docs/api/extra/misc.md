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
//   typeDocMdpParams, typePerms, typeNeedsRendering,
//   REQUIREMENT_S_VALUES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeSpiderInfo` | `(dict) => { version?, commands?, raw, _extras }` | §14.10.2. |
| `typeThreads` | `(array) => Array<dict\|ref>` | §12.4.3, entries left unresolved. |
| `typeLegal` | `(dict) => { raw, flags, attestation?, _extras }` | §12.8.5. |
| `typeRequirements` | `(array) => Array<{ raw, s, standard, rh }>` | §12.10. |
| `typeDocMdpParams` | `(dict) => { permission?, version?, raw, _extras }` | §12.8.2.2. |
| `typePerms` | `(dict) => { docMDP?, ur3?, ur?, raw, _extras }` | §12.8.2. |
| `typeNeedsRendering` | `(value) => boolean` | XFA indicator. |
| `REQUIREMENT_S_VALUES` | `Set` | `EnableJavaScripts`. |

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
| `pdf/misc/req-not-array` | `ParseError` | Requirements is not an array. |
| `pdf/misc/req-bad-entry` | `ParseError` | Entry is not a dict. |
| `pdf/misc/req-missing-S` | `ParseError` | `/S` absent. |
| `pdf/misc/docmdp-not-dict` | `ParseError` | DocMDP is not a dict. |
| `pdf/misc/docmdp-bad-P` | `ParseError` | `/P` is not an int. |
| `pdf/misc/docmdp-bad-V` | `ParseError` | `/V` is not a name. |
| `pdf/misc/perms-not-dict` | `ParseError` | Perms is not a dict. |
| `pdf/misc/needsrendering-bad` | `ParseError` | Not a bool. |

## See also

- [`pdfCatalog`](../document/catalog.md)
- [Extras index](./README.md)
