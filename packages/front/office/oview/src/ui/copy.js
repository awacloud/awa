// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview "Copy with formatting": the open document as two clipboard
 * flavours, so a paste into a word processor keeps its headings, emphasis,
 * lists, tables and links, and a paste into a text field gets Markdown.
 *
 * One path for every format `@awacloud/oconv` reads: bytes → `oconv.toMd`
 * (the loss ledger in its front matter is dropped, never pasted) →
 * `md.renderHtml` in safe mode. Markdown skips the converter, plain text is
 * an escaped `<pre>`. Fonts, colours and page layout are not carried: the
 * Markdown model has none.
 *
 * The module is pure: it returns PROMISES at once and awaits nothing the
 * caller needs first. The caller hands them to the clipboard inside its
 * user gesture (WebKit refuses a write made after an `await`).
 *
 * Images: the converter hands back the bytes of the pictures it keeps
 * (`assets`, by name; Word and OpenDocument text do, PDF drops them). Those
 * a word processor can take (PNG, JPEG, GIF, WebP) are embedded as `data:`
 * URLs in the HTML flavour only, up to a total budget; every other picture,
 * and every remote one (the renderer only points to it, loading it would
 * contact that place), becomes its alternative text.
 *
 * @module oview/ui/copy
 */
import { decodeText } from '../render/text.js';

/** Image bytes embedded in one copy, in total (the rest becomes alt text). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** @param {string} s */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The current instant as an ISO string (the converter takes a caller-owned timestamp). */
const isoNow = () => new Date(Date.now()).toISOString();

/**
 * Drop the YAML front matter the converter writes (provenance, loss ledger):
 * a leading `---` line up to the next `---` line. A document without a
 * closed fence is returned unchanged.
 * @param {string} markdown
 * @returns {string}
 */
export function stripFrontMatter(markdown) {
    const lines = markdown.split('\n');
    if (lines[0].replace(/\r$/, '') !== '---') return markdown;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].replace(/\r$/, '') === '---') return lines.slice(i + 1).join('\n');
    }
    return markdown;
}

/**
 * The media type of a raster picture a word processor takes, from its
 * leading bytes; `null` for anything else (vector formats included).
 * @param {Uint8Array|undefined} bytes
 * @returns {string|null}
 */
export function sniffImage(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 4) return null;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
    const tag = (from, s) => [...s].every((c, i) => bytes[from + i] === c.charCodeAt(0));
    if (tag(0, 'RIFF') && tag(8, 'WEBP')) return 'image/webp';
    return null;
}

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)));
    }
    return btoa(binary);
}

/**
 * Settle every picture of an HTML fragment: a kept one becomes a `data:`
 * URL, any other becomes its alternative text.
 * @param {string} fragment
 * @param {{kind?: string, name: string, bytes?: Uint8Array}[]} assets
 * @param {number} budget total image bytes that may be embedded
 * @returns {{html: string, leftOut: boolean}}
 */
function settleImages(fragment, assets, budget) {
    if (!/<img\b/i.test(fragment)) return { html: fragment, leftOut: false };
    const byName = new Map(assets.filter((a) => a && a.bytes instanceof Uint8Array).map((a) => [a.name, a.bytes]));
    const body = new DOMParser().parseFromString(`<!doctype html><body>${fragment}`, 'text/html').body;
    let used = 0;
    let leftOut = false;
    for (const img of [...body.querySelectorAll('img')]) {
        const raw = img.getAttribute('src') || '';
        let key = raw;
        try { key = decodeURIComponent(raw); } catch { /* the name as written */ }
        const bytes = byName.get(key);
        const type = sniffImage(bytes);
        if (bytes && type && used + bytes.length <= budget) {
            used += bytes.length;
            img.setAttribute('src', `data:${type};base64,${toBase64(bytes)}`);
        } else {
            leftOut = true;
            img.replaceWith(document.createTextNode(img.getAttribute('alt') || ''));
        }
    }
    return { html: body.innerHTML, leftOut };
}

/**
 * @typedef {object} CopySource
 * @property {string} format `pdf`, `docx`, `odt`, `xlsx`, `ods`, `pptx`, `odp`, `md` or `text`.
 * @property {string} name File name (the converter's provenance).
 * @property {Uint8Array} bytes
 *
 * @typedef {object} CopyOptions
 * @property {() => string} [now] ISO timestamp for the converter.
 * @property {number} [maxImageBytes] Embedded-image budget (default 10 MiB).
 * @property {boolean} [withHtml=true] `false` skips the HTML flavour (the
 *   text fallback needs only the Markdown); `html` then resolves to `''`.
 *
 * @typedef {object} CopyJob
 * @property {Promise<string>} html A minimal HTML document around the fragment.
 * @property {Promise<string>} text The Markdown (the source itself for Markdown and text).
 * @property {Promise<{imagesLeftOut: boolean}>} notes Whether a picture could
 *   not travel (dropped by the converter, remote, unsupported or over budget).
 */

/**
 * Start a copy: returns at once, the work runs behind the promises.
 *
 * @param {CopySource} source
 * @param {(name: 'oconv'|'md') => Promise<any>} engine The viewer runtime's lazy engines.
 * @param {CopyOptions} [opts]
 * @returns {CopyJob}
 */
export function buildCopy(source, engine, opts = {}) {
    const { format, name, bytes } = source;
    const withHtml = opts.withHtml !== false;
    const now = opts.now || isoNow;
    const budget = opts.maxImageBytes ?? MAX_IMAGE_BYTES;
    const plain = format === 'text';
    const markdownSource = format === 'md';

    /** Markdown, pictures and whether the converter dropped some. */
    const converted = (async () => {
        if (plain || markdownSource) return { markdown: decodeText(bytes), assets: [], dropped: false };
        const { oconv } = await engine('oconv');
        const result = await oconv.toMd({ name, bytes, format, convertedAt: now() });
        return {
            markdown: stripFrontMatter(result.markdown),
            assets: result.assets || [],
            dropped: (result.losses || []).some((l) => /^image\//.test(l.code))
        };
    })();

    const rendered = converted.then(async (c) => {
        if (!withHtml) return { html: '', leftOut: c.dropped };
        let fragment;
        let leftOut = c.dropped;
        if (plain) {
            fragment = `<pre>${escapeHtml(c.markdown)}</pre>`;
        } else {
            const { md } = await engine('md');
            try {
                const settled = settleImages(md.renderHtml(c.markdown, { sanitize: true }), c.assets, budget);
                fragment = settled.html;
                leftOut = leftOut || settled.leftOut;
            } catch {
                // Past the renderer's own limits (nesting, node count): the text is still worth pasting.
                fragment = `<pre>${escapeHtml(c.markdown)}</pre>`;
            }
        }
        return { html: `<!doctype html><meta charset="utf-8"><body>${fragment}`, leftOut };
    });

    const job = {
        html: rendered.then((r) => r.html),
        text: converted.then((c) => c.markdown),
        notes: rendered.then((r) => ({ imagesLeftOut: r.leftOut }))
    };
    // A flavour the caller never awaits must not surface as an unhandled rejection.
    for (const p of Object.values(job)) p.catch(() => {});
    return job;
}
