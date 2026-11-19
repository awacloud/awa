// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The header line of the standalone page (`p.app-tagline`):
 * while a document is open it carries the file name (plain text, the full
 * name in its `title`; the stylesheet cuts it with an ellipsis on one line),
 * with none it carries the translated tagline. The name is not a catalog
 * string: the element leaves the `data-i18n` sweep while it shows a name, so
 * a language change keeps it, and takes its key back when the tagline returns.
 *
 * @module viewer/core/docname
 */

const KEY = 'app.tagline';

/**
 * @param {{doc: Document, t: (k: string, p?: object) => string}} opts
 */
export function mountDocName({ doc, t }) {
    const line = /** @type {HTMLElement} */ (doc.querySelector('.app-tagline'));
    /** @type {string|null} */
    let name = null;

    /** Show `file` as the document's name. @param {string} file */
    function show(file) {
        name = String(file || '');
        if (!name) { clear(); return; }
        line.removeAttribute('data-i18n');
        line.dataset.doc = '';
        line.textContent = name;
        line.title = name;
    }

    /** No document: the tagline again. */
    function clear() {
        name = null;
        line.dataset.i18n = KEY;
        delete line.dataset.doc;
        line.removeAttribute('title');
        line.textContent = t(KEY);
    }

    /** Re-word after a language change: only the tagline is worded. */
    function label() {
        if (name === null) line.textContent = t(KEY);
    }

    return { show, clear, label, get name() { return name; } };
}
