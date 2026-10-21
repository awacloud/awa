// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Markdown → a flow View, through `@awacloud/md`'s full bundle
 * (GFM + front matter, footnotes, maths, admonitions…).
 *
 * The HTML is produced in safe mode (raw source HTML stripped, unsafe URL
 * schemes neutralised) AND passed through fw `sanitize`; it is then parsed
 * with `DOMParser` — inert, no script runs — and the nodes are adopted.
 * Nothing is assigned to `innerHTML`.
 *
 * Privacy: a Markdown image only POINTS to a file elsewhere (the safe
 * renderer drops `data:` sources), and loading it would contact that place
 * — a remote image is a tracking pixel. No image is loaded; its alternative
 * text is shown instead and the omission is recorded.
 *
 * @module viewer/render/markdown
 */
import { h } from './dom.js';
import { createOmissions, PAPER_WIDTH } from './view.js';
import { decodeText, renderText } from './text.js';
import { demoteHeadings, hardenLinks } from './html.js';

/**
 * A heading's anchor, as GitHub writes it: lower case, punctuation out,
 * spaces as hyphens (`## Quick start` → `quick-start`).
 * @param {string} text
 */
export function slug(text) {
    return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/**
 * In-document links work, and never collide with the host page: headings
 * get their GitHub anchors (a README's table of contents), every id
 * (headings, footnotes) takes this viewer's prefix, and every `#…` link
 * the same prefix.
 * @param {HTMLElement} body
 * @param {string} prefix
 */
export function anchorIds(body, prefix) {
    const seen = new Map();
    for (const heading of body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (heading.id) continue;
        const base = slug(heading.textContent || '') || 'section';
        const n = seen.get(base) || 0;
        seen.set(base, n + 1);
        heading.id = n ? `${base}-${n}` : base;
    }
    for (const el of body.querySelectorAll('[id]')) el.id = prefix + el.id;
    for (const a of body.querySelectorAll('a[href^="#"]')) {
        const raw = (a.getAttribute('href') || '').slice(1);
        let key = raw;
        try { key = decodeURIComponent(raw); } catch { /* the id as written */ }
        if (key) a.setAttribute('href', `#${prefix}${key}`);
    }
}

/**
 * @param {Uint8Array} bytes
 * @param {{name: string, t: (k: string, p?: object) => string, engine: (f: string) => Promise<any>, headingOffset?: number}} ctx
 * @returns {Promise<import('./view.js').View>}
 */
export async function renderMarkdown(bytes, ctx) {
    const { md } = await ctx.engine('md');
    const omissions = createOmissions();
    let html;
    try {
        html = md.renderHtml(decodeText(bytes), { sanitize: true });
    } catch {
        // Markdown has no syntax errors: a failure is the renderer's own
        // limits (nesting, node count). Under fw sanity its error loses its
        // code (`MdError` assigns `this.name`), so any failure lands here.
        // The text is still worth reading: show it as plain text.
        const view = await renderText(bytes, ctx);
        omissions.add('md/too-complex');
        return { ...view, omissions: omissions.list() };
    }
    const body = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body;

    for (const img of [...body.querySelectorAll('img')]) {
        omissions.add('md/remote-image');
        const alt = img.getAttribute('alt') || '';
        // A role=img takes its name from aria-label only, never its text.
        img.replaceWith(h('span', { class: 'awv-blocked', role: 'img', 'aria-label': alt || ctx.t('view.image') }, alt || ctx.t('view.image')));
    }
    hardenLinks(body);
    anchorIds(body, `${/** @type {{id?: string}} */ (ctx).id || 'awv'}-`);
    demoteHeadings(body, ctx.headingOffset ?? 1);

    const article = h('article', { class: 'awv-paper awv-prose' });
    article.append(...[...body.childNodes].map((n) => document.adoptNode(n)));
    const firstHeading = article.querySelector('h1, h2, h3, h4, h5, h6, [role=heading]');
    return {
        kind: 'flow',
        title: ctx.name,
        meta: { title: firstHeading ? firstHeading.textContent?.trim() || undefined : undefined },
        width: PAPER_WIDTH,
        element: article,
        omissions: omissions.list(),
        dispose() {}
    };
}
