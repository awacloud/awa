// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Plain-DOM builders shared by the shell and the painters.
 *
 * Why not fw `template` / `uiSession`: the template engine rewrites every
 * rendered element id at mount, and the viewer relies on real ids for
 * `aria-controls` / `aria-labelledby` and on painters producing many
 * thousands of nodes. Text is always set with `textContent`;
 * no builder here ever parses HTML.
 *
 * @module viewer/render/dom
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @typedef {Node|string|number|null|undefined|false} Child
 * @typedef {Record<string, string|number|boolean|null|undefined|Record<string, string>>} Attrs
 */

/**
 * Append children: strings become text nodes, falsy entries are skipped,
 * arrays are flattened.
 * @param {Node} parent
 * @param {Child|Child[]} children
 */
export function append(parent, children) {
    const list = Array.isArray(children) ? children.flat(Infinity) : [children];
    for (const c of list) {
        if (c === null || c === undefined || c === false) continue;
        parent.appendChild(typeof c === 'object' ? /** @type {Node} */ (c) : document.createTextNode(String(c)));
    }
    return parent;
}

/**
 * Set attributes: `true` → empty attribute, `false`/`null`/`undefined` →
 * removed, `style` takes an object of properties (custom properties too),
 * `text` sets `textContent`.
 * @param {Element} el
 * @param {Attrs} attrs
 */
export function setAttrs(el, attrs) {
    for (const [key, value] of Object.entries(attrs || {})) {
        if (key === 'style' && value && typeof value === 'object') {
            const style = /** @type {HTMLElement} */ (el).style;
            for (const [prop, v] of Object.entries(value)) {
                if (v === null || v === undefined || v === '') continue;
                style.setProperty(prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(v));
            }
        } else if (key === 'text') {
            el.textContent = value === null || value === undefined ? '' : String(value);
        } else if (value === true) {
            el.setAttribute(key, '');
        } else if (value === false || value === null || value === undefined) {
            el.removeAttribute(key);
        } else {
            el.setAttribute(key, String(value));
        }
    }
    return el;
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
 * Create an SVG element.
 * @param {string} tag
 * @param {Attrs} [attrs]
 * @param {Child|Child[]} [children]
 * @returns {SVGElement}
 */
export function s(tag, attrs, children) {
    const el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs || {});
    if (children !== undefined) append(el, children);
    return el;
}

/**
 * Icon paths (24×24 grid, stroke icons drawn in `currentColor`).
 * @type {Readonly<Record<string, string>>}
 */
export const ICONS = Object.freeze({
    open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    close: 'M6 6l12 12M18 6L6 18',
    prev: 'M15 6l-6 6 6 6',
    next: 'M9 6l6 6-6 6',
    zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
    zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
    fitWidth: 'M4 5v14M20 5v14M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3',
    fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    exitFullscreen: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5',
    document: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6'
});

/**
 * A decorative icon (`aria-hidden`): the control carrying it is named
 * by its own label.
 * @param {keyof typeof ICONS} name
 * @returns {SVGElement}
 */
export function icon(name) {
    return s('svg', {
        class: 'awv-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false'
    }, s('path', { d: ICONS[name] }));
}
