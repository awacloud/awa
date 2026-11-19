// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The About panel on the real page markup: it opens as a
 * modal and closes, carries the legal notices as plain text and the
 * licence links, reports the release and every answer of "Check for
 * updates" (and shows the update banner for a waiting one), and every
 * `data-i18n` key of the page exists in both catalogs.
 *
 * @module notepad/core/about.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mountAbout } from './about.js';
import { CATALOGS } from './i18n.js';

const page = readFileSync(fileURLToPath(new URL('../../public/index.html', import.meta.url)), 'utf8');
const body = String(/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');

/** A translator over the English catalog with `{x}` interpolation. */
const t = (key, params = {}) => String(key.split('.').reduce((o, k) => o?.[k], CATALOGS.en) ?? key)
    .replace(/\{(\w+)\}/g, (_, k) => String(params[k]));

/** A PWA controller answering `result` and serving `version`. */
const pwa = (result, version) => Promise.resolve(/** @type {any} */ ({
    state: 'registered', checkForUpdates: async () => result, version: async () => version,
    applyUpdate: () => false, updateReady: () => false
}));

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

describe('About panel', () => {
    beforeEach(() => { document.body.innerHTML = body; });

    test('the page has no footer: the legal notices live in the panel, as plain text', () => {
        expect(document.querySelector('footer')).toBe(null);
        const dialog = $('app-about');
        expect(dialog.tagName).toBe('DIALOG');
        expect(dialog.textContent).toContain('Copyright (c) 2026 AwaCloud SAS');
        expect(dialog.textContent).toContain('Author: Matthieu Bouilloux');
        expect(dialog.textContent).toContain('no warranty');
        const hrefs = [...dialog.querySelectorAll('#app-about-files a')].map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual(['../LICENSE', '../NOTICE']);
        const promo = /** @type {HTMLAnchorElement} */ (dialog.querySelector('.app-about-promo a'));
        expect(promo.getAttribute('href')).toBe('https://awacloud.com/');
        expect(promo.getAttribute('rel')).toBe('noopener noreferrer');
        expect($('app-about-open').getAttribute('aria-controls')).toBe('app-about');
    });

    test('the help form: head with title, version and the x; body in the owner order; the closing button after it', () => {
        const dialog = $('app-about');
        expect(dialog.classList.contains('app-help')).toBe(true);
        const head = /** @type {HTMLElement} */ (dialog.querySelector('.app-help-head'));
        expect(head.querySelector('#app-about-title')?.getAttribute('data-i18n')).toBe('about.title');
        expect(head.querySelector('.app-about-version')?.textContent).toContain('@awacloud/notepad');
        expect(head.querySelector('#app-about-build')).not.toBe(null);
        const x = /** @type {HTMLElement} */ (head.querySelector('#app-about-close-x'));
        expect(x.classList.contains('app-help-close')).toBe(true);
        expect(x.getAttribute('aria-label')).toBe('Close (Escape)');
        const bodyEl = $('app-about-body');
        expect(bodyEl.classList.contains('app-help-body')).toBe(true);
        const order = ['.app-about-legal', '#app-about-check', '#app-offline', '.app-about-promo', '.app-about-licence', '#app-about-files']
            .map((sel) => /** @type {Element} */ (bodyEl.querySelector(sel)));
        expect(order.every((el) => el)).toBe(true);
        for (let i = 1; i < order.length; i++) {
            expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, String(i)).toBeTruthy();
        }
        const bottom = $('app-about-close');
        expect(bodyEl.contains(bottom)).toBe(false);
        expect(bodyEl.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect($('app-offline').hasAttribute('hidden')).toBe(true);   // the PWA adapter reveals it, unchanged
    });

    test('its height follows its content, capped as the Help panel is (owner answer 2026-11-18)', () => {
        const css = readFileSync(fileURLToPath(new URL('../styles/app.css', import.meta.url)), 'utf8');
        expect(css).toContain('.app-about.app-help { height: fit-content; max-height: min(52rem, calc(100dvh - 2 * var(--fw-space-4))); }');
        const help = /^\.app-help \{[^}]*\}/m.exec(css)?.[0] ?? '';
        expect(help).toContain('height: calc(100dvh - 2 * var(--fw-space-4));');
        expect(help).toContain('max-height: 52rem;');
    });

    test('the x and the bottom button both close, Escape closes, and the focus returns to the opener', async () => {
        const about = mountAbout({ doc: document, t, pwa: pwa('current', 'dev') });
        const dialog = /** @type {HTMLDialogElement} */ ($('app-about'));
        for (const id of ['app-about-close-x', 'app-about-close']) {
            await about.open();
            expect(dialog.open).toBe(true);
            $(id).click();
            expect(dialog.open).toBe(false);
            expect(document.activeElement).toBe($('app-about-open'));
            $('app-about-check').focus();
        }
        await about.open();
        dialog.close();   // what Escape does to a modal dialog
        expect(document.activeElement).toBe($('app-about-open'));
    });

    test('the x is worded in the page language', () => {
        const about = mountAbout({ doc: document, t: (k) => (k === 'help.close' ? 'Fermer (Échap)' : k), pwa: pwa('current', null) });
        about.label();
        expect($('app-about-close-x').getAttribute('aria-label')).toBe('Fermer (Échap)');
        expect($('app-about-close-x').title).toBe('Fermer (Échap)');
    });

    test('opens as a modal with the release, closes', async () => {
        const about = mountAbout({ doc: document, t, pwa: pwa('current', 'abc123def456') });
        await about.open();
        expect(/** @type {HTMLDialogElement} */ ($('app-about')).open).toBe(true);
        expect($('app-about-build').textContent).toBe('(build abc123def456)');
        $('app-about-close').click();
        expect(/** @type {HTMLDialogElement} */ ($('app-about')).open).toBe(false);
    });

    test('from the sources, the release says development', async () => {
        const about = mountAbout({ doc: document, t, pwa: pwa('current', 'dev') });
        await about.open();
        expect($('app-about-build').textContent).toBe('(development version)');
    });

    test('every answer of Check for updates is said; a waiting release shows the banner', async () => {
        for (const [result, text] of [
            ['current', 'You have the latest version.'],
            ['offline', 'Could not check for updates: you seem to be offline.'],
            ['unavailable', 'This browser cannot check for updates.'],
            ['ready', 'A new version is ready.']
        ]) {
            document.body.innerHTML = body;
            let ready = 0;
            const about = mountAbout({ doc: document, t, pwa: pwa(result, null), onReady: () => { ready++; } });
            await about.checkForUpdates();
            expect($('app-about-status').textContent).toBe(text);
            expect($('app-about-status').getAttribute('role')).toBe('status');
            expect(ready).toBe(result === 'ready' ? 1 : 0);
            expect(/** @type {HTMLButtonElement} */ ($('app-about-check')).disabled).toBe(false);
        }
    });

    test('every data-i18n key of the page exists in both catalogs', () => {
        const keys = [...page.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
        expect(keys.length).toBeGreaterThan(10);
        for (const locale of ['en', 'fr']) {
            const missing = keys.filter((k) => typeof k.split('.').reduce((o, p) => o?.[p], CATALOGS[locale]) !== 'string');
            expect(missing, locale).toEqual([]);
        }
    });
});
