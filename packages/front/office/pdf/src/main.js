// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/pdf/src/main.js
//
// Entry point — declarative manifest of every @awacloud/pdf module descriptor.
// Exports five arrays and the named descriptors:
//
//   fw_require  — the fw descriptors the modules need (zlib, aes, sha256,
//                 asn1, …), closed over their own dependencies.
//   pkg_require — the @awacloud/fonts manifest (its `fw_require` and
//                 `modules`) that the font modules need.
//   modules     — core local factories, topologically ordered (deps
//                 before consumers).
//   extras      — opt-in extras (each wired via `pdf.use(...)`).
//   bundle      — bundle descriptors layering core + extras for
//                 `runtime.resolve('pdfLargeBundle' | 'pdfFullBundle'
//                 | 'pdfLegacyBundle')`.
//
// Every descriptor of `modules`, `extras` and `bundle` is also exported by
// its binding name.
//
// No runtime bootstrap, no re-export of resolved instances, no import
// of built bundles. Tests materialise via `tests/_helpers/build.js`
// and production consumers use the committed two-surface bundles under
// `dist/build/` (fw-mode) and `dist/standalone/` (framework-free), plus
// the additive named descriptor exports below.
//
// Maturity progression :
// - L0 — tokenizer + parser + xref + page tree (read-only).
// - L1 — serializer + writer + filters + ObjStm/XRefStm parsers.
// - L2 — content streams + gstate + text + color + images + Resources +
//        fonts (glue to @awacloud/fonts) + AcroForm baseline.
// - L3 — annotations, tagged PDF, encryption (AES-256), digital
//        signatures (PKCS#7 detached), OCG, outlines/actions/destinations,
//        embedded files, linearization, metadata, prepress.

// --- fw_require — external @awacloud/fw modules consumed by `fwModules` factories.
//
// Every provider's OWN transitive deps must be registered here too, not
// just the provider itself — an unregistered provider dep makes
// `ModuleRuntime.resolve` throw `Module not found: <dep>` the first time
// a consumer factory actually runs (a provider dep propagates to every
// consumer's own fw_require/modules list). Confirmed instances, all purely additive
// (no behavior change, the providers were already declared):
//   - `zlib` deps `deflate`,`adler32`; `deflate` deps `bitstream`,`huffman`,`lz77`
//     (`pdfFlate` throws on the first Flate stream otherwise).
//   - `pem` deps `b64`.
//   - `rsa` deps `bn`,`random`; `ecc` deps `hex`,`bn`,`hmac` (`bn` deps
//     `random`; `random` deps `aes`,`sha256`, already present; `hmac`
//     deps `utf8`,`sha256`, already present) — needed by `pdfSign`'s
//     signature-generation path.

import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32 }   from '@awacloud/fw/io/calc/adler32.js';
import { b64 }       from '@awacloud/fw/io/codec/b64.js';
import { hex }       from '@awacloud/fw/io/codec/hex.js';
import { zlib }     from '@awacloud/fw/io/compress/zlib.js';
import { lzw }      from '@awacloud/fw/io/compress/lzw.js';
import { utf8 }     from '@awacloud/fw/io/codec/utf8.js';
import { aes }      from '@awacloud/fw/crypto/cipher/aes.js';
import { cbc }      from '@awacloud/fw/crypto/mode/cbc.js';
import { gcm }      from '@awacloud/fw/crypto/mode/gcm.js';
import { sha256 }   from '@awacloud/fw/crypto/hash/sha256.js';
import { sha384 }   from '@awacloud/fw/crypto/hash/sha384.js';
import { sha512 }   from '@awacloud/fw/crypto/hash/sha512.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { asn1 }     from '@awacloud/fw/crypto/utils/asn1.js';
import { asn1Oid }  from '@awacloud/fw/crypto/utils/asn1-oid.js';
import { pem }      from '@awacloud/fw/crypto/utils/pem.js';
import { rsa }      from '@awacloud/fw/crypto/pkc/rsa.js';
import { ecc }      from '@awacloud/fw/crypto/pkc/ecc.js';
import { ed25519 }  from '@awacloud/fw/crypto/pkc/ed25519.js';
import { bn }       from '@awacloud/fw/crypto/utils/bn.js';
import { random }   from '@awacloud/fw/crypto/utils/random.js';
import { hmac }     from '@awacloud/fw/crypto/hash/hmac.js';

export const fw_require = [
    bitstream, huffman, lz77, deflate, adler32,
    b64, hex,
    zlib, lzw, utf8,
    aes, cbc, gcm,
    sha256, sha384, sha512, bitArray,
    asn1, asn1Oid, pem,
    random, bn, hmac,
    rsa, ecc, ed25519
];

// --- pkg_require — cross-package factory descriptors from sibling
// `@awacloud/*` packages. Re-uses the foreign package's full manifest so the
// runtime can transitively resolve any dep declared by the foreign
// descriptors (e.g. `pdfFontEmbed` → `embedSubsetForPdf` → `fontSfnt`
// → `fontReader` → …).
//
// Currently only `@awacloud/fonts` is consumed (by `pdfFontEmbed` for font
// subsetting / FontDescriptor / CIDSystemInfo / ToUnicode building).

import * as fontsPkg from '@awacloud/fonts';

// `embedSubsetForPdf` (one of fonts' four `embed-pdf/*` descriptors)
// declares four transitive helper descriptors (`embedClosure`,
// `embedCmapBuilder`, `embedGlyphRewriter`, `embedHash`). The fonts
// manifest registers them in its own `modules`, so `...fontsPkg.modules`
// already closes the graph and they are NOT listed again here (a second
// listing would duplicate their names in every composer that spreads
// `pkg_require`). The bindings are imported only for the additive named
// re-exports at the end of this file.
import { embedClosure }       from '@awacloud/fonts/embed-pdf/subsetForPdf/closure.js';
import { embedCmapBuilder }   from '@awacloud/fonts/embed-pdf/subsetForPdf/cmap-builder.js';
import { embedGlyphRewriter } from '@awacloud/fonts/embed-pdf/subsetForPdf/glyph-rewriter.js';
import { embedHash }          from '@awacloud/fonts/embed-pdf/subsetForPdf/hash.js';

export const pkg_require = [
    ...fontsPkg.fw_require,
    ...fontsPkg.modules
];

// --- modules — core local factories, topologically ordered.

import { pdfErrors }          from './errors.js';
import { pdfShared }          from './_shared/index.js';

// Syntax
import { pdfTokenizer }       from './syntax/tokenizer.js';
import { pdfParserObj }       from './syntax/parser-obj.js';
import { pdfParser }          from './syntax/parser.js';
import { pdfXref }            from './syntax/xref.js';
import { pdfTrailer }         from './syntax/trailer.js';
import { pdfSerializer }      from './syntax/serializer.js';
import { pdfFlate }           from './syntax/filters/flate.js';
import { pdfAsciiHex }        from './syntax/filters/asciiHex.js';
import { pdfAscii85 }         from './syntax/filters/ascii85.js';
import { pdfRunLength }       from './syntax/filters/runLength.js';
import { pdfFilterDispatch }  from './syntax/filters/dispatch.js';
import { pdfObjStream }       from './syntax/objStream.js';
import { pdfCrossRefStream }  from './syntax/crossRefStream.js';

// Document
import { pdfCatalog }         from './document/catalog.js';
import { pdfPages }           from './document/pages.js';
import { pdfPage }            from './document/page.js';
import { pdfDocument }        from './document/document.js';
import { pdfWriter }          from './document/writer.js';
import { pdfBuilder }         from './document/builder.js';
import { pdfEncryptedWriter } from './document/encryptedWriter.js';
import { pdfIncrementalWriter } from './document/incrementalWriter.js';
import { pdfXrefStreamWriter } from './document/xrefStreamWriter.js';
import { pdfResources }       from './document/resources.js';

// Content (L2)
import { pdfContentOps }      from './content/ops.js';
import { pdfContentStream }   from './content/stream.js';
import { pdfGraphics }        from './content/graphics.js';
import { pdfText }            from './content/text.js';
import { pdfColor }           from './content/color.js';
import { pdfImages }          from './content/images.js';

// Font (L2 — glue to @awacloud/fonts)
import { pdfFont }            from './font/font.js';
import { pdfFontEncoding }    from './font/encoding.js';
import { pdfType3 }           from './font/type3.js';
import { pdfFontEmbed }       from './font/embed.js';

// AcroForm (L2)
import { pdfAcroForm }        from './form/acroform.js';
import { pdfFieldTree }       from './form/fieldTree.js';
import { pdfButtonField }     from './form/button.js';
import { pdfTextField }       from './form/text.js';
import { pdfChoiceField }     from './form/choice.js';
import { pdfSignatureField }  from './form/signature.js';
import { pdfAppearance }      from './form/appearance.js';

// Annotations (L3)
import { pdfAnnot }           from './annot/annot.js';
import { pdfTextAnnot }       from './annot/text.js';
import { pdfLinkAnnot }       from './annot/link.js';
import { pdfMarkupAnnot }     from './annot/markup.js';
import { pdfShapeAnnot }      from './annot/square.js';
import { pdfFreeTextAnnot }   from './annot/freeText.js';
import { pdfInkAnnot }        from './annot/ink.js';
import { pdfStampAnnot }      from './annot/stamp.js';
import { pdfFileAttachAnnot } from './annot/fileAttach.js';
import { pdfWidgetAnnot }     from './annot/widget.js';
import { pdfPopupAnnot }      from './annot/popup.js';
import { pdfProjectionAnnot } from './annot/projection.js';
import { pdfRedactAnnot }     from './annot/redact.js';

// Tagged PDF (L3)
import { pdfStructTree }      from './tagged/structTree.js';
import { pdfStructElement }   from './tagged/structElement.js';
import { pdfRoleMap }         from './tagged/roleMap.js';
import { pdfParentTree }      from './tagged/parentTree.js';
import { pdfClassMap }        from './tagged/classMap.js';
import { pdfMarkedContent }   from './tagged/markedContent.js';

// Encryption (L3 — fw-bound)
import { pdfSecurity }        from './crypto/security.js';
import { pdfStandardV4 }      from './crypto/standardV4.js';
import { pdfStandardV5 }      from './crypto/standardV5.js';
import { pdfStandardV6 }      from './crypto/standardV6.js';
import { pdfPermissions }     from './crypto/permissions.js';
import { pdfAesGcm }          from './crypto/aesGcm.js';

// Digital signatures (L3 — fw-bound)
import { pdfSigOids }         from './sig/oids.js';
import { pdfSha1 }            from './sig/sha1.js';  // legacy SHA-1 for PDF DSS VRI keys
import { pdfSignature }       from './sig/signature.js';
import { pdfByteRange }       from './sig/byteRange.js';
import { pdfTimestamp }       from './sig/timestamp.js';
import { pdfCertChain }       from './sig/certChain.js';
import { pdfDssBuilder }      from './sig/dss.js';
import { pdfSign }            from './sig/sign.js';

// Optional Content (L3)
import { pdfOCG }             from './ocg/ocg.js';
import { pdfOCConfig }        from './ocg/config.js';

// Outlines / Destinations / Actions (L3)
import { pdfOutline }         from './outline/outline.js';
import { pdfDestination }     from './destination/destination.js';
import { pdfAction }          from './action/action.js';
import { pdfActionGoTo }      from './action/goTo.js';
import { pdfActionUri }       from './action/uri.js';
import { pdfActionNamed }     from './action/named.js';
import { pdfActionLaunch }    from './action/launch.js';

// Embedded files (L3)
import { pdfFileSpec }        from './embedded/fileSpec.js';
import { pdfEmbeddedFile }    from './embedded/embeddedFile.js';
import { pdfCollection }      from './embedded/collection.js';

// Linearization / Metadata / Prepress / Associated Files (L3)
import { pdfLinearization }   from './linearization/linearization.js';
import { pdfInfo }            from './metadata/info.js';
import { pdfXmp }             from './metadata/xmp.js';
import { pdfOutputIntent }    from './prepress/outputIntent.js';
import { pdfPageBoundary }    from './prepress/pageBoundary.js';
import { pdfAssociatedFiles } from './associatedFiles/associatedFiles.js';

// Top-level
import { pdf }                from './pdf.js';

/**
 * All @awacloud/pdf core module factories, in a registration-friendly order
 * (dependencies before their dependents).
 */
export const modules = [
    pdfErrors,
    pdfShared,
    // Syntax
    pdfTokenizer, pdfParserObj, pdfParser, pdfXref, pdfTrailer, pdfSerializer,
    pdfAsciiHex, pdfAscii85, pdfRunLength,
    pdfFlate, pdfFilterDispatch,
    pdfObjStream, pdfCrossRefStream,
    // Document
    pdfCatalog, pdfPages, pdfPage, pdfDocument, pdfWriter, pdfBuilder, pdfIncrementalWriter, pdfResources,
    pdfXrefStreamWriter,
    // Content
    pdfContentOps, pdfContentStream, pdfGraphics, pdfText, pdfColor, pdfImages,
    // Font
    pdfFont, pdfFontEncoding, pdfType3, pdfFontEmbed,
    // Form
    pdfAcroForm, pdfFieldTree, pdfButtonField, pdfTextField,
    pdfChoiceField, pdfSignatureField, pdfAppearance,
    // Annotations
    pdfAnnot, pdfTextAnnot, pdfLinkAnnot, pdfMarkupAnnot, pdfShapeAnnot,
    pdfFreeTextAnnot, pdfInkAnnot, pdfStampAnnot, pdfFileAttachAnnot,
    pdfWidgetAnnot, pdfPopupAnnot, pdfProjectionAnnot, pdfRedactAnnot,
    // Tagged
    pdfStructTree, pdfStructElement, pdfRoleMap, pdfParentTree,
    pdfClassMap, pdfMarkedContent,
    // Crypto (fw-bound)
    pdfSecurity, pdfAesGcm, pdfStandardV4, pdfStandardV5, pdfStandardV6, pdfPermissions,
    pdfEncryptedWriter,
    // Signatures (fw-bound)
    pdfSigOids, pdfSha1,
    pdfByteRange, pdfSignature, pdfTimestamp, pdfCertChain, pdfDssBuilder, pdfSign,
    // OCG
    pdfOCG, pdfOCConfig,
    // Outlines / Actions / Destinations
    pdfOutline, pdfDestination,
    pdfAction, pdfActionGoTo, pdfActionUri, pdfActionNamed, pdfActionLaunch,
    // Embedded
    pdfFileSpec, pdfEmbeddedFile, pdfCollection,
    // Linearization / Metadata / Prepress / Associated
    pdfLinearization, pdfInfo, pdfXmp, pdfOutputIntent, pdfPageBoundary,
    pdfAssociatedFiles,
    // Top-level
    pdf
];

// --- extras — opt-in P0..P3 + legacy. Tree-shaken when unused.

import { pdfContentOpsExtended }      from './extra/content-ops-extended.js';
import { pdfFontCidTyped }            from './extra/font-cid-typed.js';
import { pdfFontColorTagging }        from './extra/font-color-tagging.js';
import { pdfTaggedPdfTyped }          from './extra/tagged-pdf-typed.js';
import { pdfAnnotExtended }           from './extra/annot-extended.js';
import { pdfFormActionsExtended }     from './extra/form-actions-extended.js';
import { pdfColorSpacesExtended }     from './extra/color-spaces-extended.js';
import { pdfShadingTyped }            from './extra/shading-typed.js';
import { pdfTransparencyTyped }       from './extra/transparency-typed.js';
import { pdfSigPades }                from './extra/sig-pades.js';
import { pdfSigAesGcm }               from './extra/sig-aes-gcm.js';
import { pdfDocumentParts }           from './extra/document-parts.js';
import { pdfRedactionIso32005 }       from './extra/redaction-iso32005.js';
import { pdfAOutputIntent }           from './extra/pdf-a-output-intent.js';
import { pdfXPrepress }               from './extra/pdf-x-prepress.js';
import { pdfUaTagged }                from './extra/pdf-ua-tagged.js';
import { pdfWellTagged }              from './extra/well-tagged-pdf.js';
import { pdfOptionalContentExtended } from './extra/optional-content-extended.js';
import { pdfLinearizationWrite }      from './extra/linearization-write.js';
import { pdf3dRichMedia }             from './extra/3d-richmedia.js';
import { pdfEmbeddedFilesPortfolio }  from './extra/embedded-files-portfolio.js';
import { pdfAssociatedFiles2 }        from './extra/associated-files.js';
import { pdfXmpExtended }             from './extra/xmp-extended.js';
import { pdfLegacyXfaRead }           from './extra/legacy-xfa-read.js';
import { pdfLegacyRc4Read }           from './extra/legacy-rc4-read.js';
import { pdfLegacyDeprecatedFilters } from './extra/legacy-deprecated-filters.js';
import { pdfCcittFaxDecoder }         from './extra/ccitt-fax-decoder.js';
import { pdfLegacyDeprecatedAnnots }  from './extra/legacy-deprecated-annots.js';
import { pdfJbig2Read }               from './extra/jbig2-read.js';
import { pdfMisc }                    from './extra/misc.js';
import { pdfInfoDictDeprecated }      from './extra/info-dict-deprecated.js';
import { pdfSandbox }                 from './extra/pdf-sandbox.js';

export const extras = [
    pdfContentOpsExtended, pdfFontCidTyped, pdfFontColorTagging,
    pdfTaggedPdfTyped, pdfAnnotExtended, pdfAOutputIntent, pdfUaTagged,
    pdfFormActionsExtended, pdfColorSpacesExtended, pdfShadingTyped,
    pdfTransparencyTyped, pdfSigPades, pdfSigAesGcm, pdfDocumentParts,
    pdfRedactionIso32005, pdfXPrepress, pdfWellTagged,
    pdfOptionalContentExtended, pdfEmbeddedFilesPortfolio,
    pdfAssociatedFiles2, pdfXmpExtended,
    pdfLinearizationWrite, pdf3dRichMedia, pdfJbig2Read, pdfMisc,
    pdfInfoDictDeprecated, pdfSandbox,
    pdfLegacyXfaRead, pdfLegacyRc4Read,
    pdfCcittFaxDecoder,
    pdfLegacyDeprecatedFilters, pdfLegacyDeprecatedAnnots
];

// --- bundle — pure fw factory descriptors layering core + extras.

import { pdfLargeBundle }  from './bundles/pdf-large.js';
import { pdfFullBundle }   from './bundles/pdf-full.js';
import { pdfLegacyBundle } from './bundles/pdf-legacy.js';

export const bundle = [pdfLargeBundle, pdfFullBundle, pdfLegacyBundle];

// --- Additive named descriptor re-exports ----------------------------------
//
// Every module descriptor in the `modules` array is re-exported by its
// binding name, together with the four `@awacloud/fonts` subset helper
// bindings (`embedClosure`, `embedCmapBuilder`, `embedGlyphRewriter`,
// `embedHash` — reached through `pkg_require` via the fonts manifest).
// This lets a sibling composer (e.g. `@awacloud/oconv`, `@awacloud/facturx`)
// resolve ANY pdf dependency name via the bare `@awacloud/pdf` specifier.
// Purely additive: this block does not alter the `fw_require`,
// `pkg_require`, `modules`, `extras` and `bundle` arrays above, nor the
// `@awacloud/fonts` bridge. The generated `dist/build/index.js` barrel
// re-exports this whole namespace.
export {
    // Errors / shared
    pdfErrors, pdfShared,
    // Syntax
    pdfTokenizer, pdfParserObj, pdfParser, pdfXref, pdfTrailer,
    pdfSerializer, pdfFlate, pdfAsciiHex, pdfAscii85, pdfRunLength,
    pdfFilterDispatch, pdfObjStream, pdfCrossRefStream,
    // Document
    pdfCatalog, pdfPages, pdfPage, pdfDocument, pdfWriter, pdfBuilder,
    pdfEncryptedWriter, pdfIncrementalWriter, pdfXrefStreamWriter, pdfResources,
    // Content
    pdfContentOps, pdfContentStream, pdfGraphics, pdfText, pdfColor, pdfImages,
    // Font
    pdfFont, pdfFontEncoding, pdfType3, pdfFontEmbed,
    // Form
    pdfAcroForm, pdfFieldTree, pdfButtonField, pdfTextField, pdfChoiceField,
    pdfSignatureField, pdfAppearance,
    // Annotations
    pdfAnnot, pdfTextAnnot, pdfLinkAnnot, pdfMarkupAnnot, pdfShapeAnnot,
    pdfFreeTextAnnot, pdfInkAnnot, pdfStampAnnot, pdfFileAttachAnnot,
    pdfWidgetAnnot, pdfPopupAnnot, pdfProjectionAnnot, pdfRedactAnnot,
    // Tagged
    pdfStructTree, pdfStructElement, pdfRoleMap, pdfParentTree, pdfClassMap,
    pdfMarkedContent,
    // Encryption
    pdfSecurity, pdfStandardV4, pdfStandardV5, pdfStandardV6, pdfPermissions,
    pdfAesGcm,
    // Signatures
    pdfSigOids, pdfSha1, pdfSignature, pdfByteRange, pdfTimestamp, pdfCertChain,
    pdfDssBuilder, pdfSign,
    // Optional Content
    pdfOCG, pdfOCConfig,
    // Outlines / Destinations / Actions
    pdfOutline, pdfDestination, pdfAction, pdfActionGoTo, pdfActionUri,
    pdfActionNamed, pdfActionLaunch,
    // Embedded files
    pdfFileSpec, pdfEmbeddedFile, pdfCollection,
    // Linearization / Metadata / Prepress / Associated
    pdfLinearization, pdfInfo, pdfXmp, pdfOutputIntent, pdfPageBoundary,
    pdfAssociatedFiles,
    // Top-level
    pdf,
    // pkg_require — @awacloud/fonts subset helper bindings
    embedClosure, embedCmapBuilder, embedGlyphRewriter, embedHash
};
