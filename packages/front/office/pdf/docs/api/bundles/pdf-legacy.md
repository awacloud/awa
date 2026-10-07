---
module: pdfLegacyBundle
category: pdf/bundles
dependencies: [pdf, pdfContentOpsExtended, pdfFontCidTyped, pdfFontColorTagging, pdfTaggedPdfTyped, pdfAnnotExtended, pdfAOutputIntent, pdfUaTagged, pdfFormActionsExtended, pdfColorSpacesExtended, pdfShadingTyped, pdfTransparencyTyped, pdfSigPades, pdfSigAesGcm, pdfDocumentParts, pdfRedactionIso32005, pdfXPrepress, pdfWellTagged, pdfOptionalContentExtended, pdfEmbeddedFilesPortfolio, pdfAssociatedFiles2, pdfXmpExtended, pdfLinearizationWrite, pdf3dRichMedia, pdfJbig2Read, pdfMisc, pdfInfoDictDeprecated, pdfSandbox, pdfLegacyXfaRead, pdfLegacyRc4Read, pdfLegacyDeprecatedFilters, pdfLegacyDeprecatedAnnots]
returns: object
worker-safe: true
status: complete
---

# pdfLegacyBundle

> `pdfFullBundle` + the PDF 1.7 legacy readers.

**Module** `pdfLegacyBundle` | **Source** `packages/front/office/pdf/src/bundles/pdf-legacy.js` | **Deps** `pdf` + the 31 extras enumerated under [Extras wired](#extras-wired) (32 names total, listed literally in the frontmatter `dependencies`; the `@awacloud/fw` `lzw` binding is a further transitive requirement of `pdfLegacyDeprecatedFilters`, not a direct entry) | **Worker-safe** yes

A module descriptor that adds the `legacy-*` extras on top of `pdfFullBundle`:

- `legacy-xfa-read` — accepts `/XFA` on read, surfaces it as opaque XML.
- `legacy-rc4-read` — RC4 v2/v3 password validation + stream decrypt.
- `legacy-deprecated-filters` — LZWDecode (via the `@awacloud/fw` `lzw` factory), CCITTFaxDecode (a full ITU-T T.4 / T.6 decoder, through `pdfCcittFaxDecoder`), DCT/JPX passthrough. These decoders are called through the extra's own API; they are not registered into `pdfFilterDispatch`, so `read` does not apply them to streams by itself.
- `legacy-deprecated-annots` — Sound/Movie/Screen typing (read-only; no conversion to RichMedia).

`pdfInfoDictDeprecated` (Info dict lint) is already wired by `pdf-full`; `pdf-legacy` re-lists it idempotently.

**Writing PDF 1.7 is never supported** — `write` always emits a `%PDF-2.0` header. It does **not** convert legacy content: it re-emits the objects of the model it is given, so an `/XFA` entry, an RC4 `/Encrypt` dictionary, an LZW-filtered stream or a Sound/Movie annotation read from a 1.7 file is written back as it was. Converting it is the caller's work.

## Resolve

```js
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules, extras, bundle } from '@awacloud/pdf';

const rt = new ModuleRuntime();
for (const m of fw_require)  rt.register(m);   // provides the real `lzw` fw binding
for (const m of pkg_require) rt.register(m);
for (const m of modules)     rt.register(m);
for (const m of extras)      rt.register(m);
for (const m of bundle)      rt.register(m);

const api = rt.resolve('pdfLegacyBundle');
const doc = api.read(oldPdfBytes);   // PDF 1.7 OK
const out = api.write(doc);          // always PDF 2.0
```

The `extras` and `bundle` descriptors are **not** re-exported from the package root by binding name — `import { pdfLegacyBundle } from '@awacloud/pdf'` is `undefined`. Register the arrays as above, or import the single descriptor from its own subpath export (`import { pdfLegacyBundle } from '@awacloud/pdf/pdf-legacy';`). Unlike `pdf-large` and `pdf-full`, `pdf-legacy` **cannot** be resolved without `fw_require` registered: omitting it throws `Module not found: lzw`.

`pdfLegacyDeprecatedFilters` validates its `lzw` dependency eagerly at construction time — if a stub/invalid binding is registered under the name `lzw` instead of the real `@awacloud/fw/io/compress/lzw.js` export, resolving the bundle throws `pdf/filters/missing-lzw` immediately (not lazily on first decode).

## API

| Export | Description |
|--------|-------------|
| `pdfLegacyBundle` | Descriptor `{ name, dependencies, factory }`. Resolved by `ModuleRuntime` → `pdf` instance wired with every P0-P3 extra + the 4 legacy extras (listed under [Extras wired](#extras-wired)). |

The resolved instance is the core `pdf` object (`src/pdf.js`) with the extras merged in — it carries `pdf`'s own 5 members plus one property per wired extra name:

| Member | Signature | Description |
|--------|-----------|--------------|
| `read` | `(bytes: Uint8Array) => doc` | Full document read (accepts PDF 1.7). |
| `header` | `(bytes: Uint8Array) => { version, end }` | Header-only read, no xref/catalog walk. |
| `write` | `(doc) => Uint8Array` | Always PDF 2.0 write. |
| `use` | `(ext) => api` | Extension hook (idempotent by name); this is how the bundle factory wires each extra. |
| `usedExtension` | `(name: string) => boolean` | Whether an extension name has already been applied via `.use()`. The bundle factory calls `.use({ name, register })` once per wired extra (e.g. `'pdfLegacyRc4Read'`), so `api.usedExtension('pdfLegacyRc4Read')` is `true` right after resolve — `api.usedExtension('pdfLegacyBundle')` is `false`, since the bundle's own descriptor name is never itself passed to `.use()`. |

## Extras wired

Items 1-27 are [`pdf-full`](./pdf-full.md)'s extras, re-listed here so every member of the resolved instance is documented on this page; items 28-31 are `pdf-legacy`'s own additions.

| # | Extra | Phase | Status |
|---|-------|-------|--------|
| 1 | [`pdfContentOpsExtended`](../extra/content-ops-extended.md) | P0 | read |
| 2 | [`pdfFontCidTyped`](../extra/font-cid-typed.md) | P0 | read |
| 3 | [`pdfFontColorTagging`](../extra/font-color-tagging.md) | P0 | read |
| 4 | [`pdfTaggedPdfTyped`](../extra/tagged-pdf-typed.md) | P0 | read |
| 5 | [`pdfAnnotExtended`](../extra/annot-extended.md) | P0 | read |
| 6 | [`pdfAOutputIntent`](../extra/pdf-a-output-intent.md) | P0 | lint |
| 7 | [`pdfUaTagged`](../extra/pdf-ua-tagged.md) | P0 | lint |
| 8 | [`pdfFormActionsExtended`](../extra/form-actions-extended.md) | P1 | read |
| 9 | [`pdfColorSpacesExtended`](../extra/color-spaces-extended.md) | P1 | read |
| 10 | [`pdfShadingTyped`](../extra/shading-typed.md) | P1 | read |
| 11 | [`pdfTransparencyTyped`](../extra/transparency-typed.md) | P1 | read |
| 12 | [`pdfSigPades`](../extra/sig-pades.md) | P1 | read |
| 13 | [`pdfSigAesGcm`](../extra/sig-aes-gcm.md) | P1 | read |
| 14 | [`pdfDocumentParts`](../extra/document-parts.md) | P1 | read |
| 15 | [`pdfRedactionIso32005`](../extra/redaction-iso32005.md) | P1 | read |
| 16 | [`pdfXPrepress`](../extra/pdf-x-prepress.md) | P1 | lint |
| 17 | [`pdfWellTagged`](../extra/well-tagged-pdf.md) | P1 | lint |
| 18 | [`pdfOptionalContentExtended`](../extra/optional-content-extended.md) | P1 | read |
| 19 | [`pdfEmbeddedFilesPortfolio`](../extra/embedded-files-portfolio.md) | P1 | read |
| 20 | [`pdfAssociatedFiles2`](../extra/associated-files.md) | P1 | read |
| 21 | [`pdfXmpExtended`](../extra/xmp-extended.md) | P1 | read |
| 22 | [`pdfLinearizationWrite`](../extra/linearization-write.md) | P2 | write |
| 23 | [`pdf3dRichMedia`](../extra/3d-richmedia.md) | P2 | read |
| 24 | [`pdfJbig2Read`](../extra/jbig2-read.md) | P2 | read (partial) |
| 25 | [`pdfMisc`](../extra/misc.md) | P3 | read |
| 26 | [`pdfInfoDictDeprecated`](../extra/info-dict-deprecated.md) | P3 | lint |
| 27 | [`pdfSandbox`](../extra/pdf-sandbox.md) | P3 | opt-in audit hook |
| 28 | [`pdfLegacyXfaRead`](../extra/legacy-xfa-read.md) | legacy | read-only |
| 29 | [`pdfLegacyRc4Read`](../extra/legacy-rc4-read.md) | legacy | read-only |
| 30 | [`pdfLegacyDeprecatedFilters`](../extra/legacy-deprecated-filters.md) | legacy | read (needs the `lzw` + `pdfCcittFaxDecoder` dependencies) |
| 31 | [`pdfLegacyDeprecatedAnnots`](../extra/legacy-deprecated-annots.md) | legacy | read |

`pdfCcittFaxDecoder` (the CCITT Fax decode helper `legacy-deprecated-filters` depends on) is a separate, 32nd module in the package's overall `extras` manifest array, but it is a private sub-dependency here — it is resolved transitively, not wired onto the bundle's own namespace via a `.use()` call, so there is no `api.pdfCcittFaxDecoder`.

## When to choose

- `pdf-large` — strict PDF 2.0 production minimal.
- `pdf-full` — strict PDF 2.0 complete.
- **`pdf-legacy`** — mixed legacy corpus (1.7 + 2.0). Choose it when ingesting older PDFs (XFA, RC4, LZW, Sound/Movie); conversion to PDF 2.0 equivalents is left to the caller.

## Examples

### Reading an RC4-encrypted PDF 1.7 file

`read` refuses an encrypted file (`pdf/document/encrypted`); opt in to the raw
container, then decrypt with the extra's helpers (see
[`pdfLegacyRc4Read`](../extra/legacy-rc4-read.md) for the `params` shape):

```js
const api = rt.resolve('pdfLegacyBundle');
const doc = api.read(pdf17Bytes, { allowEncrypted: true });   // strings and streams still ciphertext
const r = api.pdfLegacyRc4Read.validateUserPassword('', params);
if (r.ok) {
    const plain = api.pdfLegacyRc4Read.decryptStream(r.fileKey, objNum, gen, streamBytes);
}
```

### Reading an XFA form

```js
const api = rt.resolve('pdfLegacyBundle');
const doc = api.read(xfaFormBytes);
const xfa = api.pdfLegacyXfaRead.readXfa(acroFormDict.entries.XFA);
// xfa._legacy.xfa: the XDP payload, opaque; api.write(doc) keeps /XFA as it was
```

### Legacy filter

```js
const plain = api.pdfLegacyDeprecatedFilters.lzwDecode(streamBytes, { EarlyChange: 1 });
```

### Header only

```js
api.header(pdf17Bytes);   // { version: '1.7', end: <offset> } — no xref/catalog walk
```

### Checking a wired extra

```js
api.usedExtension('pdfLegacyRc4Read');  // true — wired by the bundle factory
api.usedExtension('not-a-real-extra');  // false
```

## Errors

| Code | Class | When |
|------|--------|------|
| `pdf/use/bad-extension` | `ContractError` | `.use()` is called with an object missing `name`/`register` (thrown by the core `pdf` orchestrator, not specific to bundles). |
| `pdf/filters/missing-lzw` | `ParseError` | `pdfLegacyDeprecatedFilters` is constructed without a valid `@awacloud/fw` `lzw` factory output (`decode`/`encode` functions). |
| `pdf/filters/missing-ccitt` | `ParseError` | Same, for a missing/invalid `pdfCcittFaxDecoder` output. |

## See also

- [`pdf-large`](./pdf-large.md)
- [`pdf-full`](./pdf-full.md)
- [Bundles index](./README.md)
- [Extras index](../extra/README.md)
