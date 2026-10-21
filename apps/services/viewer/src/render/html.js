// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Post-passes over a rendered document tree: link hardening
 * and heading demotion. Shared by every flow painter.
 *
 * @module viewer/render/html
 */

/** Schemes a document link may navigate to; any other `href` is dropped. */
const NAVIGABLE = /^(https?:|mailto:)/i;

/**
 * Make document links safe to click: external targets open in a new
 * browsing context without opener or referrer; in-document `#` anchors stay;
 * every other scheme (`javascript:`, `file:`, `data:`…) loses its `href`.
 * @param {ParentNode} root
 */
export function hardenLinks(root) {
    for (const a of root.querySelectorAll('a[href]')) {
        const href = (a.getAttribute('href') || '').trim();
        if (href.startsWith('#')) continue;
        if (NAVIGABLE.test(href)) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        } else {
            a.removeAttribute('href');
        }
    }
}

/**
 * The element a document heading of `level` becomes once moved `offset`
 * levels down: `h1`…`h6`, or a `div[role=heading][aria-level]` past 6.
 * @param {number} level 1-based.
 * @param {number} offset
 * @returns {HTMLElement}
 */
export function headingElement(level, offset) {
    const target = Math.max(1, Math.round(level) + offset);
    if (target <= 6) return document.createElement(`h${target}`);
    const div = document.createElement('div');
    div.setAttribute('role', 'heading');
    div.setAttribute('aria-level', String(target));
    return div;
}

/**
 * Move every `h1`–`h6` of a rendered document `offset` levels down, so the
 * document's outline sits under the page's own (one `h1` per page). The
 * visual size follows the ORIGINAL level (`data-level`).
 * @param {ParentNode} root
 * @param {number} offset
 */
export function demoteHeadings(root, offset) {
    if (!offset) return;
    for (const el of [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')]) {
        const level = Number(el.tagName.slice(1));
        const next = headingElement(level, offset);
        for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
        next.setAttribute('data-level', String(level));
        next.append(...el.childNodes);
        el.replaceWith(next);
    }
}
