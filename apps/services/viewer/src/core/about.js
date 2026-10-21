// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's About panel (`dialog#app-about` in
 * `public/index.html`): the release, the legal notices — copyright and
 * author as plain text, the licence, its texts and the third-party notices
 * (cached with the release, so they open offline) — "Check for updates",
 * and the one line about AwaCloud (how to install is in Help). Opened from the header's
 * About button; a modal dialog, so the focus stays inside and returns to
 * the button on close. The page markup holds the text; this module only
 * opens, closes, asks the PWA adapter and reports.
 *
 * @module viewer/core/about
 */

/**
 * @param {{doc: Document, t: (k: string, p?: object) => string,
 *   pwa: Promise<import('./pwa.js').PwaController>, onReady?: () => void}} opts
 */
export function mountAbout({ doc, t, pwa, onReady }) {
    const dialog = /** @type {HTMLDialogElement} */ (doc.getElementById('app-about'));
    const opener = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-open'));
    const closer = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-close'));
    const check = /** @type {HTMLButtonElement} */ (doc.getElementById('app-about-check'));
    const status = /** @type {HTMLElement} */ (doc.getElementById('app-about-status'));
    const build = /** @type {HTMLElement} */ (doc.getElementById('app-about-build'));

    /** The last answers, kept as keys so a language change rewords them. */
    let statusKey = '';
    /** @type {string|null|undefined} undefined: not asked yet; null: no worker answer. */
    let release;

    function label() {
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
    check.addEventListener('click', () => { void checkForUpdates(); });

    return { open, close, checkForUpdates, label };
}
