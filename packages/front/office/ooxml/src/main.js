// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/ooxml/src/main.js
//
// Entry point — re-exports the ooxml module factories. Consumers can
// register them in their own fw `ModuleRuntime` to wire dependency
// injection automatically, or import them via the per-format sub-paths
// (`@awacloud/ooxml/docx`, `@awacloud/ooxml/xlsx`, …).

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

export const fonts_require = [

];

import { ooxmlErrors } from './errors.js';
import { ooxmlShared } from './_shared/index.js';
import { ooxmlMath } from './math/math.js';
import { markupCompatibility } from './mc/markupCompatibility.js';
import { opcContentTypes } from './opc/contentTypes.js';
import { opcRelationships } from './opc/relationships.js';
import { opcPackage } from './opc/package.js';

import { docxProperties } from './docx/properties.js';
import { docxDrawing } from './docx/drawing.js';
import { docxStructure } from './docx/structure.js';
import { docxStyles } from './docx/styles.js';
import { docxNumbering } from './docx/numbering.js';
import { docxSettings } from './docx/settings.js';
import { docxComments } from './docx/comments.js';
import { docxFootnotes } from './docx/footnotes.js';
import { docxHeaders } from './docx/headers.js';
import { docxCustomXml } from './docx/customXml.js';
import { docxWalker } from './docx/docx-walker.js';
import { docxText } from './docx/docx-text.js';
import { docx } from './docx/docx.js';

import { xlsxStyles } from './xlsx/styles.js';
import { xlsxTables } from './xlsx/tables.js';
import { xlsxConditionalFormatting } from './xlsx/conditionalFormatting.js';
import { xlsxComments } from './xlsx/comments.js';
import { xlsxThreadedComments } from './xlsx/threadedComments.js';
import { xlsxDrawings } from './xlsx/drawings.js';
import { xlsxWalker } from './xlsx/xlsx-walker.js';
import { xlsx } from './xlsx/xlsx.js';
import { drawingml } from './drawingml/drawingml.js';
import { drawingmlChart } from './drawingml/chart.js';
import { drawingmlShape } from './drawingml/shape.js';
import { pptxTheme } from './pptx/theme.js';
import { pptxPicture } from './pptx/picture.js';
import { pptxTable } from './pptx/table.js';
import { pptxChart } from './pptx/chart.js';
import { pptxSlide } from './pptx/slide.js';
import { pptxWalker } from './pptx/pptx-walker.js';
import { pptx } from './pptx/pptx.js';

/**
 * All ooxml module factories, in a registration-friendly order
 * (dependencies before their dependents).
 */
export const modules = [
    ooxmlErrors, ooxmlShared, ooxmlMath, markupCompatibility,
    opcContentTypes, opcRelationships, opcPackage,
    drawingml, drawingmlChart, drawingmlShape,
    docxProperties, docxDrawing, docxStructure,
    docxStyles, docxNumbering, docxSettings,
    docxComments, docxFootnotes, docxHeaders, docxCustomXml,
    docxWalker, docxText, docx,
    xlsxStyles, xlsxTables, xlsxConditionalFormatting, xlsxComments,
    xlsxThreadedComments, xlsxDrawings, xlsxWalker, xlsx,
    pptxTheme, pptxPicture, pptxTable, pptxChart, pptxSlide, pptxWalker, pptx
];

// --- Opt-in extras ---
//
// Re-exported so consumers can access them via the root entry, but they
// remain side-effect-free until explicitly imported. Tree-shaken bundlers
// drop unused ones.

import { wmlRunFormatting }       from './extra/wml-run-formatting.js';
import { wmlParagraphFormatting } from './extra/wml-paragraph-formatting.js';
import { wmlTableProperties }     from './extra/wml-table-properties.js';
import { wmlNumberingDetails }    from './extra/wml-numbering-details.js';
import { wmlSettings }            from './extra/wml-settings.js';
import { wmlFields }              from './extra/wml-fields.js';
import { wmlTrackedChanges }      from './extra/wml-tracked-changes.js';
import { wmlVmlLegacy }           from './extra/wml-vml-legacy.js';
import { smlPivotTables }         from './extra/sml-pivot-tables.js';
import { smlCalculation }         from './extra/sml-calculation.js';
import { smlSheetConfig }         from './extra/sml-sheet-config.js';
import { smlWorkbookConfig }      from './extra/sml-workbook-config.js';
import { smlFormControls }        from './extra/sml-form-controls.js';
import { pmlAnimations }          from './extra/pml-animations.js';
import { pmlTransitions }         from './extra/pml-transitions.js';
import { pmlNotes }               from './extra/pml-notes.js';
import { pmlLayoutsTyped }        from './extra/pml-layouts-typed.js';
import { dmlChartDataLabels }     from './extra/dml-chart-data-labels.js';
import { dmlChartTrendlines }     from './extra/dml-chart-trendlines.js';
import { dmlChartAxesAdvanced }   from './extra/dml-chart-axes-advanced.js';
import { dmlChart3d }             from './extra/dml-chart-3d.js';
import { dmlChartOtherTypes }     from './extra/dml-chart-other-types.js';
import { mathAdvanced }           from './extra/math-advanced.js';
import { dmlEffects }             from './extra/dml-effects.js';
import { dmlFillsAdvanced }       from './extra/dml-fills-advanced.js';
import { dmlShapesAdvanced }      from './extra/dml-shapes-advanced.js';
import { dmlWpPositioning }       from './extra/dml-wp-positioning.js';
import { dmlXdrAdvanced }         from './extra/dml-xdr-advanced.js';
import { transitional }           from './extra/transitional.js';
import { legacyVml }              from './extra/legacy-vml.js';
import { wmlMisc }                from './extra/wml-misc.js';
import { smlMisc }                from './extra/sml-misc.js';
import { pmlMisc }                from './extra/pml-misc.js';
import { dmlMainMisc }            from './extra/dml-main-misc.js';
import { dmlChartMisc }           from './extra/dml-chart-misc.js';
import { mathMisc }               from './extra/math-misc.js';

export const extras = [
    wmlRunFormatting, wmlParagraphFormatting, wmlTableProperties,
    wmlNumberingDetails, wmlSettings, wmlFields, wmlTrackedChanges,
    wmlVmlLegacy, smlPivotTables, smlCalculation, smlSheetConfig,
    smlWorkbookConfig, smlFormControls, pmlAnimations, pmlTransitions,
    pmlNotes, pmlLayoutsTyped, dmlChartDataLabels, dmlChartTrendlines,
    dmlChartAxesAdvanced, dmlChart3d, dmlChartOtherTypes, mathAdvanced,
    dmlEffects, dmlFillsAdvanced, dmlShapesAdvanced, dmlWpPositioning,
    dmlXdrAdvanced, transitional, legacyVml,
    wmlMisc, smlMisc, pmlMisc, dmlMainMisc, dmlChartMisc, mathMisc
];

// --- Bundles (pure fw factory descriptors) ---
//
// Register these in a `ModuleRuntime` alongside the core ooxml modules
// (`modules` array) and the relevant extras above ; resolving
// `'docxLargeBundle'` (etc.) returns a fully-enriched core instance.

import { docxLargeBundle } from './bundles/docx-large.js';
import { docxFullBundle }  from './bundles/docx-full.js';
import { xlsxLargeBundle } from './bundles/xlsx-large.js';
import { xlsxFullBundle }  from './bundles/xlsx-full.js';
import { pptxLargeBundle } from './bundles/pptx-large.js';
import { pptxFullBundle }  from './bundles/pptx-full.js';

export const bundle = [
    docxLargeBundle, docxFullBundle,
    xlsxLargeBundle, xlsxFullBundle,
    pptxLargeBundle, pptxFullBundle
];

// --- Additive named descriptor re-exports (clause vi) -----------------------
//
// Every module descriptor already imported above (the `modules` array, plus
// the 6 entries of `bundle`) is re-exported by its binding name, so sibling
// composers (e.g. `@awacloud/oconv`) can import them via the bare `@awacloud/ooxml`
// specifier. Purely additive: the four arrays above stay byte-unchanged. The
// generated `dist/build/index.js` barrel re-exports this whole namespace.
export {
    ooxmlErrors, ooxmlShared, ooxmlMath, markupCompatibility,
    opcContentTypes, opcRelationships, opcPackage,
    drawingml, drawingmlChart, drawingmlShape,
    docxProperties, docxDrawing, docxStructure,
    docxStyles, docxNumbering, docxSettings,
    docxComments, docxFootnotes, docxHeaders, docxCustomXml,
    docxWalker, docxText, docx,
    xlsxStyles, xlsxTables, xlsxConditionalFormatting, xlsxComments,
    xlsxThreadedComments, xlsxDrawings, xlsxWalker, xlsx,
    pptxTheme, pptxPicture, pptxTable, pptxChart, pptxSlide, pptxWalker, pptx,
    docxLargeBundle, docxFullBundle,
    xlsxLargeBundle, xlsxFullBundle,
    pptxLargeBundle, pptxFullBundle
};