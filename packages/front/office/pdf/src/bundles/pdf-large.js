// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `@awacloud/pdf/bundles/pdf-large` — extended PDF coverage bundle.
 *
 * Pure fw factory descriptor. Declares the core `pdf` orchestrator and
 * the P0+P1 opt-in extras as dependencies. The runtime resolves every
 * dependency transitively and passes the already-constructed instances
 * to the factory, which wires them into the `pdf` core via `pdf.use(...)`
 * and returns the enriched instance.
 *
 * Consumption is exclusively declarative — register the descriptor in a
 * `ModuleRuntime` and call `runtime.resolve('pdfLargeBundle')`.
 *
 * For 100% PDF 2.0 strict coverage (adds P2 phases + misc + deprecated
 * info dict), use `pdf-full`. For PDF 1.7 read + 1.7→2.0 conversion,
 * use `pdf-legacy`.
 *
 * @module pdf/bundles/pdf-large
 */

import { pdf } from '../pdf.js';
import { pdfContentOpsExtended } from '../extra/content-ops-extended.js';
import { pdfFontCidTyped } from '../extra/font-cid-typed.js';
import { pdfFontColorTagging } from '../extra/font-color-tagging.js';
import { pdfTaggedPdfTyped } from '../extra/tagged-pdf-typed.js';
import { pdfAnnotExtended } from '../extra/annot-extended.js';
import { pdfAOutputIntent } from '../extra/pdf-a-output-intent.js';
import { pdfUaTagged } from '../extra/pdf-ua-tagged.js';
import { pdfFormActionsExtended } from '../extra/form-actions-extended.js';
import { pdfColorSpacesExtended } from '../extra/color-spaces-extended.js';
import { pdfShadingTyped } from '../extra/shading-typed.js';
import { pdfTransparencyTyped } from '../extra/transparency-typed.js';
import { pdfSigPades } from '../extra/sig-pades.js';
import { pdfSigAesGcm } from '../extra/sig-aes-gcm.js';
import { pdfDocumentParts } from '../extra/document-parts.js';
import { pdfRedactionIso32005 } from '../extra/redaction-iso32005.js';
import { pdfXPrepress } from '../extra/pdf-x-prepress.js';
import { pdfWellTagged } from '../extra/well-tagged-pdf.js';
import { pdfOptionalContentExtended } from '../extra/optional-content-extended.js';
import { pdfEmbeddedFilesPortfolio } from '../extra/embedded-files-portfolio.js';
import { pdfAssociatedFiles2 } from '../extra/associated-files.js';
import { pdfXmpExtended } from '../extra/xmp-extended.js';

export const pdfLargeBundle = {
    name: 'pdfLargeBundle',
    dependencies: [
        'pdf',
        'pdfContentOpsExtended', 'pdfFontCidTyped', 'pdfFontColorTagging',
        'pdfTaggedPdfTyped', 'pdfAnnotExtended', 'pdfAOutputIntent', 'pdfUaTagged',
        'pdfFormActionsExtended', 'pdfColorSpacesExtended', 'pdfShadingTyped',
        'pdfTransparencyTyped', 'pdfSigPades', 'pdfSigAesGcm', 'pdfDocumentParts',
        'pdfRedactionIso32005', 'pdfXPrepress', 'pdfWellTagged',
        'pdfOptionalContentExtended', 'pdfEmbeddedFilesPortfolio',
        'pdfAssociatedFiles2', 'pdfXmpExtended'
    ],
    deps: [pdf, pdfContentOpsExtended, pdfFontCidTyped, pdfFontColorTagging, pdfTaggedPdfTyped, pdfAnnotExtended, pdfAOutputIntent, pdfUaTagged, pdfFormActionsExtended, pdfColorSpacesExtended, pdfShadingTyped, pdfTransparencyTyped, pdfSigPades, pdfSigAesGcm, pdfDocumentParts, pdfRedactionIso32005, pdfXPrepress, pdfWellTagged, pdfOptionalContentExtended, pdfEmbeddedFilesPortfolio, pdfAssociatedFiles2, pdfXmpExtended],
    factory(pdf, ...instances) {
        const names = [
            'pdfContentOpsExtended', 'pdfFontCidTyped', 'pdfFontColorTagging',
            'pdfTaggedPdfTyped', 'pdfAnnotExtended', 'pdfAOutputIntent', 'pdfUaTagged',
            'pdfFormActionsExtended', 'pdfColorSpacesExtended', 'pdfShadingTyped',
            'pdfTransparencyTyped', 'pdfSigPades', 'pdfSigAesGcm', 'pdfDocumentParts',
            'pdfRedactionIso32005', 'pdfXPrepress', 'pdfWellTagged',
            'pdfOptionalContentExtended', 'pdfEmbeddedFilesPortfolio',
            'pdfAssociatedFiles2', 'pdfXmpExtended'
        ];
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const inst = instances[i];
            pdf.use({
                name,
                register() { return { [name]: inst }; }
            });
        }
        return pdf;
    }
};
