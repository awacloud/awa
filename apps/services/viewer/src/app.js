// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standalone page (`public/index.html`): mount the viewer in
 * `main#viewer`, translate the page shell, wire the language menu, the PWA
 * adapter, the About panel and the "more files" line (one window per file:
 * files chosen together beyond the first open, one per click, in new
 * windows, handed over through IndexedDB). Everything the viewer itself
 * does lives in `viewer.js`; this file only owns what is page-level.
 *
 * @module viewer/app
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { serviceWorker } from '@awacloud/fw/dom/sw/serviceWorker.js';
import { storage } from '@awacloud/fw/dom/fs/storage.js';
import { indexedDB } from '@awacloud/fw/dom/fs/indexedDB.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { mountViewer } from './viewer.js';
import { createTranslator, negotiateLocale } from './core/i18n.js';
import { mountPwa } from './core/pwa.js';
import { mountAbout } from './core/about.js';
import { mountHelp } from './core/help.js';
import { createHandoff, PARAM } from './core/handoff.js';
import { mountMore } from './core/more.js';

const LOCALE_KEY = 'awa-viewer.locale';
/**
 * The showcase samples next to the page (`public/samples/{en,fr}/`, built by
 * `tools/build-samples.js`, whose `SAMPLES` a guard test keeps equal to this
 * list): one per format, each presenting one of our licences.
 */
export const SAMPLES = Object.freeze([
    { file: 'awa-pdf.pdf', label: 'PDF' },
    { file: 'awa-office.docx', label: 'Word' },
    { file: 'awa-convert.odt', label: 'OpenDocument' },
    { file: 'offers.xlsx', label: 'Excel' },
    { file: 'offers.pptx', label: 'PowerPoint' },
    { file: 'awa-markdown.md', label: 'Markdown' }
]);
const HANDOFF_DB = 'awa-viewer-handoff';

/**
 * The handoff's store: one IndexedDB store, opened on first use; without
 * IndexedDB, a store that keeps nothing (the extra files cannot be passed).
 * @param {ModuleRuntime} runtime
 * @param {Window & typeof globalThis} win
 */
function handoffStore(runtime, win) {
    /** @type {Promise<any>|null} */
    let db = null;
    const open = () => (db ||= win.indexedDB
        ? runtime.resolve('indexedDB').open(HANDOFF_DB, 1, (/** @type {IDBDatabase} */ d) => {
            d.createObjectStore('files');
        }, { crossTab: false }).catch(() => null)
        : Promise.resolve(null));
    return {
        get: async (/** @type {string} */ k) => (await open())?.store('files').get(k),
        set: async (/** @type {string} */ k, /** @type {any} */ v) => (await open())?.store('files').set(k, v),
        del: async (/** @type {string} */ k) => { await (await open())?.store('files').del(k); },
        getAllKeys: async () => /** @type {string[]} */ (((await open())?.store('files').getAllKeys()) ?? [])
    };
}

/**
 * Boot the standalone page.
 * @param {{doc?: Document, win?: Window & typeof globalThis,
 *   handoff?: Parameters<typeof createHandoff>[0],
 *   loadHelp?: (lang: string) => Promise<string>}} [opts] `handoff`: its
 *   store (tests), default IndexedDB; `loadHelp`: a help page's HTML (tests),
 *   default fetched next to the page.
 */
export function boot({ doc = document, win = window, handoff: handoffKv, loadHelp } = {}) {
    const runtime = new ModuleRuntime();
    // The page translates before the viewer mounts (the more-files line): it registers i18n itself.
    runtime.registerAllDeep([serviceWorker, storage, indexedDB, i18n]);
    const local = runtime.resolve('storage').local;
    let saved = null;
    try { saved = local ? local.get(LOCALE_KEY) : null; } catch { /* storage blocked */ }
    const locale = negotiateLocale(saved, navigator.languages);
    const tr = createTranslator(runtime, locale);
    // Help: the help page of the reader's language, over the app (core/help.js).
    const help = mountHelp({ doc, t: (k, p) => tr.t(k, p), locale: () => tr.locale, load: loadHelp });
    const handoff = createHandoff(handoffKv || { store: handoffStore(runtime, win) });
    const more = mountMore({ doc, t: (k, p) => tr.t(k, p), tn: (k, n, p) => tr.tn(k, n, p), number: (v) => tr.number(v), handoff });

    const host = /** @type {HTMLElement} */ (doc.getElementById('viewer'));
    // Samples load from this site, in the reader's language (the viewer itself fetches nothing).
    const samples = SAMPLES.map((s) => ({
        label: s.label,
        load: async () => {
            const lang = tr.locale === 'fr' ? 'fr' : 'en';
            const response = await fetch(new URL(`samples/${lang}/${s.file}`, doc.baseURI));
            if (!response.ok) throw new Error(`sample ${s.file}: HTTP ${response.status}`);
            return new File([await response.blob()], s.file);
        }
    }));
    const viewer = mountViewer(host, {
        runtime, locale, samples,
        onMore: (files) => more.add(files.map((file) => ({ file }))),
        onHelp: () => { void help.open(); }
    });

    // A window opened for one of several files: take it over and open it.
    const token = new URLSearchParams(win.location.search).get(PARAM);
    if (token) {
        void handoff.take(token).then(async (item) => {
            if (!item) return;
            const file = item.file || (item.handle ? await item.handle.getFile() : null);
            if (file) await viewer.open(file);
        }).catch(() => { /* nothing handed */ });
    }

    /** Translate the page shell (`[data-i18n]`) and the document language. */
    function translatePage() {
        doc.documentElement.lang = tr.locale;
        for (const el of doc.querySelectorAll('[data-i18n]')) {
            el.textContent = tr.t(/** @type {HTMLElement} */ (el).dataset.i18n || '');
        }
        doc.title = tr.t('app.title');
        more.label();
    }

    const select = /** @type {HTMLSelectElement} */ (doc.getElementById('app-lang'));
    select.value = tr.locale;
    select.addEventListener('change', () => {
        tr.setLocale(select.value);
        viewer.setLocale(select.value);
        try { if (local) local.set(LOCALE_KEY, select.value); } catch { /* storage blocked */ }
        translatePage();
        about.label();
        help.label();
    });
    translatePage();

    const banner = /** @type {HTMLElement} */ (doc.getElementById('app-update'));
    const pwa = mountPwa({
        serviceWorker: runtime.resolve('serviceWorker'),
        // The worker sits next to the page, in development (public/) as in a dist.
        swUrl: new URL('sw.js', doc.baseURI).href,
        installButton: /** @type {HTMLButtonElement} */ (doc.getElementById('app-install')),
        offlineNote: doc.getElementById('app-offline'),
        onFile: (file) => { void viewer.open(file); },
        onMore: (handles) => more.add(handles.map((handle) => ({ handle }))),
        // A new release waits: the reader decides when it takes over.
        onUpdateReady: () => { banner.hidden = false; },
        win
    });
    doc.getElementById('app-update-apply')?.addEventListener('click', async () => {
        (await pwa).applyUpdate();
    });
    doc.getElementById('app-update-later')?.addEventListener('click', () => { banner.hidden = true; });
    // About: legal notices, release, Check for updates (it shows the banner when one waits).
    const about = mountAbout({ doc, t: (k, p) => tr.t(k, p), pwa, onReady: () => { banner.hidden = false; } });
    return viewer;
}
