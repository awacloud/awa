// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page boots on `public/index.html`: the
 * viewer mounts in `main#viewer`, the shell is translated, and files chosen
 * together beyond the first wait on the "more files" line, each opening in
 * a new window that takes it over through the handoff.
 *
 * @module viewer/app.test
 */
import '../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot } from './app.js';

const page = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
const body = String(/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');
/** Let pending promise chains run. @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Map-backed handoff store shared by the "windows" of a test. */
function handoffKv() {
    const files = new Map();
    return {
        files,
        kv: { store: {
            get: async (k) => files.get(k), set: async (k, v) => { files.set(k, v); },
            del: async (k) => { files.delete(k); }, getAllKeys: async () => [...files.keys()]
        } }
    };
}

/** @param {any} handoff @param {(lang: string) => Promise<string>} [loadHelp] */
function load(handoff, url = 'http://localhost/viewer/', loadHelp = undefined) {
    window.happyDOM?.setURL(url);
    document.body.innerHTML = body;
    return boot({ handoff, loadHelp });
}

describe('boot', () => {
    test('mounts the viewer in the page and titles the window', () => {
        const v = load(handoffKv().kv);
        expect(document.querySelector('#viewer > .awv')).toBe(v.element);
        expect(document.title).toBe('AWA Viewer');
        expect(/** @type {HTMLElement} */ (document.getElementById('app-more')).hidden).toBe(true);
        v.destroy();
    });

    test('three files dropped: the first opens, the next opens in a new window that takes it over', async () => {
        const h = handoffKv();
        const v = load(h.kv);
        const opened = [];
        const onClick = (e) => {
            const a = /** @type {HTMLElement} */ (e.target).closest?.('a[target=_blank]');
            if (a) { e.preventDefault(); opened.push(a.getAttribute('href')); }
        };
        document.addEventListener('click', onClick, true);
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        const files = [new File(['first'], 'one.txt'), new File(['second'], 'two.txt'), new File(['third'], 'three.txt')];
        Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files } });
        v.element.dispatchEvent(drop);
        await sleep(20);
        expect(v.element.querySelector('pre')?.textContent).toBe('first');
        expect(document.getElementById('app-more-text')?.textContent).toBe('2 more files are waiting. Next: two.txt.');
        /** @type {HTMLButtonElement} */ (document.getElementById('app-more-open')).click();
        await sleep(10);
        expect(opened.length).toBe(1);
        document.removeEventListener('click', onClick, true);
        v.destroy();

        const second = load(h.kv, opened[0]);
        await sleep(20);
        expect(second.element.querySelector('pre')?.textContent).toBe('second');
        expect(h.files.size).toBe(0);
        second.destroy();
        window.happyDOM?.setURL('http://localhost/viewer/');
    });

    test('Help shows the help page over the app, rebuilt from text elements only, closed by its button', async () => {
        const pages = { en: readFileSync(fileURLToPath(new URL('../public/help/en.html', import.meta.url)), 'utf8'),
            fr: readFileSync(fileURLToPath(new URL('../public/help/fr.html', import.meta.url)), 'utf8') };
        const asked = [];
        const loadHelp = async (lang) => { asked.push(lang); return lang === 'en' ? pages.en.replace('<main>', '<main><script>globalThis.leak = 1</script><img src="x.png"><p onclick="x()">Hostile <b>bold</b></p>') : pages.fr; };
        const app = load(handoffKv().kv, undefined, loadHelp);
        const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('app-help'));
        const body = /** @type {HTMLElement} */ (document.getElementById('app-help-body'));
        /** @type {HTMLButtonElement} */ (app.element.querySelector('[role=toolbar] [data-action=help]')).click();
        await sleep(10);
        expect(dialog.open).toBe(true);
        expect(asked).toEqual(['en']);
        expect(document.getElementById('app-help-title')?.textContent).toMatch(/^AWA .+ — Help$/);
        // Text elements kept, ids prefixed; scripts, pictures and handlers dropped.
        expect(body.querySelectorAll('h2').length).toBeGreaterThanOrEqual(5);
        expect(body.querySelector('h2')?.id.startsWith('app-help-')).toBe(true);
        expect(body.querySelector('table kbd')?.textContent).toBe('Ctrl');
        expect(body.querySelector('script, img, b, [onclick]')).toBeNull();
        expect(body.textContent).toContain('Hostile bold');
        expect((/** @type {any} */ (globalThis)).leak).toBeUndefined();
        // The contents scroll inside the panel; the page address never changes.
        const link = /** @type {HTMLAnchorElement} */ (body.querySelector('nav a'));
        expect(link.getAttribute('href')?.startsWith('#app-help-')).toBe(true);
        const before = location.href;
        link.click();
        expect(location.href).toBe(before);
        // The language switch rewords the open panel.
        const select = /** @type {HTMLSelectElement} */ (document.getElementById('app-lang'));
        select.value = 'fr';
        select.dispatchEvent(new Event('change'));
        await sleep(10);
        expect(asked).toEqual(['en', 'fr']);
        expect(document.getElementById('app-help-title')?.textContent).toMatch(/— Aide$/);
        expect(document.getElementById('app-help-close')?.getAttribute('aria-label')).toBe('Fermer (Échap)');
        expect(body.querySelector('h2')?.textContent).toBe(/<h2 id="[^"]+">([^<]+)<\/h2>/.exec(pages.fr)?.[1]);
        /** @type {HTMLButtonElement} */ (document.getElementById('app-help-close')).click();
        expect(dialog.open).toBe(false);
        select.value = 'en';
        select.dispatchEvent(new Event('change'));
        app.destroy();
    });

    test('Help that cannot load says so in the panel', async () => {
        const app = load(handoffKv().kv, undefined, async () => { throw new Error('offline'); });
        /** @type {HTMLButtonElement} */ (app.element.querySelector('[role=toolbar] [data-action=help]')).click();
        await sleep(10);
        expect(document.getElementById('app-help-body')?.textContent).toContain('The help could not be loaded.');
        /** @type {HTMLButtonElement} */ (document.getElementById('app-help-close')).click();
        app.destroy();
    });
});
