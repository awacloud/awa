// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Format → painter. Painters load on first use, like the
 * engines they drive.
 *
 * @module viewer/render
 */

/**
 * @typedef {{name: string, id: string, headingOffset: number, locale?: string,
 *   t: (k: string, p?: object) => string,
 *   engine: (format: string) => Promise<any>}} RenderContext
 * @typedef {(bytes: Uint8Array, ctx: RenderContext) => Promise<import('./view.js').View>} Painter
 */

/** @type {Record<string, () => Promise<Painter>>} */
const PAINTERS = {
    text: async () => (await import('./text.js')).renderText,
    md: async () => (await import('./markdown.js')).renderMarkdown,
    pdf: async () => (await import('./pdf/pdf.js')).renderPdf,
    docx: async () => (await import('./docx.js')).renderDocx,
    odt: async () => (await import('./odt.js')).renderOdt,
    xlsx: async () => (await import('./sheet.js')).renderXlsx,
    ods: async () => (await import('./sheet.js')).renderOds,
    pptx: async () => (await import('./slides.js')).renderPptx,
    odp: async () => (await import('./slides.js')).renderOdp
};

/** @param {string} format */
export function canRender(format) {
    return Object.hasOwn(PAINTERS, format);
}

/**
 * Render a file with its format's painter.
 * @param {string} format
 * @param {Uint8Array} bytes
 * @param {RenderContext} ctx
 * @returns {Promise<import('./view.js').View>}
 * @throws {Error} `viewer: no painter for "<format>"`.
 */
export async function render(format, bytes, ctx) {
    if (!canRender(format)) throw new Error(`viewer: no painter for "${format}"`);
    const painter = await PAINTERS[format]();
    return painter(bytes, ctx);
}
