---
module: opcPackage
category: ooxml/opc
dependencies: [ooxmlErrors, zip, opcContentTypes, opcRelationships, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# opcPackage

> OPC container (ZIP, ECMA-376 part 2) — read/write of a `.docx`/`.xlsx`/`.pptx` package.

**Module** `opcPackage` | **Source** `packages/front/office/ooxml/src/opc/package.js` | **Deps** `ooxmlErrors`, `zip`, `opcContentTypes`, `opcRelationships`, `ooxmlShared` | **Worker-safe** yes

An OPC package is a ZIP holding `[Content_Types].xml` at its root, XML/binary parts, and `.rels` files describing the typed links. This module wraps `@awacloud/fw`'s `zip` and decodes the auxiliary parts through [`opcContentTypes`](./content-types.md) and [`opcRelationships`](./relationships.md).

## Resolve

```js
const opc = runtime.resolve('opcPackage');
// Returns: { read, write, empty, setPart, setRels,
//            bytesToString, stringToBytes,
//            isRelsPath, ownerPartFromRels,
//            defaultLimits }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `read` | `(bytes: Uint8Array, opts?) => Package` | Decoded package. `opts` overrides the zip-bomb limits; `docx.read`, `xlsx.read` and `pptx.read` forward the same three keys. |
| `write` | `(pkg: Package, opts?: { mtime?: number\|Date }) => Uint8Array` | ZIP bytes. Every entry is stamped `opts.mtime`, default 1980-01-01 00:00:00 (the timestamp Office applications write). |
| `empty` | `() => Package` | Empty skeleton (`rels` + `xml` defaults). |
| `setPart` | `(pkg, partName: string, data: Uint8Array, contentType?: string) => pkg` | Adds/replaces a part. |
| `setRels` | `(pkg, sourcePart: string, rels: Rel[]) => pkg` | Sets a part's relationships (`'/'` = the package root). |
| `bytesToString` / `stringToBytes` | `(u8)` / `(s)` | UTF-8 helpers. |
| `isRelsPath` | `(zipPath: string) => boolean` | True for `_rels/.rels` and `<dir>/_rels/<file>.rels`. |
| `ownerPartFromRels` | `(zipPath: string) => string` | Absolute name of the part a `.rels` file belongs to. |
| `defaultLimits` | frozen object | `{ maxParts: 1024, maxUncompressed: 268435456, maxRatio: 200 }`. |

### `read` limits

| Option | Default | Guards against |
|--------|---------|----------------|
| `maxParts` | `1024` | Archives with an absurd number of entries. |
| `maxUncompressed` | `256 * 1024 * 1024` | Total inflated size. |
| `maxRatio` | `200` | Compression-ratio zip bombs. |

Breaching any of them raises `ParseError('opc/zip-bomb')` with the offending
`context.limit`.

## Package shape

```js
{
    contentTypes: { defaults: { ext: ct }, overrides: { partName: ct } },
    parts: { '/word/document.xml': Uint8Array, … },
    rels:  { '/': [Rel,…], '/word/document.xml': [Rel,…] }
}
```

Part names are **absolute** (leading `/`). The package root's relationships live under the `'/'` key.

## Examples

### Read a package and reach a part

```js
const opc = runtime.resolve('opcPackage');
const pkg = opc.read(bytes);

const docXml = opc.bytesToString(pkg.parts['/word/document.xml']);
const docRels = pkg.rels['/word/document.xml'];
// → [{ Id: 'rId1', Type: '…/styles', Target: 'styles.xml' }, …]
```

### Build a minimal package

```js
const pkg = opc.empty();
opc.setPart(pkg, '/word/document.xml',
    opc.stringToBytes('<?xml…?><w:document …/>'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
opc.setRels(pkg, '/', [{
    Id: 'rId1', Type: '…/officeDocument', Target: 'word/document.xml'
}]);
const out = opc.write(pkg);
```

### Relax the limits for a known-large archive

```js
const pkg = opc.read(bytes, { maxUncompressed: 512 * 1024 * 1024 });
```

## Notes

- `read` raises `ParseError('opc/missing-content-types')` when `[Content_Types].xml` is absent (an invalid ECMA-376 package), and `ContractError('opc/invalid-input')` when `bytes` is not a `Uint8Array`.
- ZIP directory entries (paths ending in `/`) are ignored — heterogeneous archives are tolerated.
- `write` does not reorder parts, but emits `[Content_Types].xml` first, then the rels, then the parts.
- `write` output is byte-reproducible by default: two writes of the same package are byte-identical, because every entry carries the fixed 1980-01-01 00:00:00 timestamp unless `opts.mtime` (a `Date` or a millisecond epoch number, local time, within 1980-2099) is given; a value outside that range raises `RenderError('opc/zip-failed')`. The exceptions are the identifiers the format writers generate when the caller omits them (the custom XML `storeItemID`, threaded-comment ids): those still differ between two writes unless the caller supplies them.
- For binary images, pass the `Uint8Array` straight to `setPart` — do not route it through `stringToBytes`.

## See also

- [opc-content-types](./content-types.md) — the package's MIME registry.
- [opc-relationships](./relationships.md) — the typed link graph.
- [OPC guide](../../guide/opc-overview.md) — overview.
