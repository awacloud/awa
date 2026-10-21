// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Shared pieces of the word-processing painters (DOCX, ODT):
 * list numbering formats, font-family fallbacks, and the "sheets" layout —
 * a flowing document cut into paper sheets at its explicit page breaks.
 *
 * There is no automatic pagination: a sheet ends where the author put a
 * page or section break, so a long chapter is one tall sheet. Line-exact
 * pagination needs the author's fonts and a layout engine; the viewer
 * shows the content faithfully instead of guessing page ends.
 *
 * @module viewer/render/flow
 */
import { h } from './dom.js';

/**
 * A CSS font stack for a document font name: the name first, then a
 * metric-compatible or look-alike system family, then the generic.
 * @param {string|null|undefined} fontName
 * @returns {string|null}
 */
export function fontStack(fontName) {
    if (!fontName) return null;
    const n = String(fontName).replace(/["\\]/g, '');
    let generic = 'sans-serif';
    let alike = '"Liberation Sans", Arial';
    if (/courier|mono|consol|menlo|typewriter|code/i.test(n)) { generic = 'monospace'; alike = '"Liberation Mono", "Courier New"'; }
    else if (/times|serif|cambria|georgia|garamond|book|palatino|roman|minion|baskerville|century/i.test(n) && !/sans/i.test(n)) {
        generic = 'serif';
        alike = /cambria/i.test(n) ? 'Caladea, Georgia' : '"Liberation Serif", "Times New Roman"';
    } else if (/calibri|aptos/i.test(n)) alike = 'Carlito, "Segoe UI", Arial';
    return `"${n}", ${alike}, ${generic}`;
}

/** Roman numerals (1 ≤ n < 4000; others fall back to decimal). */
function roman(n) {
    if (n < 1 || n >= 4000) return String(n);
    const table = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let out = '';
    for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
    return out;
}

/** Spreadsheet-style letters: 1 → a, 26 → z, 27 → aa. */
function letters(n) {
    let out = '';
    while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(97 + r) + out; n = Math.floor((n - 1) / 26); }
    return out || 'a';
}

/**
 * Format a list counter (WordprocessingML `numFmt` names; ODF `style:num-format`
 * values `1 a A i I` map onto the same).
 * @param {number} n
 * @param {string} fmt
 */
export function formatCounter(n, fmt) {
    switch (fmt) {
        case 'lowerLetter': case 'a': return letters(n);
        case 'upperLetter': case 'A': return letters(n).toUpperCase();
        case 'lowerRoman': case 'i': return roman(n);
        case 'upperRoman': case 'I': return roman(n).toUpperCase();
        case 'decimalZero': return n < 10 ? `0${n}` : String(n);
        case 'none': case '': return '';
        default: return String(n);
    }
}

/**
 * Private-use bullet glyphs of the Symbol / Wingdings fonts, mapped to the
 * Unicode character they draw.
 */
const PUA_BULLETS = Object.freeze({
    0xf0b7: '•', 0xf0a7: '▪', 0xf0a8: '□', 0xf0d8: '➢', 0xf076: '❖', 0xf0fc: '✓',
    0xf0e0: '➔', 0xf0de: '⇨', 0xf06e: '■', 0xf06f: '□', 0xf071: '❑', 0xf0b2: '◆', 0xf0a1: '○'
});

/**
 * The visible bullet for a list level's bullet text.
 * @param {string|null|undefined} text
 */
export function bulletChar(text) {
    const t = String(text ?? '');
    if (!t) return '•';
    const cp = t.codePointAt(0) || 0;
    if (cp >= 0xf000 && cp <= 0xf0ff) return PUA_BULLETS[/** @type {keyof typeof PUA_BULLETS} */ (cp)] || '•';
    return t;
}

/**
 * Lay a document out on paper sheets.
 *
 * @param {{width: number, minHeight: number, padding: {top: number, right: number, bottom: number, left: number},
 *   headerTop?: number|null, footerBottom?: number|null}} page
 *   natural sizes in CSS px; `headerTop` / `footerBottom`: the header's distance from the
 *   top edge and the footer's from the bottom one, when the file gives them
 * @param {HTMLElement[][]} sheets the blocks of each sheet
 * @param {{header?: () => HTMLElement|null, footer?: () => HTMLElement|null, lang?: string|null}} [chrome]
 *   built once per sheet
 * @returns {HTMLElement}
 */
export function sheetsElement(page, sheets, chrome = {}) {
    const root = h('div', { class: 'awv-sheets', lang: chrome.lang || undefined });
    const sides = { left: `${Math.round(page.padding.left)}px`, right: `${Math.round(page.padding.right)}px` };
    for (const blocks of sheets) {
        const header = chrome.header ? chrome.header() : null;
        const footer = chrome.footer ? chrome.footer() : null;
        root.append(h('article', {
            class: 'awv-paper awv-doc',
            style: {
                width: `${Math.round(page.width)}px`,
                minHeight: `${Math.round(page.minHeight)}px`,
                padding: `${Math.round(page.padding.top)}px ${Math.round(page.padding.right)}px ${Math.round(page.padding.bottom)}px ${Math.round(page.padding.left)}px`
            }
        }, [
            header ? h('header', { class: 'awv-doc-header', style: { ...sides, top: `${Math.round(page.headerTop ?? Math.min(page.padding.top / 2, 48))}px` } }, header) : null,
            h('div', { class: 'awv-doc-body' }, blocks),
            footer ? h('footer', { class: 'awv-doc-footer', style: { ...sides, bottom: `${Math.round(page.footerBottom ?? Math.min(page.padding.bottom / 2, 48))}px` } }, footer) : null
        ]));
    }
    return root;
}
