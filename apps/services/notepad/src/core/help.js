// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's Help panel (`dialog#app-help` in
 * `public/index.html`): the help page of the reader's language
 * (`public/help/{en,fr}.html`, pre-cached with the release, so it opens
 * offline) shown over the app, in a modal dialog closed by its button or
 * Escape, the focus returning to the Help button. The help pages stay
 * whole pages (a direct link still works); the panel takes their `<main>`
 * and rebuilds it from a short list of text elements — no markup is
 * injected, in-page links scroll inside the panel, anything else is
 * dropped.
 *
 * @module notepad/core/help
 */

/** Elements kept from a help page, with the attributes each may carry. */
const KEEP = new Map([
    ['p', []], ['ul', []], ['ol', []], ['li', []], ['nav', ['aria-label']],
    ['h2', ['id']], ['h3', ['id']], ['table', []], ['thead', []], ['tbody', []],
    ['tr', []], ['th', []], ['td', []], ['kbd', []], ['code', []],
    ['strong', []], ['em', []], ['a', ['href']], ['span', []]
]);
/** Ids of the help page are prefixed so they never meet the app's own. */
const PREFIX = 'app-help-';

/**
 * @param {{doc: Document, t: (k: string, p?: object) => string,
 *   locale: () => string,
 *   load?: (lang: string) => Promise<string>}} opts `load`: the help page's
 *   HTML for `en` or `fr` (default: fetched next to the page).
 */
export function mountHelp({ doc, t, locale, load }) {
    const dialog = /** @type {HTMLDialogElement} */ (doc.getElementById('app-help'));
    const body = /** @type {HTMLElement} */ (doc.getElementById('app-help-body'));
    const closer = /** @type {HTMLButtonElement} */ (doc.getElementById('app-help-close'));
    const read = load || (async (lang) => {
        const response = await fetch(new URL(`help/${lang}.html`, doc.baseURI));
        if (!response.ok) throw new Error(`help/${lang}.html: HTTP ${response.status}`);
        return response.text();
    });
    /** @type {Map<string, Promise<string>>} */
    const pages = new Map();
    /** The language shown, '' before the first opening. */
    let shown = '';

    const lang = () => (locale() === 'fr' ? 'fr' : 'en');

    /**
     * A help page's `<main>`, rebuilt in this document from KEEP only.
     * @param {string} html
     */
    function rebuild(html) {
        const page = new DOMParser().parseFromString(html, 'text/html');
        const main = page.querySelector('main');
        const out = doc.createDocumentFragment();
        /** @param {Node} from @param {Node} to */
        const copy = (from, to) => {
            for (const node of from.childNodes) {
                if (node.nodeType === 3) { to.appendChild(doc.createTextNode(node.nodeValue || '')); continue; }
                if (node.nodeType !== 1) continue;
                const el = /** @type {Element} */ (node);
                const tag = el.localName;
                const allowed = KEEP.get(tag);
                if (!allowed) { if (tag !== 'script' && tag !== 'style') copy(el, to); continue; }
                const made = doc.createElement(tag);
                for (const name of allowed) {
                    const value = el.getAttribute(name);
                    if (value === null) continue;
                    if (name === 'id') made.id = PREFIX + value;
                    else if (name === 'href') { if (value.startsWith('#')) made.setAttribute('href', `#${PREFIX}${value.slice(1)}`); }
                    else made.setAttribute(name, value);
                }
                if (el.classList.contains('note')) made.className = 'app-help-note';
                copy(el, made);
                to.appendChild(made);
            }
        };
        if (main) copy(main, out);
        return out;
    }

    async function render() {
        const want = lang();
        shown = want;
        let html;
        try {
            if (!pages.has(want)) pages.set(want, read(want));
            html = await /** @type {Promise<string>} */ (pages.get(want));
        } catch {
            pages.delete(want);
            if (shown !== want) return;
            const p = doc.createElement('p');
            p.className = 'app-help-note';
            p.textContent = t('help.unavailable');
            body.replaceChildren(p);
            return;
        }
        if (shown !== want) return;   // the language changed meanwhile
        body.replaceChildren(rebuild(html));
        body.scrollTop = 0;
    }

    function label() {
        closer.setAttribute('aria-label', t('help.close'));
        closer.title = t('help.close');
        if (dialog.open && shown && shown !== lang()) void render();
    }

    async function open() {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        if (shown !== lang() || !body.firstChild) await render();
    }

    function close() {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
    }

    closer.addEventListener('click', close);
    // In-page links (the contents) scroll inside the panel; the page URL never changes.
    body.addEventListener('click', (event) => {
        const link = /** @type {HTMLElement} */ (event.target).closest?.('a[href^="#"]');
        if (!link) return;
        event.preventDefault();
        const target = doc.getElementById((link.getAttribute('href') || '').slice(1));
        if (target && body.contains(target)) target.scrollIntoView({ block: 'start' });
    });
    label();

    return { open, close, label };
}
