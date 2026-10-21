// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Scroll the text to a range: where a match of Find, or the
 * line of Go to line, sits inside the textarea.
 *
 * A textarea does not say where an offset is drawn, and setting its
 * selection does not reliably scroll it (measured in Chrome: the caret
 * moves to line 401 and the view stays at line 1 while the focus is in the
 * find field). So the offset is measured on a mirror: a hidden block with
 * the textarea's own box, font and wrapping, holding the text before the
 * range and a marker for the range. The scroll keeps a visible range where
 * it is and centres one that is not.
 *
 * @module notepad/ui/reveal
 */

/** Computed properties the mirror copies: what decides where text wraps and lines fall. */
const COPIED = [
    'direction', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight',
    'fontFamily', 'fontFeatureSettings', 'fontKerning', 'textAlign', 'textTransform', 'textIndent',
    'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'
];

/**
 * @typedef {object} Box Where a range is drawn, in the textarea's scroll
 *   coordinates (CSS px, the padding included).
 * @property {number} top
 * @property {number} bottom
 * @property {number} left
 * @property {number} right
 */

/**
 * The scroll position that shows `box`: unchanged when it is already in
 * view, else centred on it (vertically; horizontally too when the text does
 * not wrap and the range lies outside the visible columns).
 *
 * @param {Box} box
 * @param {{scrollTop: number, scrollLeft: number, clientHeight: number, clientWidth: number}} view
 * @returns {{scrollTop: number, scrollLeft: number}}
 */
export function scrollToShow(box, view) {
    let { scrollTop, scrollLeft } = view;
    const height = box.bottom - box.top;
    if (box.top < scrollTop || box.bottom > scrollTop + view.clientHeight) {
        scrollTop = Math.max(0, Math.round(box.top - (view.clientHeight - height) / 2));
    }
    if (box.left < scrollLeft || box.right > scrollLeft + view.clientWidth) {
        scrollLeft = Math.max(0, Math.round(box.left - view.clientWidth / 3));
    }
    return { scrollTop, scrollLeft };
}

/**
 * Where the range `[start, end)` of a textarea's value is drawn.
 *
 * @param {HTMLTextAreaElement} text
 * @param {number} start
 * @param {number} end
 * @returns {Box}
 */
export function measureRange(text, start, end) {
    const doc = text.ownerDocument;
    const view = doc.defaultView;
    const style = view ? view.getComputedStyle(text) : null;
    const mirror = doc.createElement('div');
    const marker = doc.createElement('span');
    const s = mirror.style;
    if (style) for (const name of COPIED) s[/** @type {any} */ (name)] = style[/** @type {any} */ (name)];
    const padX = (parseFloat(style?.paddingLeft || '0') || 0) + (parseFloat(style?.paddingRight || '0') || 0);
    // Out of the flow, never painted, never sized by its content: measuring
    // costs one layout of the mirror and nothing of the page around it.
    s.position = 'absolute';
    s.top = '0';
    s.left = '0';
    s.visibility = 'hidden';
    s.pointerEvents = 'none';
    s.overflow = 'hidden';
    s.boxSizing = 'content-box';
    s.border = '0';
    s.margin = '0';
    s.width = `${Math.max(0, text.clientWidth - padX)}px`;
    s.height = '0';
    s.contain = 'strict';
    mirror.textContent = text.value.slice(0, start);
    // An empty range still needs a box: a zero-width space holds the line.
    marker.textContent = text.value.slice(start, end) || '​';
    mirror.append(marker);
    (text.parentElement || doc.body).append(mirror);
    try {
        const top = marker.offsetTop;
        const left = marker.offsetLeft;
        return { top, bottom: top + marker.offsetHeight, left, right: left + marker.offsetWidth };
    } finally {
        mirror.remove();
    }
}

/**
 * Where several ranges are drawn, line by line: one mirror holding the text
 * up to the last range, each range in a marker of its own. A range that
 * wraps over lines gives one box per line.
 *
 * @param {HTMLTextAreaElement} text
 * @param {{start: number, end: number}[]} ranges In order, not overlapping.
 * @returns {Box[][]} The boxes of each range, in the textarea's scroll coordinates.
 */
export function measureRanges(text, ranges) {
    if (!ranges.length) return [];
    const doc = text.ownerDocument;
    const view = doc.defaultView;
    const style = view ? view.getComputedStyle(text) : null;
    const mirror = doc.createElement('div');
    const s = mirror.style;
    if (style) for (const name of COPIED) s[/** @type {any} */ (name)] = style[/** @type {any} */ (name)];
    const padX = (parseFloat(style?.paddingLeft || '0') || 0) + (parseFloat(style?.paddingRight || '0') || 0);
    s.position = 'absolute';
    s.top = '0';
    s.left = '0';
    s.visibility = 'hidden';
    s.pointerEvents = 'none';
    s.overflow = 'hidden';
    s.boxSizing = 'content-box';
    s.border = '0';
    s.margin = '0';
    s.width = `${Math.max(0, text.clientWidth - padX)}px`;
    s.height = '0';
    s.contain = 'strict';
    const value = text.value;
    /** @type {HTMLSpanElement[]} */
    const markers = [];
    let at = 0;
    for (const r of ranges) {
        if (r.start > at) mirror.append(doc.createTextNode(value.slice(at, r.start)));
        const marker = doc.createElement('span');
        marker.textContent = value.slice(r.start, r.end) || '​';
        mirror.append(marker);
        markers.push(marker);
        at = r.end;
    }
    (text.parentElement || doc.body).append(mirror);
    try {
        const origin = mirror.getBoundingClientRect();
        return markers.map((m) => [...m.getClientRects()].map((r) => ({
            top: r.top - origin.top, bottom: r.bottom - origin.top, left: r.left - origin.left, right: r.right - origin.left
        })));
    } finally {
        mirror.remove();
    }
}

/**
 * Scroll the textarea so the range `[start, end)` is in view.
 *
 * @param {HTMLTextAreaElement} text
 * @param {number} start
 * @param {number} [end]
 */
export function revealRange(text, start, end = start) {
    const box = measureRange(text, start, end);
    const next = scrollToShow(box, text);
    if (next.scrollTop !== text.scrollTop) text.scrollTop = next.scrollTop;
    if (next.scrollLeft !== text.scrollLeft) text.scrollLeft = next.scrollLeft;
}
