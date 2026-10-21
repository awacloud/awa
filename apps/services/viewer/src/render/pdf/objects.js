// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Readers over `@awacloud/pdf`'s typed object model
 * (`{type: 'int'|'real'|'name'|'string'|'array'|'dict'|'ref'|'stream'|'bool'|'null', …}`):
 * dereference, then read one JS value — `null` whenever the shape is not
 * the expected one. A damaged file degrades to "not drawn", never to a throw
 * from a reader.
 *
 * @module viewer/render/pdf/objects
 */

/**
 * @typedef {{type: string, value?: any, items?: PdfObj[], entries?: Record<string, PdfObj>,
 *   dict?: {type: 'dict', entries: Record<string, PdfObj>}, raw?: Uint8Array, num?: number, gen?: number}} PdfObj
 * @typedef {(ref: PdfObj) => PdfObj} Resolve
 */

/**
 * Follow indirect references (bounded: a reference chain longer than 16 is
 * treated as broken).
 * @param {PdfObj|null|undefined} obj
 * @param {Resolve} resolve
 * @returns {PdfObj|null}
 */
export function deref(obj, resolve) {
    let cur = obj || null;
    for (let i = 0; cur && cur.type === 'ref' && i < 16; i++) {
        try { cur = resolve(cur); } catch { return null; }
    }
    return cur && cur.type !== 'ref' ? cur : null;
}

/** @param {PdfObj|null|undefined} o @returns {number|null} */
export function num(o) {
    return o && (o.type === 'int' || o.type === 'real') && Number.isFinite(o.value) ? o.value : null;
}

/** @param {PdfObj|null|undefined} o @returns {string|null} */
export function name(o) {
    return o && o.type === 'name' ? String(o.value) : null;
}

/** @param {PdfObj|null|undefined} o @returns {boolean|null} */
export function bool(o) {
    return o && o.type === 'bool' ? !!o.value : null;
}

/**
 * The entries of a dictionary, or of a stream's dictionary.
 * @param {PdfObj|null|undefined} o
 * @returns {Record<string, PdfObj>|null}
 */
export function entries(o) {
    if (!o) return null;
    if (o.type === 'dict') return o.entries || {};
    if (o.type === 'stream') return o.dict?.entries || {};
    return null;
}

/**
 * `dict[key]`, dereferenced.
 * @param {PdfObj|null|undefined} o
 * @param {string} key
 * @param {Resolve} resolve
 * @returns {PdfObj|null}
 */
export function get(o, key, resolve) {
    const e = entries(o);
    return e && e[key] ? deref(e[key], resolve) : null;
}

/**
 * The items of an array, each dereferenced.
 * @param {PdfObj|null|undefined} o
 * @param {Resolve} resolve
 * @returns {PdfObj[]|null}
 */
export function arr(o, resolve) {
    if (!o || o.type !== 'array') return null;
    return (o.items || []).map((it) => deref(it, resolve) || { type: 'null' });
}

/**
 * An array of numbers (non-numbers become 0), or `null`.
 * @param {PdfObj|null|undefined} o
 * @param {Resolve} resolve
 * @returns {number[]|null}
 */
export function nums(o, resolve) {
    const a = arr(o, resolve);
    return a ? a.map((x) => num(x) ?? 0) : null;
}

/**
 * Decode a PDF text string (§7.9.2.2): UTF-16BE with BOM, UTF-8 with BOM,
 * else PDFDocEncoding (read as Latin-1, its printable overlap).
 * @param {PdfObj|null|undefined} o
 * @returns {string|null}
 */
export function text(o) {
    if (!o || o.type !== 'string' || !(o.value instanceof Uint8Array)) return null;
    const b = o.value;
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
    let s = '';
    for (const c of b) s += String.fromCharCode(c);
    return s;
}

/**
 * A stable cache key for an object: `num:gen` for indirect ones.
 * @param {PdfObj|null|undefined} o
 * @returns {string|null}
 */
export function refKey(o) {
    return o && o.type === 'ref' ? `${o.num}:${o.gen}` : null;
}

/** 2×3 affine product, PDF order `[a b c d e f]`: `m1` then `m2`. */
export function mul(m1, m2) {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
    ];
}

/** Apply matrix `m` to point (x, y). */
export function apply(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Inverse of an affine matrix, or `null` when singular. */
export function invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det) return null;
    return [
        m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
        (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det
    ];
}

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
