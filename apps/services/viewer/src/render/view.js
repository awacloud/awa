// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The View contract every painter returns, and the small
 * pieces they share: unit conversion, colour parsing, the omission ledger
 * and the object-URL pool a View owns.
 *
 * ```
 * View = {
 *   kind: 'flow' | 'paged' | 'sheets',
 *   title: string,
 *   meta: { title?, author? },
 *   element?: HTMLElement,                      // flow
 *   width?: number,                             // flow / sheets: natural width, for "fit width"
 *   pages?: Page[],                             // paged
 *   pageLabel?: 'page' | 'slide',               // paged
 *   sheets?: { name: string, element: HTMLElement, width?: number, prepare?: () => void }[],
 *                                          // width: natural, for Fit width; prepare: paint on first show
 *   omissions: { code: string, count: number }[],
 *   dispose(): void
 * }
 * Page = { width, height, draw(host, zoom): Promise<void>, text?: string }
 * ```
 *
 * Sizes are CSS pixels at zoom 1 (96 dpi).
 *
 * @module viewer/render/view
 */

/** CSS pixels per unit. */
export const PX = Object.freeze({
    pt: 96 / 72,
    twip: 96 / 1440,       // WordprocessingML "dxa"
    emu: 96 / 914400,      // DrawingML English Metric Unit
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    pc: 16,
    px: 1
});

/** Natural width of a text / Markdown sheet: US Letter, 8.5 in (`--awv-paper-w`). */
export const PAPER_WIDTH = 816;

/**
 * Longest page side laid out, in CSS px at zoom 1 (about 5.3 m). PDF's
 * own limit is 14,400 units (200 in) × `/UserUnit`; slides stop at 56 in.
 */
export const MAX_PAGE_PX = 20000;

/**
 * A page or slide side read from a file, in CSS px: `fallback` when it is
 * missing, not a number, smaller than a pixel or beyond `MAX_PAGE_PX`.
 * @param {number|null|undefined} px
 * @param {number} fallback
 */
export function pageSide(px, fallback) {
    return typeof px === 'number' && px >= 1 && px <= MAX_PAGE_PX ? px : fallback;
}

/**
 * Parse an ODF / CSS length (`2.5cm`, `12pt`, `0.5in`, `10mm`, `3px`) to CSS px.
 * @param {string|number|null|undefined} value
 * @returns {number|null} `null` when absent or unparsable (percentages too).
 */
export function lengthPx(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const m = /^\s*(-?[\d.]+)\s*(pt|in|cm|mm|pc|px)?\s*$/i.exec(String(value ?? ''));
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const unit = /** @type {keyof typeof PX} */ ((m[2] || 'px').toLowerCase());
    return n * PX[unit];
}

/**
 * Normalise a document colour to `#rrggbb` — OOXML `RRGGBB` / `auto`, ODF
 * `#rrggbb`, three-digit shorthand. `auto`, `none` and anything unparsable
 * give `null` (the painter then inherits).
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function hexColour(value) {
    const v = String(value ?? '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(v)) return '#' + v.toLowerCase();
    if (/^[0-9a-f]{3}$/i.test(v)) return '#' + v.replace(/./g, (c) => c + c).toLowerCase();
    return null;
}

/**
 * The omission ledger: what a painter skipped, counted by code. Codes are
 * the `omission.*` keys of the catalogs.
 */
export function createOmissions() {
    /** @type {Map<string, number>} */
    const counts = new Map();
    return {
        /** @param {string} code @param {number} [n] */
        add(code, n = 1) { counts.set(code, (counts.get(code) || 0) + n); },
        /** @returns {{code: string, count: number}[]} */
        list() { return [...counts].map(([code, count]) => ({ code, count })); }
    };
}

/**
 * Bytes as base64, in slices (one `String.fromCharCode` call per 32 KiB).
 * @param {Uint8Array} bytes
 */
export function base64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/**
 * Object URLs a View hands to `<img>` elements, all revoked by `dispose()`
 * — except SVG pictures, given as `data:` URLs (see `add`).
 */
export function createUrlPool() {
    /** @type {string[]} */
    const urls = [];
    return {
        /**
         * @param {Uint8Array} bytes
         * @param {string} [type]
         * @returns {string}
         */
        add(bytes, type) {
            // An SVG is a document that can hold script: as a `blob:` URL of
            // the app's origin, "open image in a new tab" would run it on that
            // origin. A `data:` URL cannot be opened top-level, and an <img>
            // never runs an SVG's script.
            if (type === 'image/svg+xml') return `data:image/svg+xml;base64,${base64(bytes)}`;
            const url = URL.createObjectURL(new Blob([bytes], type ? { type } : undefined));
            urls.push(url);
            return url;
        },
        dispose() {
            for (const url of urls.splice(0)) URL.revokeObjectURL(url);
        }
    };
}

/** Image media types by file extension, for package parts that carry none. */
export const IMAGE_TYPES = Object.freeze({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff'
});

/**
 * Media type of an image part from its name, or `null` when the browser
 * cannot show it (EMF / WMF, which are vector metafiles).
 * @param {string} partName
 * @returns {string|null}
 */
export function imageType(partName) {
    const ext = String(partName || '').split('.').pop()?.toLowerCase() || '';
    return Object.hasOwn(IMAGE_TYPES, ext) ? IMAGE_TYPES[/** @type {keyof typeof IMAGE_TYPES} */ (ext)] : null;
}

/**
 * @typedef {{l: number, t: number, r: number, b: number}} Crop
 *   fractions cut from each edge (negative: the picture is extended)
 */

/** The text of a package part (parts are strings or bytes). */
export function partText(part) {
    if (!part) return '';
    return typeof part === 'string' ? part : new TextDecoder().decode(part);
}

/**
 * A DrawingML picture crop (`a:blipFill/a:srcRect`, ECMA-376 §20.1.8.55)
 * from the typed `srcRect` `@awacloud/ooxml` gives a pptx picture and a
 * docx drawing (`{ l?, t?, r?, b? }`, 1/1000 of a percent per side).
 * @param {{l?: number, t?: number, r?: number, b?: number}|undefined} rect
 * @returns {Crop|undefined}
 */
export function typedCrop(rect) {
    if (!rect || typeof rect !== 'object') return undefined;
    const v = (k) => {
        const n = Number(rect[k] ?? 0) / 100000;
        return Number.isFinite(n) ? n : 0;
    };
    const crop = { l: v('l'), t: v('t'), r: v('r'), b: v('b') };
    return crop.l || crop.t || crop.r || crop.b ? crop : undefined;
}

/**
 * Show only the cropped part of a picture: the image is enlarged and moved
 * inside its frame, which clips it (`overflow: hidden`). The frame must be
 * a positioned box.
 * @param {HTMLElement} frame the picture's box, sized as the visible part
 * @param {HTMLImageElement} img
 * @param {Crop|undefined} crop
 */
export function applyCrop(frame, img, crop) {
    if (!crop) return;
    const w = 1 - crop.l - crop.r;
    const ht = 1 - crop.t - crop.b;
    // A crop that leaves (almost) nothing is ignored, as the suites do.
    if (!(w > 0.01 && ht > 0.01)) return;
    frame.style.overflow = 'hidden';
    img.style.position = 'absolute';
    img.style.maxWidth = 'none';
    img.style.width = `${(100 / w).toFixed(4)}%`;
    img.style.height = `${(100 / ht).toFixed(4)}%`;
    img.style.left = `${((-crop.l / w) * 100).toFixed(4)}%`;
    img.style.top = `${((-crop.t / ht) * 100).toFixed(4)}%`;
}
