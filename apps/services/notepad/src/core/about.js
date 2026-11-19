// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's About panel (`dialog#app-about` in
 * `public/index.html`), in the Help panel's form: a head with the title,
 * the release under it and the x; a scrollable body — copyright and author
 * as plain text, "Check for updates", the offline line, the one line about
 * AwaCloud (how to install is in Help), the licence, its texts and the
 * third-party notices (cached with the release, so they open offline); the
 * closing button after it. Opened from the header's About button; a modal
 * dialog, so the focus stays inside; the x, the button and Escape close it
 * and the focus returns to the About button. The page markup holds the text; this module only
 * opens, closes, asks the PWA adapter and reports.
 *
 * @module notepad/core/about
 */

/**
 * @param {{doc: Document, t: (k: string, p?: object) => string,
 *   pwa: Promise<import('./pwa.js').PwaController>, onReady?: () => void}} opts
 */
export function mountAbout({ doc, t, pwa, onReady }) {
    const dialog = /** @type {HTMLDialogElement} */ (doc.getElementById('app-about'));
    const opener = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-open'));
    const closer = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-close'));
    const closerX = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-close-x'));
    const check = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-check'));
    const status = /** @type {HTMLElement} */ (doc.getElementById('app-about-status'));
    const build = /** @type {HTMLElement} */ (doc.getElementById('app-about-build'));

    /** The last answers, kept as keys so a language change rewords them. */
    let statusKey = '';
    /** @type {string|null|undefined} undefined: not asked yet; null: no worker answer. */
    let release;

    function label() {
        closerX.setAttribute('aria-label', t('help.close'));
        closerX.title = t('help.close');
        status.textContent = statusKey ? t(statusKey) : '';
        if (release === undefined || release === null) build.textContent = '';
        else build.textContent = release === 'dev' ? `(${t('about.dev')})` : `(${t('about.build', { version: release })})`;
    }

    async function open() {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        if (release === undefined) {
            release = await (await pwa).version();
            label();
        }
    }

    function close() {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
        opener.focus();
    }

    async function checkForUpdates() {
        check.disabled = true;
        statusKey = 'about.checking';
        label();
        try {
            const result = await (await pwa).checkForUpdates();
            statusKey = `about.${result}`;
            if (result === 'ready' && onReady) onReady();
        } finally {
            check.disabled = false;
            label();
        }
    }

    opener.addEventListener('click', () => { void open(); });
    closer.addEventListener('click', close);
    closerX.addEventListener('click', close);
    // Escape closes a modal dialog natively; the focus returns to the opener either way.
    dialog.addEventListener('close', () => { opener.focus(); });
    check.addEventListener('click', () => { void checkForUpdates(); });

    label();
    return { open, close, checkForUpdates, label };
}
