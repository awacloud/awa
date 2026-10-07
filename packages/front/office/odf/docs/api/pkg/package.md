---
module: pkgPackage
category: odf/pkg
dependencies: [odfErrors, odfShared, zip, pkgMimetype, pkgManifest]
returns: object
worker-safe: true
status: complete
---

# pkgPackage

> ODF container — ZIP + mimetype + `META-INF/manifest.xml`.

**Module** `pkgPackage` | **Source** `packages/front/office/odf/src/pkg/package.js` | **Deps** `odfErrors`, `odfShared`, `zip`, `pkgMimetype`, `pkgManifest` | **Worker-safe** yes

An ODF package is a ZIP archive with two constraints:

- `mimetype` must be the **first** ZIP entry, **STORED** (no compression, no extra field).
- `META-INF/manifest.xml` declares every file entry with its media-type.

Model:

```js
{
  mimetype: 'application/vnd.oasis.opendocument.text',
  manifest: { version, entries: [...] },
  parts: { 'content.xml': Uint8Array, 'styles.xml': Uint8Array, ... }
}
```

Part paths have no leading slash (`'content.xml'`, `'Pictures/image1.png'`), same as manifest entries for non-root parts.

## Resolve

```js
const pkg = runtime.resolve('pkgPackage');
// → { read, write, empty, setPart, getPart, getPartText, MIMETYPE_PATH, MANIFEST_PATH, DEFAULT_LIMITS }
```

## API

| Method | Description |
|--------|-------------|
| `read(bytes, opts?)` | `{ mimetype, manifest, parts }`. `opts` overrides the ZIP bomb caps: `maxParts` (default `4096`), `maxUncompressed` (default `268435456`, 256 MiB), `maxRatio` (default `200`); `0` disables a cap. A breached cap throws `ParseError('odf/parse-error/zip-bomb')` with `context.limit` naming it; an option that is not a finite number >= 0 throws `ContractError('odf/contract-error/pkg')`. Throws `ParseError('odf/parse-error/pkg')` if mimetype/manifest are missing or the ZIP is invalid. |
| `write(pkg)` | `Uint8Array`; mimetype emitted first (STORED). Throws `ContractError` if `pkg.mimetype` is missing. |
| `empty(mimetype)` | Skeleton `{ mimetype, manifest, parts: {} }`. |
| `setPart(pkg, path, bytes, mediaType?)` | Adds the part **and** a manifest entry. |
| `getPart(pkg, path)` / `getPartText(pkg, path)` | Read helpers. |
| `MIMETYPE_PATH` / `MANIFEST_PATH` | `'mimetype'` / `'META-INF/manifest.xml'`. |
| `DEFAULT_LIMITS` | Frozen `{ maxParts: 4096, maxUncompressed: 268435456, maxRatio: 200 }` — the `read` defaults. |

## Examples

```js
const pkg = runtime.resolve('pkgPackage');
const mt = runtime.resolve('pkgMimetype');
const p = pkg.empty(mt.CT_ODT);
pkg.setPart(p, 'content.xml', new TextEncoder().encode('<x/>'), 'text/xml');
const bytes = pkg.write(p);
```

## Security — ZIP bomb guards

`read(bytes, opts?)` enforces three bounds while unzipping. They are checked per
entry, before that entry is inflated, so a bomb is rejected without paying for
its payload. `maxUncompressed` and `maxRatio` are the values `@awacloud/ooxml`
ships; the entry cap is higher (see below).

| Option | Default | Guards against |
|--------|---------|----------------|
| `maxParts` | `4096` | Archives with an absurd number of entries (directory entries count). |
| `maxUncompressed` | `256 * 1024 * 1024` | Total inflated size. |
| `maxRatio` | `200` | Compression-ratio zip bombs (per entry). |

Breaching any of them raises `ParseError('odf/parse-error/zip-bomb')` with the
offending `context.limit` (plus `max`, and `actual`, `name` or `ratio` as
relevant). Pass `0` to disable a cap. There is no per-entry uncompressed-size
cap. The STORED `mimetype` entry has ratio 1 and never trips `maxRatio`.

Why 4096 entries: a LibreOffice document with many embedded objects (formula
objects, charts) carries a directory entry and several parts per object, so a
formula-heavy text easily exceeds a thousand entries — the reference case is a
1606-entry document. `maxUncompressed` and `maxRatio` still bound the archive.

```js
const pkg = runtime.resolve('pkgPackage');
const mt = runtime.resolve('pkgMimetype');
const p = pkg.empty(mt.CT_ODT);
pkg.setPart(p, 'Pictures/pad.bin', new Uint8Array(1024 * 1024)); // zeros: ratio far above 200
const bytes = pkg.write(p);
try {
    pkg.read(bytes);
} catch (e) {
    console.log(e.code, e.context.limit); // → odf/parse-error/zip-bomb maxRatio
}
const back = pkg.read(bytes, { maxRatio: 0 }); // cap disabled
console.log(back.parts['Pictures/pad.bin'].length); // → 1048576
```

## Notes

- The `mimetype` file is forced into first position via insertion ordering of the `files` object passed to `zip.zipSync`, and always written as `[bytes, { level: 0 }]` for STORED.
- If reading fails at the ZIP layer (non-ZIP bytes), a `ParseError` `odf/parse-error/pkg` is thrown with a chained `cause`. A ZIP bomb error is never re-wrapped this way: it keeps its `odf/parse-error/zip-bomb` code.
- The ZIP layer's unsafe-path (zip-slip) refusal surfaces as `odf/parse-error/pkg` too.

## See also

- [pkg/mimetype](./mimetype.md)
- [pkg/manifest](./manifest.md)
- [odt/odt](../odt/odt.md)
