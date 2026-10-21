// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standalone page (`public/index.html`): mount the notepad in
 * `main#notepad`, translate the page shell, wire the language menu, the
 * PWA adapter and the About panel, and own what is page-level — the window
 * title, the "leave with unsaved changes?" guard, the remembered
 * preferences and the recovery journal that brings unsaved text back after
 * the window was closed, crashed or reloaded for an update. Everything the
 * editor itself does lives in `notepad.js`.
 *
 * @module notepad/app
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { serviceWorker } from '@awacloud/fw/dom/sw/serviceWorker.js';
import { storage } from '@awacloud/fw/dom/fs/storage.js';
import { indexedDB } from '@awacloud/fw/dom/fs/indexedDB.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { mountNotepad } from './notepad.js';
import { createTranslator, negotiateLocale } from './core/i18n.js';
import { createJournal } from './core/journal.js';
import { mountPwa } from './core/pwa.js';
import { mountAbout } from './core/about.js';
import { mountHelp } from './core/help.js';
import { createHandoff, PARAM } from './core/handoff.js';
import { mountMore } from './core/more.js';

const LOCALE_KEY = 'awa-notepad.locale';
const PREFS_KEY = 'awa-notepad.prefs';
/** Where versions before the journal kept their one draft: read once, then dropped. */
const LEGACY_DRAFT_KEY = 'awa-notepad.draft';
const JOURNAL_DB = 'awa-notepad-journal';
const HANDOFF_DB = 'awa-notepad-handoff';

/**
 * The journal's storage: two stores of one IndexedDB database, opened on
 * first use; without IndexedDB, stores that keep nothing (the page works,
 * nothing is recovered).
 * @param {ModuleRuntime} runtime
 * @param {Window & typeof globalThis} win
 */
function journalStores(runtime, win) {
    const open = opener(runtime, win, JOURNAL_DB, ['sessions', 'edits']);
    /** @param {string} name */
    const store = (name) => ({
        get: async (/** @type {string} */ k) => (await open())?.store(name).get(k),
        set: async (/** @type {string} */ k, /** @type {any} */ v) => (await open())?.store(name).set(k, v),
        del: async (/** @type {string} */ k) => { await (await open())?.store(name).del(k); },
        getAllKeys: async () => /** @type {string[]} */ (((await open())?.store(name).getAllKeys()) ?? [])
    });
    return { sessions: store('sessions'), edits: store('edits') };
}

/**
 * Open an IndexedDB database on first use (`null` without IndexedDB, or
 * when it cannot open).
 * @param {ModuleRuntime} runtime
 * @param {Window & typeof globalThis} win
 * @param {string} name
 * @param {string[]} stores
 * @returns {() => Promise<any>}
 */
function opener(runtime, win, name, stores) {
    /** @type {Promise<any>|null} */
    let db = null;
    return () => (db ||= win.indexedDB
        ? runtime.resolve('indexedDB').open(name, 1, (/** @type {IDBDatabase} */ d) => {
            for (const s of stores) d.createObjectStore(s);
        }, { crossTab: false }).catch(() => null)
        : Promise.resolve(null));
}

/**
 * The handoff's store (one window per file, by design).
 * @param {ModuleRuntime} runtime
 * @param {Window & typeof globalThis} win
 */
function handoffStore(runtime, win) {
    const open = opener(runtime, win, HANDOFF_DB, ['files']);
    return {
        get: async (/** @type {string} */ k) => (await open())?.store('files').get(k),
        set: async (/** @type {string} */ k, /** @type {any} */ v) => (await open())?.store('files').set(k, v),
        del: async (/** @type {string} */ k) => { await (await open())?.store('files').del(k); },
        getAllKeys: async () => /** @type {string[]} */ (((await open())?.store('files').getAllKeys()) ?? [])
    };
}

/**
 * Web Locks, when the browser has them: a window holds its session's lock
 * until it goes away.
 * @param {Window & typeof globalThis} win
 */
function webLocks(win) {
    const locks = /** @type {any} */ (win.navigator).locks;
    if (!locks || typeof locks.request !== 'function') return null;
    return {
        hold: (/** @type {string} */ name) => { void locks.request(name, () => new Promise(() => {})); },
        held: async () => new Set(((await locks.query()).held || []).map((/** @type {{name: string}} */ l) => l.name))
    };
}

/**
 * Boot the standalone page.
 * @param {{doc?: Document, win?: Window & typeof globalThis,
 *   journal?: Parameters<typeof createJournal>[0],
 *   handoff?: Parameters<typeof createHandoff>[0],
 *   loadHelp?: (lang: string) => Promise<string>}} [opts] `journal`, `handoff`:
 *   their storage (tests), default IndexedDB and Web Locks; `loadHelp`: a help
 *   page's HTML (tests), default fetched next to the page.
 */
export function boot({ doc = document, win = window, journal: journalKv, handoff: handoffKv, loadHelp } = {}) {
    const runtime = new ModuleRuntime();
    runtime.registerAllDeep([serviceWorker, storage, indexedDB, i18n]);
    const local = runtime.resolve('storage').local;
    /** @param {string} key */
    const load = (key) => { try { return local ? local.get(key) : null; } catch { return null; } };
    /** @param {string} key @param {unknown} value */
    const keep = (key, value) => {
        try {
            if (!local) return;
            if (value === null) local.del(key); else local.set(key, value);
        } catch { /* storage blocked or full: the page works without it */ }
    };

    const locale = negotiateLocale(load(LOCALE_KEY), navigator.languages);
    const prefs = load(PREFS_KEY) || {};
    const tr = createTranslator(runtime, locale);
    // Help: the help page of the reader's language, over the app (core/help.js).
    const help = mountHelp({ doc, t: (k, p) => tr.t(k, p), locale: () => tr.locale, load: loadHelp });
    const journal = createJournal(journalKv || { ...journalStores(runtime, win), locks: webLocks(win) });
    const handoff = createHandoff(handoffKv || { store: handoffStore(runtime, win) });
    const more = mountMore({ doc, t: (k, p) => tr.t(k, p), tn: (k, n, p) => tr.tn(k, n, p), number: (v) => tr.number(v), handoff });
    /** A file arrived for this window (handed over, launched): recovery leaves it alone. */
    let arrived = false;

    /** The window title: Notepad's `*name`, then the app. */
    function title() {
        doc.title = `${notepad.status.dirty ? '*' : ''}${notepad.status.name} — ${tr.t('app.title')}`;
    }

    const host = /** @type {HTMLElement} */ (doc.getElementById('notepad'));
    const notepad = mountNotepad(host, {
        runtime, locale,
        wrap: typeof prefs.wrap === 'boolean' ? prefs.wrap : true,
        zoom: typeof prefs.zoom === 'number' ? prefs.zoom : 1,
        onChange() {
            title();
            if (!notepad.status.dirty) journal.clean();
        },
        onEdit: (edit) => journal.edit(edit),
        onMore: (items) => more.add(items),
        onHelp: () => { void help.open(); },
        onLoad: (base) => journal.base(base),
        onPrefs: (p) => keep(PREFS_KEY, p)
    });
    journal.base({ ...notepad.snapshot(), handle: null, dirty: false });

    // A window opened for one of several files: take it over and open it.
    const token = new URLSearchParams(win.location.search).get(PARAM);
    if (token) {
        arrived = true;
        void handoff.take(token).then(async (item) => {
            if (!item) return;
            const file = item.file || (item.handle ? await item.handle.getFile() : null);
            if (file) await notepad.open(/** @type {File} */ (file), item.handle || null);
        }).catch(() => { /* nothing handed */ });
    }

    // Unsaved text from a window that went away comes back here, still
    // unsaved — unless this window already has unsaved text of its own, or
    // was opened for a file.
    void journal.start().then(async (orphans) => {
        if (notepad.status.dirty || arrived) return;
        if (orphans.length) {
            notepad.restore(await journal.adopt(orphans[0]));
            return;
        }
        const legacy = load(LEGACY_DRAFT_KEY);
        if (legacy && typeof legacy === 'object' && typeof legacy.text === 'string') notepad.restore(legacy);
        keep(LEGACY_DRAFT_KEY, null);
    }).catch(() => { /* nothing to recover */ });

    /** Translate the page shell (`[data-i18n]`) and the document language. */
    function translatePage() {
        doc.documentElement.lang = tr.locale;
        for (const el of doc.querySelectorAll('[data-i18n]')) {
            el.textContent = tr.t(/** @type {HTMLElement} */ (el).dataset.i18n || '');
        }
        title();
        more.label();
    }

    const select = /** @type {HTMLSelectElement} */ (doc.getElementById('app-lang'));
    select.value = tr.locale;
    select.addEventListener('change', () => {
        tr.setLocale(select.value);
        notepad.setLocale(select.value);
        keep(LOCALE_KEY, select.value);
        translatePage();
        about.label();
        help.label();
    });
    translatePage();

    // Leaving: the journal writes what waits; with unsaved changes the
    // browser asks (its own words) — except for an accepted update, whose
    // reload brings the text back from the journal.
    let updating = false;
    win.addEventListener('beforeunload', (e) => {
        void journal.flush();
        if (updating || !notepad.status.dirty) return;
        e.preventDefault();
        e.returnValue = '';
    });
    win.addEventListener('pagehide', () => { void journal.flush(); });
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') void journal.flush(); });

    const banner = /** @type {HTMLElement} */ (doc.getElementById('app-update'));
    const pwa = mountPwa({
        serviceWorker: runtime.resolve('serviceWorker'),
        // The worker sits next to the page, in development (public/) as in a dist.
        swUrl: new URL('sw.js', doc.baseURI).href,
        installButton: /** @type {HTMLButtonElement} */ (doc.getElementById('app-install')),
        offlineNote: doc.getElementById('app-offline'),
        onFile: (file, handle) => { arrived = true; void notepad.open(file, handle); },
        onMore: (handles) => more.add(handles.map((h) => ({ handle: h }))),
        // A new release waits: the writer decides when it takes over.
        onUpdateReady: () => { banner.hidden = false; },
        win
    });
    doc.getElementById('app-update-apply')?.addEventListener('click', async () => {
        // Keep the unsaved text first: the reload brings it back from the journal.
        await journal.flush();
        updating = (await pwa).applyUpdate();
    });
    doc.getElementById('app-update-later')?.addEventListener('click', () => { banner.hidden = true; });
    // About: legal notices, release, Check for updates (it shows the banner when one waits).
    const about = mountAbout({ doc, t: (k, p) => tr.t(k, p), pwa, onReady: () => { banner.hidden = false; } });
    return notepad;
}
