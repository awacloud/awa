// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mountViewer(root, opts)` — the viewer's public API: mount
 * a document viewer inside any element, standalone or in a host page.
 *
 * ```js
 * import { mountViewer } from '@awacloud/viewer';
 * const viewer = mountViewer(document.querySelector('#doc'), { locale: 'fr' });
 * await viewer.open(file);   // File | Blob | {name, bytes}
 * viewer.destroy();
 * ```
 *
 * The viewer stays inside its root: it owns no route, never touches
 * `location` / `history`, binds its keys on its own element, and
 * `destroy()` removes everything it added. Nothing it reads leaves the
 * device.
 *
 * @module viewer
 */
import { createViewerRuntime } from './core/runtime.js';
import { createTranslator, negotiateLocale } from './core/i18n.js';
import { detect } from './core/detect.js';
import { render, canRender } from './render/index.js';
import { h } from './render/dom.js';
import { createStage, stepZoom } from './ui/stage.js';
import { createToolbar } from './ui/toolbar.js';
import { createIntake } from './ui/intake.js';
import { createInfo } from './ui/info.js';

export { detect } from './core/detect.js';
export { negotiateLocale, LOCALES } from './core/i18n.js';

/**
 * @typedef {object} ViewerOptions
 * @property {string} [locale] UI locale (`en`, `fr`); defaults to the host's
 *   `lang`, then the browser's languages.
 * @property {number} [headingOffset=1] How many levels a document's headings
 *   move down (1: a document `h1` becomes an `h2` under the page's `h1`).
 * @property {import('@awacloud/fw/core/runtime.js').ModuleRuntime} [runtime]
 *   An fw runtime to register on (a host that already runs fw).
 * @property {(e: {name: string, format: string}) => void} [onOpen]
 * @property {(e: {name: string, code: string, message: string}) => void} [onError]
 * @property {() => void} [onClose]
 * @property {() => void} [onHelp] Show a Help button; the host opens its help.
 * @property {{label: string, load: () => Promise<File>}[]} [samples] Documents
 *   to try, offered under the dropzone; the host loads them (the viewer
 *   itself fetches nothing). The details panel says a sample is one.
 * @property {(files: File[]) => void} [onMore] Files chosen or dropped
 *   together beyond the first (which the viewer opens): the standalone page
 *   offers each in a new window. Without it the viewer opens the first and
 *   says how many it left.
 */

/**
 * @typedef {object} Viewer
 * @property {(source: File|Blob|{name: string, bytes: Uint8Array|ArrayBuffer}) => Promise<boolean>} open
 *   Open a document; resolves `true` once shown, `false` on a handled error.
 * @property {() => void} close
 * @property {(name: string, code: string) => void} showSourceError
 * @property {(locale: string) => void} setLocale
 * @property {() => void} destroy
 * @property {HTMLElement} element The viewer's own region element.
 * @property {{readonly state: string, readonly format: string|null,
 *   readonly page: number, readonly count: number, readonly zoom: number}} status
 */

/**
 * A fresh element id prefix: random, so two viewers never collide — even
 * one mounted on a root not yet in the document.
 */
function freshId() {
    for (;;) {
        const n = globalThis.crypto?.getRandomValues
            ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
            : Date.now() % 4294967296;
        const id = `awv-${n.toString(36)}`;
        if (!document.getElementById(id)) return id;
    }
}

/**
 * Read any accepted source as bytes.
 * @param {File|Blob|{name: string, bytes: Uint8Array|ArrayBuffer}} source
 * @returns {Promise<{name: string, bytes: Uint8Array, type: string}>}
 */
async function readSource(source) {
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const name = /** @type {File} */ (source).name || 'document';
        return { name, bytes: new Uint8Array(await source.arrayBuffer()), type: source.type || '' };
    }
    const s = /** @type {{name: string, bytes: Uint8Array|ArrayBuffer}} */ (source);
    const bytes = s.bytes instanceof Uint8Array ? s.bytes : new Uint8Array(s.bytes);
    return { name: s.name || 'document', bytes, type: '' };
}

/**
 * The last segment of a package error code that refuses a document for
 * its size or its nesting, not for damage: `opc/xml-too-deep`,
 * `opc/zip-bomb`, `odf/parse-error/limit`, `md/limit-exceeded`,
 * `xlsx/limit-exceeded`, `pdf/flate/output-limit`,
 * `pdf/parser/depth-exceeded`, `pdf/pages/too-many`, `fonts/composite-depth`…
 */
/** Documents over this size are refused before they are read (a tab would not survive them). */
export const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;

const LIMIT = /\/(?:xml-too-deep|zip-bomb|limit|limit-exceeded|output-limit|depth-exceeded|max-depth|too-many|array-too-long|composite-depth)$/;

/**
 * Map a painter / engine failure to a catalog error key and a short code.
 * @param {unknown} err
 * @returns {{key: string, code: string}}
 */
function classify(err) {
    const e = /** @type {{code?: string, message?: string}} */ (err || {});
    const code = String(e.code || '');
    const text = `${code} ${e.message || ''}`.toLowerCase();
    if (code === 'pdf/encrypted-unsupported') return { key: 'error.encryptedUnsupported', code: 'E_ENCRYPTION_UNSUPPORTED' };
    if (/encrypt|password/.test(text)) return { key: 'error.encrypted', code: 'E_ENCRYPTED' };
    if (LIMIT.test(code)) return { key: 'error.tooLarge', code };
    return { key: 'error.read', code: code || 'E_READ' };
}

/**
 * Mount a document viewer inside `root`.
 *
 * @param {HTMLElement} root The host element; the viewer appends its region inside.
 * @param {ViewerOptions} [opts]
 * @returns {Viewer}
 */
export function mountViewer(root, opts = {}) {
    const rt = createViewerRuntime({ runtime: opts.runtime });
    const id = freshId();
    const locale = negotiateLocale(
        opts.locale, root.closest('[lang]')?.getAttribute('lang'),
        document.documentElement.lang, typeof navigator !== 'undefined' ? navigator.languages : []);
    const tr = createTranslator(rt.runtime, locale);
    const { t, tn, number } = tr;
    const a11y = rt.resolve('a11y');
    const fullscreen = rt.resolve('fullscreen');
    const download = rt.resolve('download');
    const headingOffset = opts.headingOffset ?? 1;

    /** @type {{state: 'empty'|'loading'|'ready'|'error', format: string|null,
     *   file: {name: string, bytes: Uint8Array, type: string}|null, page: number, count: number,
     *   paged: boolean, isFullscreen: boolean, token: number}} */
    const st = { state: 'empty', format: null, file: null, page: 0, count: 0, paged: false, isFullscreen: false, token: 0 };

    // ── DOM ────────────────────────────────────────────────────────────
    const region = h('section', { class: 'awv', id, lang: locale, role: 'region', 'data-state': 'empty', 'data-dragover': 'false' });
    const scroller = h('div', { class: 'awv-stage', id: `${id}-stage`, tabindex: '0', role: 'document' });
    const content = h('div', { class: 'awv-content' });
    // Announced through `a11y.announce`; no live role here (it would speak twice).
    const progress = h('p', { class: 'awv-progress', hidden: true });
    const tabsHost = h('div', { class: 'awv-tabbar', hidden: true });
    scroller.append(progress, content);

    const stage = createStage({
        scroller, t,
        onPage(page, count) { st.page = page; st.count = count; sync(); },
        onDrawError(err) {
            if (infoOpen) info.label();
            host('onError', { name: st.file?.name || '', ...describe(err) });
        },
        // Paged views count omissions as pages draw: keep an open panel current.
        onDrawn() { if (infoOpen) info.label(); }
    });
    const toolbar = createToolbar({
        id, t, number, help: typeof opts.onHelp === 'function',
        onAction: act,
        onPage: (p) => {
            if (p === stage.page) { sync(); return; }   // Enter then change: once
            stage.go(p);
            announcePage();
        },
        onZoom: (z) => zoomTo(z === 'fit' ? stage.fitWidthZoom() : z)
    });
    toolbar.element.setAttribute('aria-controls', scroller.id);
    const samples = opts.samples || [];
    const intake = createIntake({
        id, root: region, t, onFiles: (files) => { void openMany(files); },
        samples, onSample: (i) => { void openSample(samples[i]); }
    });
    const info = createInfo({ id, t, tn, number });
    let infoOpen = false;
    const body = h('div', { class: 'awv-body' }, [scroller, info.element]);
    region.append(toolbar.element, body, tabsHost, intake.input);
    root.append(region);

    // ── keys (scoped to the region) ────────────────────────────────────
    const keys = rt.resolve('keybindings').create({ target: region });
    /** True when typing in a field: page keys belong to it. */
    const typing = (/** @type {Event} */ e) => {
        const el = /** @type {HTMLElement} */ (e.target);
        return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement || el.isContentEditable;
    };
    /**
     * Page keys act on paged views only; in a flowing document or a sheet
     * they keep scrolling natively (so they never `preventDefault` there).
     * @param {() => void} fn
     */
    const pageKey = (fn) => (/** @type {KeyboardEvent} */ e) => {
        if (typing(e) || st.state !== 'ready' || !st.paged || st.count < 2) return;
        e.preventDefault();
        fn();
    };
    const noDefault = { preventDefault: false };
    keys.bind('PageDown', pageKey(() => goRelative(1)), noDefault);
    keys.bind('PageUp', pageKey(() => goRelative(-1)), noDefault);
    keys.bind('Ctrl+Home', pageKey(() => goTo(0)), noDefault);
    keys.bind('Ctrl+End', pageKey(() => goTo(st.count - 1)), noDefault);
    keys.bind('Ctrl+o', () => intake.pick());
    keys.attach();
    // fw keybindings parses letters, digits and named keys only: the zoom
    // keys (`+`, `-`, `=`, `0`) are read here, with the same "not while typing"
    // rule. With Ctrl / Meta they stay the browser's own page zoom.
    /** @param {KeyboardEvent} e */
    function zoomKeys(e) {
        if (typing(e) || e.altKey || e.ctrlKey || e.metaKey || st.state !== 'ready') return;
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(stepZoom(stage.zoom, 1)); }
        else if (e.key === '-') { e.preventDefault(); zoomTo(stepZoom(stage.zoom, -1)); }
        else if (e.key === '0') { e.preventDefault(); zoomTo(1); }
    }
    region.addEventListener('keydown', zoomKeys);
    /** Ctrl + wheel zooms the document, not the page. @param {WheelEvent} e */
    function wheelZoom(e) {
        if (!e.ctrlKey || st.state !== 'ready') return;
        e.preventDefault();
        zoomTo(stepZoom(stage.zoom, e.deltaY < 0 ? 1 : -1));
    }
    scroller.addEventListener('wheel', wheelZoom, { passive: false });
    /**
     * In-document links (`#…`: footnotes, bookmarks) scroll inside the viewer;
     * they never change the host page's `location.hash`.
     * @param {MouseEvent} e
     */
    function anchorClick(e) {
        const a = /** @type {HTMLElement} */ (e.target).closest?.('a[href^="#"]');
        if (!a || !content.contains(a)) return;
        e.preventDefault();
        const raw = (a.getAttribute('href') || '').slice(1);
        let key = raw;
        try { key = decodeURIComponent(raw); } catch { /* a malformed escape: the id as written */ }
        // Looked up inside the document only: the host page may use the same id.
        const target = [...content.querySelectorAll('[id]')].find((el) => el.id === key);
        if (target) target.scrollIntoView({ block: 'start' });
    }
    content.addEventListener('click', anchorClick);

    fullscreen.listen.add(id, (active) => {
        st.isFullscreen = active && document.fullscreenElement === region;
        sync();
    });

    // ── state → DOM ────────────────────────────────────────────────────
    function sync() {
        region.dataset.state = st.state;
        region.setAttribute('aria-label', st.file ? t('app.regionWith', { name: st.file.name }) : t('app.region'));
        scroller.setAttribute('aria-label', t('view.content'));
        // A tab stop for keyboard scrolling once there is a document; before,
        // it would only stand in front of the dropzone.
        scroller.tabIndex = st.state === 'ready' ? 0 : -1;
        toolbar.update({
            loaded: st.state === 'ready', paged: st.paged, page: st.page, count: st.count,
            zoom: stage.zoom, fullscreen: st.isFullscreen, info: infoOpen,
            fullscreenAvailable: fullscreen.isSupported()
        });
        info.element.hidden = !(infoOpen && st.state === 'ready');
    }

    function label() {
        toolbar.label();
        intake.label();
        info.label();
        sync();
    }

    /** @param {unknown} err */
    function describe(err) {
        const c = classify(err);
        return { code: c.code, message: t(c.key, { format: t(`format.${st.format || 'unknown'}`) }) };
    }

    /**
     * @param {string} message
     * @param {string} code
     */
    function showError(message, code) {
        st.state = 'error';
        progress.hidden = true;
        const retry = h('button', { type: 'button', class: 'awv-btn awv-btn--primary', text: t('error.tryAnother') });
        retry.addEventListener('click', () => intake.pick());
        const alert = h('div', { class: 'awv-alert', role: 'alert', tabindex: '-1' }, [
            h('p', { text: message }), h('small', { text: code }), retry
        ]);
        content.replaceChildren(alert);
        sync();
        keepFocus(alert);
        host('onError', { name: st.file?.name || '', code, message });
    }

    function showIntake() {
        content.replaceChildren(intake.element);
    }

    /**
     * Replacing the stage content drops the focus to `body` when it was on
     * the dropzone: bring it back inside the viewer, so its keys keep working.
     * @param {HTMLElement} target
     */
    function keepFocus(target) {
        const active = document.activeElement;
        if (!active || active === document.body || content.contains(active)) target.focus({ preventScroll: true });
    }

    function announcePage() {
        if (st.count > 1) a11y.announce(t('status.page', { page: st.page + 1, count: st.count }));
    }

    // ── actions ────────────────────────────────────────────────────────
    /** @param {number} i */
    function goTo(i) {
        if (st.state !== 'ready') return;
        stage.go(i);
        announcePage();
    }
    /** @param {number} d */
    function goRelative(d) { goTo(stage.page + d); }

    /** @param {number} z */
    function zoomTo(z) {
        if (st.state !== 'ready') return;
        stage.setZoom(z);
        sync();
        a11y.announce(t('status.zoom', { zoom: number(stage.zoom, { style: 'percent', maximumFractionDigits: 0 }) }));
    }

    /** @param {import('./ui/toolbar.js').Action} action */
    function act(action) {
        switch (action) {
            case 'open': intake.pick(); break;
            case 'close': close(); break;
            case 'prev': goRelative(-1); break;
            case 'next': goRelative(1); break;
            case 'zoomOut': zoomTo(stepZoom(stage.zoom, -1)); break;
            case 'zoomIn': zoomTo(stepZoom(stage.zoom, 1)); break;
            case 'fitWidth': zoomTo(stage.fitWidthZoom()); break;
            case 'fullscreen': void fullscreen.toggle(region).catch(() => {}); break;
            case 'download':
                if (st.file) download.bytes(st.file.bytes, st.file.name, st.file.type || 'application/octet-stream');
                break;
            case 'info': infoOpen = !infoOpen; info.toggle(infoOpen); sync(); break;
            case 'help': host('onHelp'); break;
        }
    }

    /**
     * @param {File|Blob|{name: string, bytes: Uint8Array|ArrayBuffer}} source
     * @returns {Promise<boolean>}
     */
    /** Drop the shown document: stage, sheet tabs, paging state. */
    function reset() {
        st.token++;
        stage.clear();
        // The details panel holds the last View (and through it the document): drop it too.
        info.set(null);
        tabsHost.hidden = true;
        tabsHost.replaceChildren();
        st.format = null;
        st.paged = false;
        st.page = 0;
        st.count = 0;
    }

    /**
     * Open a sample the host provides; its details say it is one.
     * @param {{label: string, load: () => Promise<File>}} sample
     */
    async function openSample(sample) {
        let file;
        try {
            file = await sample.load();
        } catch {
            reset();
            showError(t('error.fileUnreadable'), 'E_SAMPLE');
            return false;
        }
        sampleOpen = true;
        const ok = await open(file);
        sampleOpen = false;
        return ok;
    }
    /** The document being opened is a sample (for the details panel). */
    let sampleOpen = false;

    /**
     * Several files at once: the first opens here, the others go to the
     * host (`onMore`), or are announced as left unopened.
     * @param {File[]} files
     */
    async function openMany(files) {
        const [first, ...rest] = files;
        if (rest.length) {
            if (opts.onMore) opts.onMore(rest);
            else a11y.announce(tn('intake.onlyFirst', rest.length, { count: rest.length, name: first.name }));
        }
        return open(first);
    }

    async function open(source) {
        reset();
        const token = st.token;
        st.state = 'loading';
        // Refused by size before a byte is read: a 2 GB file would crash the tab.
        const size = typeof Blob !== 'undefined' && source instanceof Blob ? source.size
            : /** @type {{bytes?: ArrayBufferLike|Uint8Array}} */ (source).bytes?.byteLength || 0;
        const sourceName = /** @type {{name?: string}} */ (source).name || '';
        if (size > MAX_DOCUMENT_BYTES) {
            st.file = null;
            showError(t('error.tooLarge'), 'E_TOO_BIG');
            return false;
        }
        // Say it is opening at once: a slow source (a synced or USB file)
        // can take seconds, and the previous document is gone already.
        progress.textContent = t('status.opening', { name: sourceName || t('format.unknown') });
        progress.hidden = false;
        content.replaceChildren();
        sync();
        let file;
        try {
            file = await readSource(source);
        } catch {
            if (token !== st.token) return false;
            st.file = null;
            showError(t('error.fileUnreadable'), 'E_FILE');
            return false;
        }
        if (token !== st.token) return false;
        st.file = file;
        const { format, family } = detect(file.bytes, file.name);
        st.format = format;
        progress.textContent = t('status.opening', { name: file.name });
        progress.hidden = false;
        content.replaceChildren();
        sync();
        a11y.announce(progress.textContent);

        if (file.bytes.length === 0) { showError(t('error.empty'), 'E_EMPTY'); return false; }
        if (family === 'legacy') { showError(t('error.legacy'), 'E_LEGACY_FORMAT'); return false; }
        if (family === 'encrypted') { showError(t('error.encrypted'), 'E_ENCRYPTED'); return false; }
        if (!canRender(format)) { showError(t('error.unsupported'), 'E_UNSUPPORTED'); return false; }

        let view;
        try {
            view = await render(format, file.bytes, { name: file.name, id, headingOffset, t, locale: tr.locale, engine: rt.engine });
        } catch (err) {
            if (token !== st.token) return false;
            const d = describe(err);
            showError(d.message, d.code);
            return false;
        }
        if (token !== st.token) { view.dispose(); return false; }

        try {
            progress.hidden = true;
            st.state = 'ready';
            st.paged = view.kind === 'paged';
            stage.present(view, content, tabsHost);
            // Each document opens at 100 %, or fitted to the width when wider.
            stage.setZoom(1);
            const fit = stage.fitWidthZoom();
            if (fit < 1) stage.setZoom(fit);
            info.set({ name: file.name, size: file.bytes.length, format, view, sample: sampleOpen });
            sync();
            keepFocus(scroller);
        } catch (err) {
            // A view the shell could not present: an error shown, never a half-built "ready".
            reset();
            view.dispose();
            const d = describe(err);
            showError(d.message, d.code);
            return false;
        }
        const length = view.kind === 'paged'
            ? ' ' + tn(view.pageLabel === 'slide' ? 'count.slides' : 'count.pages', view.pages?.length || 0) + '.'
            : view.kind === 'sheets' ? ' ' + tn('count.sheets', view.sheets?.length || 0) + '.' : '';
        a11y.announce(t('status.opened', { name: file.name }) + length);
        host('onOpen', { name: file.name, format });
        return true;
    }

    /**
     * Call a host callback; a host that throws never breaks the viewer.
     * @param {'onOpen'|'onError'|'onClose'|'onHelp'} name
     * @param {any} [payload]
     */
    function host(name, payload) {
        const fn = /** @type {any} */ (opts)[name];
        if (typeof fn !== 'function') return;
        try { fn(payload); } catch (err) { console.error(`AWA Viewer: the host's ${name} threw`, err); }
    }

    function close() {
        reset();
        st.state = 'empty';
        st.file = null;
        infoOpen = false;
        info.toggle(false);
        progress.hidden = true;
        showIntake();
        sync();
        a11y.announce(t('status.closed'));
        intake.focus();
        host('onClose');
    }

    showIntake();
    label();

    return {
        open,
        close,
        /**
         * Show the translated "could not be loaded" error for a document the
         * host could not fetch (used by `<awa-viewer src>`).
         * @param {string} name
         * @param {string} code
         */
        showSourceError(name, code) {
            reset();
            st.file = { name, bytes: new Uint8Array(0), type: '' };
            showError(t('error.source'), code);
        },
        element: region,
        setLocale(next) {
            tr.setLocale(negotiateLocale(next));
            region.setAttribute('lang', tr.locale);
            label();
        },
        destroy() {
            st.token++;
            stage.destroy();
            keys.dispose();
            intake.destroy();
            fullscreen.listen.del(id);
            if (document.fullscreenElement === region) void fullscreen.exit().catch(() => {});
            region.removeEventListener('keydown', zoomKeys);
            scroller.removeEventListener('wheel', wheelZoom);
            content.removeEventListener('click', anchorClick);
            region.remove();
        },
        status: {
            get state() { return st.state; },
            get format() { return st.format; },
            get page() { return st.page; },
            get count() { return st.count; },
            get zoom() { return stage.zoom; }
        }
    };
}
