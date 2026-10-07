# OPC — Open Packaging Conventions

**Purpose**: explain the container model shared by the three formats and how `opcPackage` reads and writes it.
**Prerequisites**: none beyond [Getting started](./getting-started.md); the module is `opcPackage` (sub-path `@awacloud/ooxml/opc`).

Every OOXML format (`.docx`, `.xlsx`, `.pptx`) shares the same
foundation: **a ZIP container** whose internal structure is governed by
ECMA-376 part 2 — *Open Packaging Conventions*.

## Minimal anatomy

An OOXML package contains at least:

```
mydoc.docx                       (ZIP container)
├── [Content_Types].xml          ← required, at the root
├── _rels/
│   └── .rels                    ← package-level relationships
└── word/                        (format-specific prefix — word/, xl/, ppt/)
    ├── document.xml             ← main part
    └── _rels/
        └── document.xml.rels    ← document.xml's relationships (if needed)
```

## Three roles

1. **The ZIP container** (RFC ZIP, ISO/IEC 21320-1).
   `@awacloud/ooxml` relies on [`@awacloud/fw/io/compress/zip.js`](https://github.com/awacloud/awa/blob/@awacloud/ooxml@1.0.0/packages/front/fw/src/io/compress/zip.js)
   (DEFLATE + ZIP64), zero external dependency.

2. **`[Content_Types].xml`** declares the **MIME type** of each part:
   - `<Default Extension="…" ContentType="…"/>` — by file extension.
   - `<Override PartName="/abs/path" ContentType="…"/>` — for a specific
     part. Overrides take precedence over defaults.

3. **Relationships** (`*.rels`) — a typed graph between parts.
   - `_rels/.rels` at the package root: "package-level" relationships,
     typically the pointer to the main part (`officeDocument`).
   - `<dir>/_rels/<file>.rels`: relationships owned by `<dir>/<file>`.
   - A `Type` URI identifies the nature of the relationship
     (`…/officeDocument`, `…/styles`, `…/image`, …).

## Read cycle (`opc.read(bytes)`)

1. Decompress the ZIP with `unzipSync`.
2. Read `[Content_Types].xml` → `{ defaults, overrides }`.
3. For each entry:
   - If it matches `*.rels` (path containing `_rels/`), parse it as
     relationships and attribute it to its **owning part**
     (`/word/document.xml.rels` → `/word/document.xml`,
     `_rels/.rels` → `/`).
   - Otherwise, store the raw `Uint8Array` under its absolute part name
     (`/word/document.xml`).
4. Return `{ contentTypes, parts, rels }`.

The format modules (docx/xlsx/pptx) then consume this package: they
follow the relationships to reach the main part (via the
`officeDocument` type) and delegate to their own XML parser.

## Write cycle (`opc.write(pkg)`)

1. Serialize `[Content_Types].xml` from `pkg.contentTypes`.
2. For each relationship set in `pkg.rels`, serialize it under the
   corresponding `*.rels` path (`opcRelationships.relsPathFor`).
3. Include each part of `pkg.parts` at its path (stripped of the
   leading `/`).
4. Package everything via `zipSync`, every entry stamped 1980-01-01 00:00
   unless `opts.mtime` is given.

## Naming conventions

- **Part name** — always absolute, starts with `/`
  (`/word/document.xml`). On the ZIP side, the path has **no** leading
  `/` — `opc.read`/`opc.write` handle the conversion.
- **Target** in relationships — relative by default to the source's
  directory. `opcRelationships.resolveTarget(source, target)` computes
  the absolute path.

## See also

- ECMA-376 part 2 (Open Packaging Conventions), 5th edition, December
  2021 — the Ecma International standard this layer implements.
- [`src/opc/package.js`](../../src/opc/package.js) — implementation.
- [`opcPackage` API reference](../api/opc/package.md) — full method
  signatures, including the `ooxmlShared` dependency added by the L4
  finalization.
