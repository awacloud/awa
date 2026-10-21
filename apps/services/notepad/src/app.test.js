// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page boots on `public/index.html`: the
 * notepad mounts in `main#notepad`, the shell is translated, the window
 * title follows the document, preferences and drafts are remembered.
 *
 * @module notepad/app.test
 */
import '../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot } from './app.js';

/** Let pending promise chains run (timers in ms). @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
const body = String(/<body>([\s\S]*)<\/body>/.exec(page)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, '');

/**
 * @param {any} [journal] The journal's storage and locks (default: none to recover from).
 * @param {(lang: string) => Promise<string>} [loadHelp]
 */
function load(journal = journalKv().journal, loadHelp = undefined) {
    // Always this page's own address: another test file may leave one with `?open=`.
    window.happyDOM?.setURL('http://localhost/notepad/');
    document.body.innerHTML = body;
    return boot({ journal, loadHelp });
}

/** Map-backed journal stores shared by the "windows" of a test, and their locks. */
function journalKv() {
    const store = () => {
        const map = new Map();
        return {
            get: async (k) => structuredClone(map.get(k)),
            set: async (k, v) => { map.set(k, structuredClone(v)); },
            del: async (k) => { map.delete(k); },
            getAllKeys: async () => [...map.keys()]
        };
    };
    const held = new Set();
    return {
        journal: { sessions: store(), edits: store(), locks: { hold: (n) => held.add(n), held: async () => new Set(held) } },
        closeAll: () => held.clear()
    };
}

describe('boot', () => {
    beforeEach(() => { localStorage.clear(); });

    test('mounts the notepad in the page and titles the window', () => {
        const n = load();
        expect(document.querySelector('#notepad > .awn')).toBe(n.element);
        expect(document.title).toBe('Untitled — AWA Notepad');
        n.restore({ name: 'a.txt', text: 'x', encoding: 'utf-8', eol: 'lf' });
        expect(document.title).toBe('*a.txt — AWA Notepad');
        n.destroy();
    });

    test('the language menu translates the shell and the editor, and is remembered', () => {
        const n = load();
        const select = /** @type {HTMLSelectElement} */ (document.getElementById('app-lang'));
        select.value = 'fr';
        select.dispatchEvent(new Event('change'));
        expect(document.documentElement.lang).toBe('fr');
        expect(document.querySelector('.app-wordmark')?.textContent).toBe('AWA Notepad');
        expect(n.element.getAttribute('lang')).toBe('fr');
        n.destroy();
        const again = load();
        expect(again.element.getAttribute('lang')).toBe('fr');
        again.destroy();
    });

    test('the update banner starts hidden; Later hides it; both strings translate', () => {
        const n = load();
        const banner = /** @type {HTMLElement} */ (document.getElementById('app-update'));
        expect(banner.hidden).toBe(true);
        expect(banner.getAttribute('role')).toBe('status');
        banner.hidden = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('app-update-later')).click();
        expect(banner.hidden).toBe(true);
        const select = /** @type {HTMLSelectElement} */ (document.getElementById('app-lang'));
        select.value = 'fr';
        select.dispatchEvent(new Event('change'));
        expect(document.getElementById('app-update-apply')?.textContent).toBe('Mettre à jour');
        expect(banner.querySelector('p')?.textContent).toContain('brouillon');
        n.destroy();
    });

    test('word wrap is remembered, and unsaved text comes back from the journal', async () => {
        const kv = journalKv();
        const n = load(kv.journal);
        /** @type {HTMLButtonElement} */ (n.element.querySelector('[data-action=wrap]')).click();
        const t = /** @type {HTMLTextAreaElement} */ (n.element.querySelector('textarea'));
        t.value = 'kept';
        t.dispatchEvent(new Event('input'));
        window.dispatchEvent(new Event('pagehide'));   // the journal writes now
        await sleep(10);
        n.destroy();
        kv.closeAll();                                 // the window went away
        const again = load(kv.journal);
        await sleep(10);
        expect(again.status.wrap).toBe(false);
        expect(again.text).toBe('kept');
        expect(again.status.dirty).toBe(true);
        again.destroy();
    });

    test('a live window keeps its unsaved text: a second window does not take it', async () => {
        const kv = journalKv();
        const first = load(kv.journal);
        const t = /** @type {HTMLTextAreaElement} */ (first.element.querySelector('textarea'));
        t.value = 'mine';
        t.dispatchEvent(new Event('input'));
        window.dispatchEvent(new Event('pagehide'));
        await sleep(10);
        const second = load(kv.journal);
        await sleep(10);
        expect(second.text).toBe('');
        expect(second.status.dirty).toBe(false);
        first.destroy();
        second.destroy();
    });

    test('three files dropped: the first opens here, the others wait and open one per click in a new window', async () => {
        const files = new Map();
        const handoffKv = { store: {
            get: async (k) => files.get(k), set: async (k, v) => { files.set(k, v); },
            del: async (k) => { files.delete(k); }, getAllKeys: async () => [...files.keys()]
        } };
        window.happyDOM?.setURL('http://localhost/notepad/');
        document.body.innerHTML = body;
        const n = boot({ journal: journalKv().journal, handoff: handoffKv });
        const opened = [];
        const onClick = (e) => {
            const a = /** @type {HTMLElement} */ (e.target).closest?.('a[target=_blank]');
            if (a) { e.preventDefault(); opened.push(a.getAttribute('href')); }
        };
        document.addEventListener('click', onClick, true);
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        const dropped = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt'), new File(['three'], 'three.txt')];
        Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: dropped } });
        n.element.dispatchEvent(drop);
        await sleep(10);
        expect(n.text).toBe('one');
        const line = /** @type {HTMLElement} */ (document.getElementById('app-more'));
        expect(line.hidden).toBe(false);
        expect(document.getElementById('app-more-text')?.textContent).toBe('2 more files are waiting. Next: two.txt.');
        /** @type {HTMLButtonElement} */ (document.getElementById('app-more-open')).click();
        await sleep(10);
        expect(opened.length).toBe(1);
        expect(opened[0]).toMatch(/\/notepad\/\?open=[0-9a-z]+$/);
        expect(document.getElementById('app-more-text')?.textContent).toBe('One more file is waiting: three.txt.');
        n.destroy();
        document.removeEventListener('click', onClick, true);

        // The new window takes the file over (and recovery leaves it alone).
        window.happyDOM?.setURL(opened[0]);
        document.body.innerHTML = body;
        const second = boot({ journal: journalKv().journal, handoff: handoffKv });
        await sleep(10);
        expect(second.text).toBe('two');
        expect(second.status.name).toBe('two.txt');
        expect(files.size).toBe(0);
        second.destroy();
        window.happyDOM?.setURL('http://localhost/notepad/');
    });

    test('the draft of an older version comes back once, then is dropped', async () => {
        localStorage.setItem('awa-notepad.draft', JSON.stringify({ name: 'old.txt', text: 'from before', encoding: 'utf-8', eol: 'lf' }));
        const n = load(journalKv().journal);
        await sleep(10);
        expect(n.text).toBe('from before');
        expect(n.status.dirty).toBe(true);
        expect(localStorage.getItem('awa-notepad.draft')).toBe(null);
        n.destroy();
    });

    test('Help shows the help page over the app, rebuilt from text elements only, closed by its button', async () => {
        const pages = { en: readFileSync(fileURLToPath(new URL('../public/help/en.html', import.meta.url)), 'utf8'),
            fr: readFileSync(fileURLToPath(new URL('../public/help/fr.html', import.meta.url)), 'utf8') };
        const asked = [];
        const loadHelp = async (lang) => { asked.push(lang); return lang === 'en' ? pages.en.replace('<main>', '<main><script>globalThis.leak = 1</script><img src="x.png"><p onclick="x()">Hostile <b>bold</b></p>') : pages.fr; };
        const app = load(undefined, loadHelp);
        const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('app-help'));
        const body = /** @type {HTMLElement} */ (document.getElementById('app-help-body'));
        /** @type {HTMLButtonElement} */ (app.element.querySelector('.awn-bar [data-action=help]')).click();
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
        const app = load(undefined, async () => { throw new Error('offline'); });
        /** @type {HTMLButtonElement} */ (app.element.querySelector('.awn-bar [data-action=help]')).click();
        await sleep(10);
        expect(document.getElementById('app-help-body')?.textContent).toContain('The help could not be loaded.');
        /** @type {HTMLButtonElement} */ (document.getElementById('app-help-close')).click();
        app.destroy();
    });
});
