# Pkg overview — ODF container

What the `pkgPackage` / `pkgManifest` / `pkgMimetype` modules read and write: the
ZIP layout shared by `.odt`, `.ods` and `.odp`.

**Prerequisites.** `@awacloud/odf` and `@awacloud/fw`, with a `runtime` wired as in
[Getting started](./getting-started.md) (`fw_require` + `modules` registered on an
`@awacloud/fw` `ModuleRuntime`); the snippets below reuse that `runtime`.

A `.odt` / `.ods` / `.odp` file is a **ZIP archive** with a convention:

```
.odt
├── mimetype                    ← STORED uncompressed, FIRST entry
├── META-INF/
│   └── manifest.xml            ← declares the file-entries + media-types
├── content.xml                 ← main content
├── styles.xml                  ← named styles + master pages
├── meta.xml                    ← Dublin Core + ODF metadata
└── settings.xml                ← UI config (volatile)
```

## Constraints

1. `mimetype` must be the **first** ZIP entry.
2. It must be **STORED** (compression method 0, no DEFLATE).
3. No extra field on the `mimetype` entry.

These constraints let a naive tool sniff an ODF file's type by reading
the first ~38 bytes of the file.

## Implementation

The `pkgPackage` module:

- Forces `mimetype` to be the first key of the object passed to
  `zip.zipSync`.
- Uses the per-file option `[bytes, { level: 0 }]` for STORED.
- Reads/writes `META-INF/manifest.xml` via `pkgManifest`.

## Minimal API

```js
const pkg = runtime.resolve('pkgPackage');
const mt = runtime.resolve('pkgMimetype');

const xmlBytes = new TextEncoder().encode('<office:document-content/>');
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const p = pkg.empty(mt.CT_ODT);
pkg.setPart(p, 'content.xml', xmlBytes, 'text/xml');
pkg.setPart(p, 'Pictures/img1.png', pngBytes, 'image/png');

const bytes = pkg.write(p);  // → valid ZIP
```

## Round-trip: what travels

`write(read(x))` on `odt`, `ods` and `odp` starts from a fresh package and
fills it in this order:

- **Regenerated** — `content.xml` from the typed model, and the three sidecars
  `meta.xml`, `settings.xml`, `styles.xml` (`odfShared.REGENERATED_PARTS`).
  Each sidecar comes from `opts.*`, else from the read model's `doc.meta` /
  `doc.settings` / `doc.styles`, else from an empty model, so named styles and
  settings survive a re-write. `meta:generator` names the application that
  last wrote the file: it is rewritten to `@awacloud/odf` unless the caller
  passes `opts.meta.generator`.
- **Writer-supplied** — parts the facade emits itself (for `odt`,
  `doc.pictures`).
- **Carried** — every other part of `doc.package` (thumbnails, pictures,
  `Configurations2/…`, embedded objects), byte-for-byte, with the media type
  the source manifest declared (`application/octet-stream` when none), plus
  the source manifest's directory entries (`fullPath` ending in `/`).
- **Namespace declarations** — every regenerated part declares, on its root,
  each namespace prefix it uses. The source part's own root declarations are
  reused first (`odfShared.sourceNamespaces`), so third-party extension markup
  kept in `_extras` stays bound to its namespace; the known table
  (`odfShared.ODF_PREFIXES`) covers the rest. A prefix nobody declares makes
  the write throw `RenderError` with code `odf/render-error/namespace`.

A regenerated part always wins over a writer-supplied one, which wins over a
carried copy. To drop carried material, delete it from `doc.package.parts` or
delete `doc.package` altogether.

**Not carried**: the extra attributes and children of manifest entries
(`manifest:size`, encryption data). **Not restored**: the original position of
a frame inside a paragraph — the read side keeps it in the paragraph's
`_extras`, which a re-write emits after the runs. Inside a `text:span` the
markup is kept in place: spacing elements (`text:s`, `text:tab`,
`text:line-break`), nested spans with their own styles, links, fields and
frames anchored in the span keep their position (see
[text/paragraph — Span runs](../api/text/paragraph.md#span-runs)). Zip bytes are not identical
across writes (entry timestamps); parts and manifest entries are.

```js
const odt = runtime.resolve('odt');
const pkg = runtime.resolve('pkgPackage');

const src = pkg.read(odt.write(odt.fromText(['x'])));
pkg.setPart(src, 'Thumbnails/thumbnail.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png');
const doc = odt.read(pkg.write(src));

const out = pkg.read(odt.write(doc));
out.parts['Thumbnails/thumbnail.png'];   // carried, same bytes, 'image/png'

delete doc.package;
pkg.read(odt.write(doc)).parts['Thumbnails/thumbnail.png'];  // undefined
```

## Difference vs OPC (OOXML)

| Aspect | OPC (OOXML) | Pkg (ODF) |
|--------|-------------|-----------|
| Type identity | `[Content_Types].xml` overrides | STORED `mimetype` file |
| Relations | Per-part `.rels` | Inline `xlink:href` + global manifest |
| Part naming | Absolute slash `/word/document.xml` | No leading slash `content.xml` |
| Sub-package | Not standard | Sub-document in a directory (`Object 1/…`), carried as ordinary parts |

## See also

- [API pkg/package](../api/pkg/package.md)
- [API pkg/mimetype](../api/pkg/mimetype.md)
- [API pkg/manifest](../api/pkg/manifest.md)
