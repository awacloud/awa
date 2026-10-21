// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview One fw `ModuleRuntime` per viewer, holding the fw modules
 * the shell uses, plus the format engines registered **on first use**: a
 * viewer that only ever opens PDFs never loads ooxml, odf or md.
 *
 * Engines are reached through each package's public barrel and registered
 * with `registerDeep` (idempotent, walks the descriptors' `deps`), so only
 * the graph a renderer needs is registered — never a whole package array.
 *
 * @module viewer/core/runtime
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { a11y } from '@awacloud/fw/dom/utils/a11y.js';
import { keybindings } from '@awacloud/fw/dom/utils/keybindings.js';
import { download } from '@awacloud/fw/dom/fs/download.js';
import { fullscreen } from '@awacloud/fw/dom/display/fullscreen.js';
import { sanitize } from '@awacloud/fw/dom/rendering/sanitize.js';
import { secPolicy } from '@awacloud/fw/dom/rendering/secPolicy.js';

/** fw modules the shell resolves directly. */
const SHELL_MODULES = [i18n, a11y, keybindings, download, fullscreen, sanitize, secPolicy];

/**
 * The engine loaders, by format. Each imports its package lazily, registers
 * the descriptors it needs and returns the resolved instances.
 * @type {Record<string, (rt: ModuleRuntime) => Promise<object>>}
 */
const ENGINES = {
    async pdf(rt) {
        const pdf = await import('@awacloud/pdf');
        const oconv = await import('@awacloud/oconv');
        const fonts = await import('@awacloud/fonts');
        // The font decoder (ToUnicode / encoding + AGL / widths) is oconv's,
        // registered in its module array but not exported by name.
        const fontDecoder = oconv.modules.find((m) => m.name === 'oconvPdfFontDecoder');
        // LZW and CCITT fax live on an opt-in extra; wire them into the dispatch.
        const legacyFilters = pdf.extras.find((m) => m.name === 'pdfLegacyDeprecatedFilters');
        // RC4 (V 1–2) decryption lives on an opt-in extra too.
        const rc4 = pdf.extras.find((m) => m.name === 'pdfLegacyRc4Read');
        rt.registerAllDeep([pdf.pdf, pdf.pdfResources, pdf.pdfFilterDispatch, pdf.pdfContentStream,
            pdf.pdfImages, pdf.pdfFont, fontDecoder, legacyFilters,
            // The standard security handler, for files readable without a password.
            pdf.pdfSecurity, pdf.pdfStandardV4, pdf.pdfStandardV5, pdf.pdfStandardV6, rc4,
            // Embedded TrueType programs are drawn from their own outlines.
            fonts.fontSfnt, fonts.tableHead, fonts.tableMaxp, fonts.tableLoca,
            fonts.tableGlyf, fonts.tableCmap, fonts.fontCompositeResolve]);
        const filters = rt.resolve('pdfFilterDispatch');
        const legacy = rt.resolve('pdfLegacyDeprecatedFilters');
        filters.register('LZWDecode', { decode: legacy.lzwDecode });
        filters.register('CCITTFaxDecode', { decode: legacy.ccittFaxDecode });
        return {
            pdf: rt.resolve('pdf'),
            resources: rt.resolve('pdfResources'),
            filters,
            content: rt.resolve('pdfContentStream'),
            images: rt.resolve('pdfImages'),
            fonts: rt.resolve('pdfFont'),
            fontDecoder: rt.resolve('oconvPdfFontDecoder'),
            security: rt.resolve('pdfSecurity'),
            securityV4: rt.resolve('pdfStandardV4'),
            securityV5: rt.resolve('pdfStandardV5'),
            securityV6: rt.resolve('pdfStandardV6'),
            rc4: rt.resolve('pdfLegacyRc4Read'),
            fontKit: {
                sfnt: rt.resolve('fontSfnt'), head: rt.resolve('tableHead'), maxp: rt.resolve('tableMaxp'),
                loca: rt.resolve('tableLoca'), glyf: rt.resolve('tableGlyf'), cmap: rt.resolve('tableCmap'),
                composite: rt.resolve('fontCompositeResolve')
            }
        };
    },
    async docx(rt) {
        const { docxLargeBundle } = await import('@awacloud/ooxml');
        rt.registerDeep(docxLargeBundle);
        return { docx: rt.resolve('docxLargeBundle') };
    },
    async xlsx(rt) {
        const { xlsxLargeBundle, pptxTheme } = await import('@awacloud/ooxml');
        rt.registerAllDeep([xlsxLargeBundle, pptxTheme]);
        // The DrawingML theme reader also reads a workbook's theme part.
        return { xlsx: rt.resolve('xlsxLargeBundle'), theme: rt.resolve('pptxTheme') };
    },
    async pptx(rt) {
        const { pptxLargeBundle } = await import('@awacloud/ooxml');
        rt.registerDeep(pptxLargeBundle);
        return { pptx: rt.resolve('pptxLargeBundle') };
    },
    async odt(rt) {
        const { odtLargeBundle } = await import('@awacloud/odf');
        rt.registerDeep(odtLargeBundle);
        return { odt: rt.resolve('odtLargeBundle'), frame: rt.resolve('drawFrame') };
    },
    async ods(rt) {
        const { odsLargeBundle } = await import('@awacloud/odf');
        rt.registerDeep(odsLargeBundle);
        return { ods: rt.resolve('odsLargeBundle') };
    },
    async odp(rt) {
        const { odpLargeBundle } = await import('@awacloud/odf');
        rt.registerDeep(odpLargeBundle);
        return { odp: rt.resolve('odpLargeBundle') };
    },
    async md(rt) {
        // The full bundle: GFM plus front matter, footnotes, maths, admonitions…
        const { mdFullBundle } = await import('@awacloud/md');
        rt.registerDeep(mdFullBundle);
        return { md: rt.resolve('mdFullBundle') };
    }
};

/**
 * Create the viewer's runtime.
 *
 * @param {{runtime?: ModuleRuntime}} [opts] Inject a runtime (tests, or a
 *   host that already runs fw and wants one module graph).
 * @returns {{runtime: ModuleRuntime, resolve: (name: string) => any,
 *   engine: (format: string) => Promise<object>}}
 */
export function createViewerRuntime(opts = {}) {
    const runtime = opts.runtime || new ModuleRuntime();
    runtime.registerAllDeep(SHELL_MODULES);
    /** @type {Map<string, Promise<object>>} */
    const engines = new Map();

    /**
     * The engine of one format, loaded once per runtime.
     * @param {string} format
     * @returns {Promise<object>}
     * @throws {Error} `viewer: no engine for "<format>"`.
     */
    function engine(format) {
        const load = ENGINES[format];
        if (!load) return Promise.reject(new Error(`viewer: no engine for "${format}"`));
        if (!engines.has(format)) {
            const pending = load(runtime);
            // A failed load (network, module error) may be retried later.
            pending.catch(() => engines.delete(format));
            engines.set(format, pending);
        }
        return /** @type {Promise<object>} */ (engines.get(format));
    }

    return { runtime, resolve: (name) => runtime.resolve(name), engine };
}
