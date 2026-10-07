// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/src/main.js
//
// Entry point — re-exports the @awacloud/oconv module factories. Consumers
// register them in their own fw `ModuleRuntime` to wire dependency
// injection automatically.
//
// This file is minimal by design: 4 arrays (`fw_require`, `modules`,
// `extras`, `bundle`) and nothing else. Bootstrap, resolution and any
// ergonomic re-exports of resolved instances live elsewhere.
//
// Core wiring: composes the frozen pivot/readers/writer/facade with the
// three office packages they wrap — `@awacloud/ooxml` (`docx`), `@awacloud/odf`
// (`odt`), `@awacloud/md` (`md`, `mdNode`) — through the pinned bare
// specifiers ONLY: `@awacloud/md`, `@awacloud/ooxml`, `@awacloud/odf`, never a `prebuilt/*`
// path, never a package internal.
//
// Remaining read formats: five more readers (`xlsx`/`ods`/`pptx`/`odp`/`pdf` → IR) plus
// `@awacloud/pdf`'s own manifest (`fw_require` + `pkg_require` + `modules`).
// `@awacloud/pdf`'s `pkg_require` already carries `@awacloud/fonts`' WHOLE `fw_require`
// + `modules` (+ 4 embed-pdf helper descriptors `@awacloud/fonts` registers in its own `modules`)
// so `@awacloud/fonts`' full manifest is composed transitively through `@awacloud/pdf`
// — the four descriptors reach this runtime through the `...pdfPkgRequire` / `...pdfModules` spreads,
// registration is idempotent by name, and `tests/wiring.integration.test.js`'s name-uniqueness
// leg is the guard. `@awacloud/fonts`' own `fw_require` is not spread here redundantly.
//
// Write direction (`oconv.fromMd`): `mdFrontmatter` became
// reachable (its bare specifier is `@awacloud/md/extra/frontmatter.js`, the
// documented `exports` sub-path, NOT re-exported from `@awacloud/md`'s
// package root; a pinned specifier of the documented public exports, see
// `tests/wiring.integration.test.js`'s specifier-pin block) — it first
// joined `modules` as an explicit element; since the md extras change (below)
// it is registered through the `...mdExtras` spread instead, and the import stays
// as the `pkg_require` binding. Three `oconv*` descriptors join `modules`
// after `oconvIrToMd`: `oconvMdToIr` (markdown → IR reader),
// `oconvIrToDocx` and `oconvIrToOdt` (IR → bytes writers, dependencies
// before dependents). `mdFrontmatter` needs only `mdShared`, already
// registered via `...mdModules` below, so
// `fw_require` stays UNCHANGED — the only new entry across this direction's
// registrations is in `pkg_require`/`modules`. `deps:` below is GENERATED
// (`fw-codegen deps`), never hand-edited.
//
// `md → pdf`: the bounded typesetter family —
// TEN descriptors, registered here in dependency order after the odt writer:
// `oconvPdfMetrics` (→ `standard14Lookup`, `fonts`), `oconvPdfBox`,
// `oconvPdfLinebreak`, `oconvPdfStack` (the last three are contractually
// `dependencies: []` — everything they compose with arrives call-time on the
// facade's `ctx`), `oconvPdfRenderText` (→ `oconvPdfMetrics`), the four
// renderers `oconvPdfRender{List,Code,Table,Image}` (→
// `oconvPdfLinebreak`), and `oconvIrToPdf` (the writer facade, → `pdfBuilder`,
// `pdfFontEmbed`, `fonts`). NO new bare specifier: `standard14Lookup` and
// `fonts` come from `@awacloud/fonts`, `pdfBuilder` and `pdfFontEmbed` from
// `@awacloud/pdf` — both already imported above — and all four were ALREADY
// registered at runtime through the `...pdfPkgRequire` / `...pdfModules`
// spreads, so the four new `pkg_require` bindings are codegen-only and the
// resolved graph gains exactly the ten local descriptors.
//
// Default faces: the `oconvDefaultFaces` STAND-IN
// (`oconvDefaultFacesAbsent`, `./write/pdf/default-faces.js`, version
// `0.0.0`, `dependencies: []`) joins `modules` immediately BEFORE
// `oconvIrToPdf`, which now depends on that NAME. A real default face pack
// registered on the same runtime carries a higher version and displaces the
// stand-in in either registration order — nothing here imports it. NO new
// bare specifier; the stand-in is a local descriptor, so `pkg_require` is
// unchanged.
//
// md extras: `@awacloud/md`'s `modules` carries
// `mdHtmlDocument`, which depends on four OPT-IN extras (`mdToc`,
// `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`) that live only in md's
// `extras`. The consumer obligation (`md/docs/api/document/html-document.md`)
// is to register `extras` too, so `mdExtras` is spread right after
// `mdModules` in `modules` below; the explicit `mdFrontmatter` element moved
// into that spread (it is one of md's `extras`, and `modules` is not
// de-duplicated). NO new bare specifier — `extras` comes from the
// `@awacloud/md` package root already imported.

import { fw_require as mdFwRequire, modules as mdModules, extras as mdExtras } from '@awacloud/md';
import {
    fw_require as ooxmlFwRequire,
    modules as ooxmlModules
} from '@awacloud/ooxml';
import {
    fw_require as odfFwRequire,
    modules as odfModules
} from '@awacloud/odf';
import {
    fw_require as pdfFwRequire,
    pkg_require as pdfPkgRequire,
    modules as pdfModules
} from '@awacloud/pdf';

// --- pkg_require — individual sibling module descriptors, imported by BARE
// specifier (the `@awacloud/pdf` `pkg_require` pattern, `pdf/src/main.js`). These
// name-bind the EXACT direct-dependency set declared by @awacloud/oconv's own
// reader/writer/facade descriptors (`dependencies` arrays), so
// `@awacloud/tool-fw-codegen deps` can statically resolve every dependency NAME to
// an importable binding and emit the inline `deps:` companion field (clause
// vi — lifts the 2026-07-22 oconv `deps:check` waiver). Purely additive and
// runtime-inert: these descriptors are ALREADY registered at runtime through
// the `...ooxmlModules` / `...odfModules` / `...mdModules` / `...mdExtras` /
// `...pdfPkgRequire` / `...pdfModules` spreads in `modules` below, so the
// resolved graph is byte-identical — this block adds import bindings + one export array, and
// changes NOTHING the runtime composes. `deps:` is inert to `ModuleRuntime.resolve()`.
//
// Direct-dependency set, per the local descriptors:
//   - @awacloud/ooxml : `docx` (docx-to-ir), `xlsx` (xlsx-to-ir), `pptx` (pptx-to-ir)
//   - @awacloud/odf   : `odt` (odt-to-ir), `ods` (ods-to-ir), `odp` (odp-to-ir)
//   - @awacloud/md    : `md` (ir-to-md — binding `mdMod`), `mdNode` (ir-to-md)
//   - @awacloud/pdf   : `pdf` (facade), `pdfFont`/`pdfFontEncoding`/`pdfFilterDispatch`
//                  (pdf/font-decoder), `pdfStructTree` (pdf/struct),
//                  `pdfResources`/`pdfContentStream` (pdf/text-extract),
//                  `pdfBuilder`/`pdfFontEmbed` (write/ir-to-pdf)
//   - @awacloud/fonts : `cmapToUnicode`/`encodingLookup`/`encodingAgl`
//                  (pdf/font-decoder — @awacloud/pdf composes @awacloud/fonts transitively),
//                  `standard14Lookup`/`fonts` (write/pdf/metrics),
//                  `fonts` again for write/ir-to-pdf
import { docx, xlsx, pptx } from '@awacloud/ooxml';
import { odt, ods, odp } from '@awacloud/odf';
import { mdMod as md, mdNode } from '@awacloud/md';
import {
    pdf,
    pdfFont, pdfFontEncoding, pdfFilterDispatch,
    pdfStructTree, pdfResources, pdfContentStream,
    pdfBuilder, pdfFontEmbed
} from '@awacloud/pdf';
import {
    cmapToUnicode, encodingLookup, encodingAgl,
    standard14Lookup, fonts
} from '@awacloud/fonts';

// `mdFrontmatter` is NOT re-exported from `@awacloud/md`'s package root — it lives
// only at the documented `./extra/*` exports sub-path (`md/package.json`
// `"./extra/*.js": "./src/extra/*.js"`, verified). A documented public
// specifier, pinned by the wiring test. The `.js`
// suffix is load-bearing: a browser prefix import map
// (`"@awacloud/md/": ".../md/src/"`) maps it literally, while the
// extension-less form 404s there and unlinks the whole oconv graph.
import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';

import { oconvIr } from './ir/ir.js';
import { oconvDocxToIr } from './read/docx-to-ir.js';
import { oconvOdtToIr } from './read/odt-to-ir.js';
import { oconvXlsxToIr } from './read/xlsx-to-ir.js';
import { oconvOdsToIr } from './read/ods-to-ir.js';
import { oconvPptxToIr } from './read/pptx-to-ir.js';
import { oconvOdpToIr } from './read/odp-to-ir.js';
import { oconvPdfFontDecoder } from './read/pdf/font-decoder.js';
import { oconvPdfTextExtract } from './read/pdf/text-extract.js';
import { oconvPdfStruct } from './read/pdf/struct.js';
import { oconvPdfToIr } from './read/pdf-to-ir.js';
import { oconvIrToMd } from './write/ir-to-md.js';
import { oconvMdToIr } from './read/md-to-ir.js';
import { oconvIrToDocx } from './write/ir-to-docx.js';
import { oconvIrToOdt } from './write/ir-to-odt.js';
import { oconvPdfMetrics } from './write/pdf/metrics.js';
import { oconvPdfBox } from './write/pdf/box.js';
import { oconvPdfLinebreak } from './write/pdf/linebreak.js';
import { oconvPdfStack } from './write/pdf/stack.js';
import { oconvPdfRenderText } from './write/pdf/render/text.js';
import { oconvPdfRenderList } from './write/pdf/render/list.js';
import { oconvPdfRenderCode } from './write/pdf/render/code.js';
import { oconvPdfRenderTable } from './write/pdf/render/table.js';
import { oconvPdfRenderImage } from './write/pdf/render/image.js';
import { oconvDefaultFacesAbsent } from './write/pdf/default-faces.js';
import { oconvIrToPdf } from './write/ir-to-pdf.js';
import { oconv } from './oconv.js';

/**
 * De-duplicate descriptors by `name`, keeping the first occurrence.
 * `ModuleRuntime.register` already overwrites same-name/same-version entries
 * harmlessly, but `@awacloud/ooxml` and `@awacloud/odf` both list the same zlib/xml fw
 * closure in their own `fw_require` — de-duplicating here keeps the exported
 * array itself idempotent, not just the runtime's internal registry.
 *
 * @template {{name: string}} T
 * @param {T[]} list
 * @returns {T[]}
 */
function dedupeByName(list) {
    const seen = new Set();
    const out = [];
    for (const m of list) {
        if (seen.has(m.name)) continue;
        seen.add(m.name);
        out.push(m);
    }
    return out;
}

/**
 * fw modules @awacloud/oconv needs registered in the host runtime — the union of
 * the `@awacloud/md` / `@awacloud/ooxml` / `@awacloud/odf` / `@awacloud/pdf` manifests' own
 * `fw_require` (`@awacloud/ooxml` and `@awacloud/odf` both need the zip/deflate/xml
 * closure for their OPC/ODF package readers; `@awacloud/md` needs a disjoint set
 * for `sanitize`/`secPolicy`/`url`/`htmlEntities`; `@awacloud/pdf` needs its own
 * crypto/compress closure — zlib/lzw for stream filters, the full
 * AES/SHA/RSA/ECC/asn1/pem/bn/random/hmac/b64/hex chain for encryption and
 * `pdfSign`). De-
 * duplicated by name so re-registering a provider present in several
 * manifests stays idempotent (a missing transitive fw provider
 * surfaces as an opaque TDZ, never a clean
 * error — the wiring test below is the guard).
 */
export const fw_require = dedupeByName([
    ...mdFwRequire, ...ooxmlFwRequire, ...odfFwRequire, ...pdfFwRequire
]);

/**
 * The individual sibling module descriptors @awacloud/oconv's own reader/writer/
 * facade descriptors declare as `dependencies` — bound by bare specifier above
 * (the `@awacloud/pdf` `pkg_require` pattern). This array exists so
 * `@awacloud/tool-fw-codegen deps` resolves each dependency NAME to an importable
 * binding (Layer 3 of its cross-package resolver reads exactly this
 * `pkg_require` guard) and emits inline `deps:` on every local descriptor.
 *
 * Runtime-inert and NON-additive to the graph: every descriptor here is
 * ALREADY registered through the `modules` spreads below (`...ooxmlModules`,
 * `...odfModules`, `...mdModules`, `...mdExtras`, `...pdfPkgRequire`,
 * `...pdfModules`), so it is deliberately NOT spread into `modules` — doing so would double-list into
 * a NON-deduped array (only `fw_require` above dedupes), and the resolved
 * runtime graph must stay byte-identical (the frozen `toMd` composition). It
 * is not consumed at runtime by any current oconv host; it serves codegen +
 * documents the exact direct-dependency surface.
 */
export const pkg_require = [
    docx, xlsx, pptx,
    odt, ods, odp,
    md, mdNode,
    pdf, pdfFont, pdfFontEncoding, pdfFilterDispatch,
    pdfStructTree, pdfResources, pdfContentStream,
    pdfBuilder, pdfFontEmbed,
    cmapToUnicode, encodingLookup, encodingAgl,
    standard14Lookup, fonts,
    mdFrontmatter
];

/**
 * All @awacloud/oconv modules PLUS the full transitive graph of the four office
 * packages it composes: `@awacloud/ooxml`'s modules (resolves `docx`/`xlsx`/
 * `pptx` and every module they depend on, e.g. `opcPackage`), `@awacloud/odf`'s
 * modules (resolves `odt`/`ods`/`odp`), `@awacloud/md`'s modules (resolves
 * `md`/`mdNode`) then its `extras` (`mdHtmlDocument`, in md's
 * `modules`, depends on four of them), `@awacloud/pdf`'s `pkg_require` (resolves `@awacloud/fonts`' WHOLE
 * manifest, transitively required by `@awacloud/pdf`'s own modules — see the
 * file header) then `@awacloud/pdf`'s own `modules` (resolves `pdf` and every
 * `pdf*` runtime module the four new `src/read/pdf/*` descriptors below
 * depend on: `pdfFont`, `pdfFontEncoding`, `pdfFilterDispatch`,
 * `cmapToUnicode`, `encodingLookup`, `encodingAgl`, `pdfResources`,
 * `pdfContentStream`, `pdfStructTree`). Registering only the single format
 * descriptor (without its own package's full graph) would resolve fine at
 * registration time but throw "Module not found" the first time a consumer
 * actually calls `runtime.resolve('docx')` / `'pdf'` / … — the same
 * opaque-TDZ failure mode that occurs when a transitive fw provider is missing
 * providers, generalised here to non-fw ones. Dependencies before
 * dependents.
 */
export const modules = [
    ...ooxmlModules,
    ...odfModules,
    ...mdModules,
    ...mdExtras,
    ...pdfPkgRequire,
    ...pdfModules,
    oconvIr,
    oconvDocxToIr,
    oconvOdtToIr,
    oconvXlsxToIr,
    oconvOdsToIr,
    oconvPptxToIr,
    oconvOdpToIr,
    oconvPdfFontDecoder,
    oconvPdfTextExtract,
    oconvPdfStruct,
    oconvPdfToIr,
    oconvIrToMd,
    oconvMdToIr,
    oconvIrToDocx,
    oconvIrToOdt,
    oconvPdfMetrics,
    oconvPdfBox,
    oconvPdfLinebreak,
    oconvPdfStack,
    oconvPdfRenderText,
    oconvPdfRenderList,
    oconvPdfRenderCode,
    oconvPdfRenderTable,
    oconvPdfRenderImage,
    oconvDefaultFacesAbsent,
    oconvIrToPdf,
    oconv
];

/** Opt-in extras. */
export const extras = [];

/** Pre-assembled bundles (pure fw factory descriptors). */
export const bundle = [];
