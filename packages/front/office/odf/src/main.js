// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/odf/src/main.js
//
// Entry point — re-exports the odf module factories. Consumers can
// register them in their own fw `ModuleRuntime` to wire dependency
// injection automatically, or import them via the per-format sub-paths
// (`@awacloud/odf/odt`, `@awacloud/odf/ods`, `@awacloud/odf/odp`, `@awacloud/odf/pkg`).

import { xml }      from '@awacloud/fw/io/codec/xml.js';
import { bitstream }         from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }           from '@awacloud/fw/io/compress/huffman.js';
import { deflate }           from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }              from '@awacloud/fw/io/compress/lz77.js';
import { zip }               from '@awacloud/fw/io/compress/zip.js';
import { crc32 }             from '@awacloud/fw/io/calc/crc32.js';

export const fw_require = [
    xml, bitstream, huffman, lz77, deflate, zip, crc32
];

import { odfErrors } from './errors.js';
import { odfShared } from './_shared/index.js';
import { odfWalker } from './_shared/walker.js';
import { pkgMimetype } from './pkg/mimetype.js';
import { pkgManifest } from './pkg/manifest.js';
import { pkgPackage } from './pkg/package.js';
import { odfMeta } from './meta/meta.js';
import { odfSettings } from './settings/settings.js';
import { odfStyles } from './style/styles.js';
import { textParagraph } from './text/paragraph.js';
import { textHeading } from './text/heading.js';
import { textList } from './text/list.js';
import { textSection } from './text/section.js';
import { textBookmarks } from './text/bookmarks.js';
import { textFields } from './text/fields.js';
import { textTracked } from './text/tracked.js';
import { textContent } from './text/content.js';
import { tableCell } from './table/cell.js';
import { tableRow } from './table/row.js';
import { tableTable } from './table/table.js';
import { drawImage } from './draw/image.js';
import { drawFrame } from './draw/frame.js';
import { drawShape } from './draw/shape.js';
import { styleAutomatic } from './style/automaticStyles.js';
import { textStyleRegistry } from './text/style-registry.js';
import { stylePageLayout } from './style/pageLayout.js';
import { styleMasterPage } from './style/masterPage.js';
import { numberFormats } from './number/numberFormats.js';
import { chartChart } from './chart/chart.js';
import { mathMath } from './math/math.js';
import { formForms } from './form/forms.js';
import { dr3dScene } from './dr3d/dr3d.js';
import { odfMc } from './mc/markupCompatibility.js';
import { odtWalker } from './odt/odt-walker.js';
import { odt } from './odt/odt.js';
import { spreadsheet } from './ods/spreadsheet.js';
import { odsWalker } from './ods/ods-walker.js';
import { ods } from './ods/ods.js';
import { presentationStyle } from './odp/presentationStyle.js';
import { odpAnimations } from './odp/animations.js';
import { slide } from './odp/slide.js';
import { odpWalker } from './odp/odp-walker.js';
import { odp } from './odp/odp.js';

/**
 * All odf module factories, in a registration-friendly order
 * (dependencies before their dependents).
 */
export const modules = [
    odfErrors, odfShared, odfWalker,
    pkgMimetype, pkgManifest, pkgPackage,
    odfMeta, odfSettings, odfStyles,
    textParagraph,
    textHeading, textList, textSection,
    textBookmarks, textFields, textTracked,
    tableCell, tableRow, tableTable,
    textContent,
    drawImage, drawFrame, drawShape,
    styleAutomatic, stylePageLayout, styleMasterPage,
    textStyleRegistry,
    numberFormats,
    chartChart, mathMath, formForms, dr3dScene, odfMc,
    odtWalker, odt,
    spreadsheet, odsWalker, ods,
    presentationStyle, odpAnimations, slide, odpWalker, odp
];

// --- Opt-in extras ---
//
// Re-exported so consumers can access them via the root entry, but they
// remain side-effect-free until explicitly imported. Tree-shaken bundlers
// drop unused ones.

import { odfMiscHelper }  from './extra/_misc-helper.js';
import { odfTypedHelper } from './extra/_typed-helper.js';

import { textTrackedChanges } from './extra/text-tracked-changes.js';
import { textFieldsExtended } from './extra/text-fields-extended.js';
import { textListDetailed } from './extra/text-list-detailed.js';
import { tableAdvanced } from './extra/table-advanced.js';
import { stylePage } from './extra/style-page.js';
import { stylePropertiesTyped } from './extra/style-properties-typed.js';
import { drawShapes } from './extra/draw-shapes.js';
import { presentationTyped } from './extra/presentation-typed.js';
import { textMetaExtended }     from './extra/text-meta-extended.js';
import { textSectionsAdvanced } from './extra/text-sections-advanced.js';
import { textTocIndex }         from './extra/text-toc-index.js';
import { drawImageExtended }    from './extra/draw-image-extended.js';
import { chartTyped }           from './extra/chart-typed.js';
import { animationsSmil }       from './extra/animations-smil.js';
import { formsControls }        from './extra/forms-controls.js';
import { numberFormatExtended } from './extra/number-format-extended.js';
import { metaExtended }         from './extra/meta-extended.js';
import { mathMathml }           from './extra/math-mathml.js';
import { dr3d3d }            from './extra/dr3d-3d.js';
import { databaseSources }   from './extra/database-sources.js';
import { settingsExtended }  from './extra/settings-extended.js';
import { scriptMacros }      from './extra/script-macros.js';
import { dsigSignatures }    from './extra/dsig-signatures.js';
import { textMisc }          from './extra/text-misc.js';
import { styleMisc }         from './extra/style-misc.js';
import { drawMisc }          from './extra/draw-misc.js';
import { tableMisc }         from './extra/table-misc.js';
import { officeMisc }        from './extra/office-misc.js';
import { legacyStaroffice }  from './extra/legacy-staroffice.js';

export const extras = [
    odfMiscHelper, odfTypedHelper,
    textTrackedChanges, textFieldsExtended, textListDetailed,
    tableAdvanced, stylePage, stylePropertiesTyped,
    drawShapes, presentationTyped,
    textMetaExtended, textSectionsAdvanced, textTocIndex,
    drawImageExtended, chartTyped, animationsSmil, formsControls,
    numberFormatExtended, metaExtended, mathMathml,
    dr3d3d, databaseSources, settingsExtended, scriptMacros, dsigSignatures,
    textMisc, styleMisc, drawMisc, tableMisc, officeMisc, legacyStaroffice
];

// --- Bundles (pure fw factory descriptors) ---
//
// Register these in a `ModuleRuntime` alongside the core odf modules
// (`modules` array) and the relevant extras above ; resolving
// `'odtLargeBundle'` (etc.) returns a fully-enriched core instance.

import { odtLargeBundle } from './bundles/odt-large.js';
import { odtFullBundle }  from './bundles/odt-full.js';
import { odsLargeBundle } from './bundles/ods-large.js';
import { odsFullBundle }  from './bundles/ods-full.js';
import { odpLargeBundle } from './bundles/odp-large.js';
import { odpFullBundle }  from './bundles/odp-full.js';

export const bundle = [
    odtLargeBundle, odtFullBundle,
    odsLargeBundle, odsFullBundle,
    odpLargeBundle, odpFullBundle
];

// --- Additive named descriptor re-exports (clause vi) ----------------------
//
// Every module descriptor already imported above (the `modules` array, plus
// the 6 `bundle` entries) is re-exported by its binding name, so sibling
// composers (e.g. `@awacloud/oconv`) can import them via the bare `@awacloud/odf`
// specifier. Purely additive: the four arrays above stay byte-unchanged. The
// generated `dist/build/index.js` barrel re-exports this whole namespace.
export {
    odfErrors, odfShared, odfWalker,
    pkgMimetype, pkgManifest, pkgPackage,
    odfMeta, odfSettings, odfStyles,
    textParagraph,
    textHeading, textList, textSection,
    textBookmarks, textFields, textTracked,
    tableCell, tableRow, tableTable,
    textContent,
    drawImage, drawFrame, drawShape,
    styleAutomatic, stylePageLayout, styleMasterPage,
    textStyleRegistry,
    numberFormats,
    chartChart, mathMath, formForms, dr3dScene, odfMc,
    odtWalker, odt,
    spreadsheet, odsWalker, ods,
    presentationStyle, odpAnimations, slide, odpWalker, odp,
    odtLargeBundle, odtFullBundle,
    odsLargeBundle, odsFullBundle,
    odpLargeBundle, odpFullBundle
};
