// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's "more files" line (`#app-more` in
 * `public/index.html`): files chosen, dropped or launched together beyond
 * the first wait here; each "Open the next one" click opens one in a new
 * window of the app, through the handoff (`handoff.js`). One per click:
 * browsers allow one new window per user gesture. "Dismiss" forgets them.
 *
 * @module viewer/core/more
 */

/**
 * @param {{doc: Document, t: (k: string, p?: object) => string,
 *   tn: (k: string, n: number, p?: object) => string,
 *   number: (v: number) => string,
 *   handoff: ReturnType<typeof import('./handoff.js').createHandoff>}} opts
 */
export function mountMore({ doc, t, tn, number, handoff }) {
    const line = /** @type {HTMLElement} */ (doc.getElementById('app-more'));
    const text = /** @type {HTMLElement} */ (doc.getElementById('app-more-text'));
    const next = /** @type {HTMLButtonElement} */ (doc.getElementById('app-more-open'));
    const dismiss = /** @type {HTMLButtonElement} */ (doc.getElementById('app-more-dismiss'));
    /** @type {import('./handoff.js').Item[]} */
    let queue = [];

    function label() {
        line.hidden = queue.length === 0;
        if (!queue.length) return;
        const name = queue[0].file && 'name' in queue[0].file ? /** @type {File} */ (queue[0].file).name : (queue[0].handle?.name || '');
        text.textContent = tn('more.waiting', queue.length, { count: number(queue.length), name });
        next.textContent = t('more.open', { name });
        dismiss.textContent = t('more.dismiss');
    }

    next.addEventListener('click', async () => {
        const item = queue.shift();
        label();
        if (!item) return;
        // The click is the user gesture that lets the page open one window.
        const token = await handoff.give(item);
        const link = doc.createElement('a');
        link.href = handoff.url(token, doc.baseURI);
        link.target = '_blank';
        link.rel = 'noopener';
        link.hidden = true;
        doc.body.append(link);
        link.click();
        link.remove();
    });
    dismiss.addEventListener('click', () => { queue = []; label(); });

    return {
        /** Files beyond the first: they wait for "Open the next one". @param {import('./handoff.js').Item[]} items */
        add(items) {
            queue.push(...items);
            label();
        },
        get waiting() { return queue.length; },
        label
    };
}
