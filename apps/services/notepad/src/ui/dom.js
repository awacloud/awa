// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Plain-DOM builders, the same as the viewer's
 * (`apps/services/viewer/src/render/dom.js`): real ids for ARIA references,
 * text always set with `textContent`, no builder ever parses HTML.
 *
 * @module notepad/ui/dom
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Node|string|number|null|undefined|false} Child
 * @typedef {Record<string, string|number|boolean|null|undefined>} Attrs
 */

/**
 * Set attributes: `true` → empty attribute, `false`/`null`/`undefined` →
 * removed, `text` sets `textContent`.
 * @param {Element} el
 * @param {Attrs} attrs
 */
export function setAttrs(el, attrs) {
    for (const [key, value] of Object.entries(attrs || {})) {
        if (key === 'text') el.textContent = value === null || value === undefined ? '' : String(value);
        else if (value === true) el.setAttribute(key, '');
        else if (value === false || value === null || value === undefined) el.removeAttribute(key);
        else el.setAttribute(key, String(value));
    }
    return el;
}

/**
 * Append children: strings become text nodes, falsy entries are skipped.
 * @param {Node} parent
 * @param {Child|Child[]} children
 */
function append(parent, children) {
    for (const c of Array.isArray(children) ? children.flat(Infinity) : [children]) {
        if (c === null || c === undefined || c === false) continue;
        parent.appendChild(typeof c === 'object' ? /** @type {Node} */ (c) : document.createTextNode(String(c)));
    }
}

/**
 * Create an HTML element.
 * @param {string} tag
 * @param {Attrs} [attrs]
 * @param {Child|Child[]} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs, children) {
    const el = document.createElement(tag);
    setAttrs(el, attrs || {});
    if (children !== undefined) append(el, children);
    return el;
}

/**
 * Icon paths (24×24 grid, stroke icons drawn in `currentColor`).
 * @type {Readonly<Record<string, string>>}
 */
export const ICONS = Object.freeze({
    new: 'M7 3h7l5 5v13H7zM14 3v5h5M13 11v6M10 14h6',
    open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    save: 'M5 4h11l4 4v12H5zM8 4v5h8V4M8 20v-6h8v6',
    saveAs: 'M12 20H5V4h11l3 3M8 4v5h8V4M14 20l1-3 5-5 2 2-5 5z',
    find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    replace: 'M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3',
    goto: 'M4 6h9M4 12h16M4 18h9M16 15l3-3-3-3',
    wrap: 'M4 6h16M4 12h12a3 3 0 0 1 0 6h-4M14 16l-2 2 2 2M4 18h5',
    zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
    zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
    prev: 'M6 15l6-6 6 6',
    next: 'M6 9l6 6 6-6',
    close: 'M6 6l12 12M18 6L6 18',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5'
});

/**
 * A decorative icon (`aria-hidden`): the control carrying it is named
 * by its own label.
 * @param {keyof typeof ICONS} name
 * @returns {SVGElement}
 */
export function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    setAttrs(svg, { class: 'awn-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
}

/**
 * An icon button, named by `aria-label` and the same text as a tooltip.
 * @param {string} action
 * @param {keyof typeof ICONS} glyph
 * @returns {HTMLButtonElement}
 */
export function iconButton(action, glyph) {
    return /** @type {HTMLButtonElement} */ (h('button', {
        type: 'button', class: 'awn-btn awn-btn--icon', 'data-action': action
    }, icon(glyph)));
}
