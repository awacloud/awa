// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Plain text → a flow View: one paper sheet holding a `<pre>`.
 *
 * @module viewer/render/text
 */
import { h } from './dom.js';
import { createOmissions, PAPER_WIDTH } from './view.js';

/**
 * Decode text bytes: UTF-16 by BOM, else UTF-8 (BOM stripped), else — when
 * the bytes are not valid UTF-8 — windows-1252, the 8-bit encoding of most
 * older Western files (a CSV saved by a French Excel).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeText(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try {
        // TextDecoder strips a UTF-8 BOM by default.
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

/**
 * @param {Uint8Array} bytes
 * @param {{name: string}} ctx
 * @returns {Promise<import('./view.js').View>}
 */
export async function renderText(bytes, ctx) {
    const omissions = createOmissions();
    let text = decodeText(bytes);
    // One <pre> of a whole 200 MB log freezes the page: show the start, and say so.
    if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
        omissions.add('text/truncated');
    }
    const pre = h('pre', { class: 'awv-text', text });
    return {
        kind: 'flow',
        title: ctx.name,
        meta: {},
        width: PAPER_WIDTH,
        element: h('article', { class: 'awv-paper awv-paper--text' }, pre),
        omissions: omissions.list(),
        dispose() {}
    };
}

/** A text view shows at most this many characters (the rest is reported). */
export const MAX_TEXT_CHARS = 5_000_000;
