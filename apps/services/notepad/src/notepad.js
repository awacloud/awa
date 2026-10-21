// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mountNotepad(root, opts)` — the notepad's public API: a
 * plain-text editor mounted inside any element.
 *
 * ```js
 * import { mountNotepad } from '@awacloud/notepad';
 * const notepad = mountNotepad(document.querySelector('#editor'), { locale: 'fr' });
 * await notepad.open(file);      // File | Blob | {name, bytes}, optionally its FileSystemFileHandle
 * await notepad.save();          // back to the same file when the browser allows it, else a download
 * notepad.destroy();
 * ```
 *
 * Files are read from and written to the device only: through the File
 * System Access API where the browser has it (Save writes back to the same
 * file), else through a file picker and a download. Nothing is sent
 * anywhere. Like the viewer, the notepad stays inside its root: it owns no
 * route, never touches `location` / `history` / `document.title`, binds its
 * keys on its own element, and `destroy()` removes everything it added.
 *
 * @module notepad
 */
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { i18n } from '@awacloud/fw/io/i18n/i18n.js';
import { a11y } from '@awacloud/fw/dom/utils/a11y.js';
import { keybindings } from '@awacloud/fw/dom/utils/keybindings.js';
import { download } from '@awacloud/fw/dom/fs/download.js';
import { fsAccess } from '@awacloud/fw/dom/fs/fsAccess.js';
import { focus } from '@awacloud/fw/dom/utils/focus.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
import { ui8 } from '@awacloud/fw/io/utils/ui8.js';
import { str } from '@awacloud/fw/io/text/str.js';
import { date } from '@awacloud/fw/io/time/date.js';
import { createTranslator, negotiateLocale } from './core/i18n.js';
import { createCodec, unencodable, platformEol, position, lineOffset, lineCount, MAX_BYTES, ENCODINGS, EOLS, CHUNK_CHARS } from './core/text.js';
import { createFinder } from './core/find.js';
import { h } from './ui/dom.js';
import { createToolbar } from './ui/toolbar.js';
import { createPanels } from './ui/panels.js';
import { createStatus } from './ui/status.js';
import { createDialog } from './ui/dialog.js';
import { revealRange } from './ui/reveal.js';
import { createHighlighter, MIRROR_MAX } from './ui/highlight.js';
import { createHistory, diff } from './core/history.js';

export { negotiateLocale, LOCALES } from './core/i18n.js';

/** The fw modules the notepad resolves (registered with their deps). */
const FW_MODULES = [i18n, a11y, keybindings, download, fsAccess, focus, utf8, ui8, str, date];

/** Text sizes, as a factor of the base size. */
export const ZOOM_STEPS = Object.freeze([0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]);

/**
 * @typedef {import('./core/text.js').Encoding} Encoding
 * @typedef {import('./core/text.js').Eol} Eol
 * @typedef {File|Blob|{name: string, bytes: Uint8Array|ArrayBuffer}} Source
 */

/**
 * @typedef {object} NotepadOptions
 * @property {string} [locale] UI locale (`en`, `fr`); defaults to the host's
 *   `lang`, then the browser's languages.
 * @property {boolean} [wrap=true] Word wrap on at start.
 * @property {number} [zoom=1] Text size at start (one of `ZOOM_STEPS`).
 * @property {import('@awacloud/fw/core/runtime.js').ModuleRuntime} [runtime]
 *   An fw runtime to register on (a host that already runs fw).
 * @property {(e: {name: string, dirty: boolean}) => void} [onChange] After
 *   every edit, open, save or format change.
 * @property {(e: {wrap: boolean, zoom: number}) => void} [onPrefs] When word
 *   wrap or the text size changes.
 * @property {(edit: import('./core/history.js').Edit) => void} [onEdit] After
 *   every change of the text — typed, pasted, replaced, undone or redone — as
 *   one delta (the recovery journal's input).
 * @property {() => void} [onHelp] Show a Help button; the host opens its help.
 * @property {(items: {file?: File, handle?: FileSystemFileHandle}[]) => void} [onMore]
 *   Files chosen or dropped together beyond the first (which the notepad
 *   opens): the standalone page offers each in a new window.
 * @property {(doc: {name: string|null, text: string, encoding: Encoding, eol: Eol,
 *   handle: FileSystemFileHandle|null, dirty: boolean}) => void} [onLoad] When a
 *   document is shown (opened, new, restored) or saved: the journal's new base.
 */

/**
 * @typedef {object} Snapshot
 * @property {string|null} name
 * @property {string} text
 * @property {Encoding} encoding
 * @property {Eol} eol
 */

/** A fresh element id prefix, so two notepads never collide. */
function freshId() {
    for (;;) {
        const n = globalThis.crypto?.getRandomValues
            ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
            : Date.now() % 4294967296;
        const id = `awn-${n.toString(36)}`;
        if (!document.getElementById(id)) return id;
    }
}

/** From this size a file is read as a stream, with its progress shown and a Cancel. */
export const STREAM_FROM = 2 * 1024 * 1024;
/** From this size typing gets slow — the textarea's own cost (measured: about 120 ms a key at 8 MB). */
export const LARGE_FROM = 4 * 1024 * 1024;

/**
 * Read any accepted source as bytes. A large Blob is read as a stream:
 * `onProgress(fraction)` after each piece; an aborted `signal` stops it
 * (rejects with an `AbortError`).
 * @param {Source} source
 * @param {{onProgress?: (fraction: number) => void, signal?: AbortSignal}} [o]
 * @returns {Promise<{name: string, bytes: Uint8Array}>}
 * @throws {DOMException} `AbortError` when `signal` aborts the read.
 */
async function readSource(source, { onProgress, signal } = {}) {
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const name = /** @type {File} */ (source).name || '';
        if (source.size < STREAM_FROM || typeof source.stream !== 'function') {
            return { name, bytes: new Uint8Array(await source.arrayBuffer()) };
        }
        const reader = source.stream().getReader();
        const bytes = new Uint8Array(source.size);
        let at = 0;
        for (;;) {
            if (signal?.aborted) {
                await reader.cancel().catch(() => {});
                throw new DOMException('Opening cancelled', 'AbortError');
            }
            const { done, value } = await reader.read();
            if (done) break;
            // A file that grew while it was read: keep what fits, it is read again next time.
            bytes.set(value.subarray(0, Math.max(0, bytes.length - at)), at);
            at += value.length;
            if (onProgress) onProgress(Math.min(1, at / bytes.length));
        }
        return { name, bytes: at < bytes.length ? bytes.subarray(0, at) : bytes };
    }
    const s = /** @type {{name: string, bytes: Uint8Array|ArrayBuffer}} */ (source);
    return { name: s.name || '', bytes: s.bytes instanceof Uint8Array ? s.bytes : new Uint8Array(s.bytes) };
}

/**
 * Mount a notepad inside `root`.
 *
 * @param {HTMLElement} root The host element; the notepad appends its region inside.
 * @param {NotepadOptions} [opts]
 */
export function mountNotepad(root, opts = {}) {
    const runtime = opts.runtime || new ModuleRuntime();
    runtime.registerAllDeep(FW_MODULES);
    const id = freshId();
    const locale = negotiateLocale(
        opts.locale, root.closest('[lang]')?.getAttribute('lang'),
        document.documentElement.lang, typeof navigator !== 'undefined' ? navigator.languages : []);
    const tr = createTranslator(runtime, locale);
    const { t, tn, number } = tr;
    const announcer = runtime.resolve('a11y');
    const downloader = runtime.resolve('download');
    const fs = runtime.resolve('fsAccess');
    const dates = runtime.resolve('date');
    const { decode, encode, encodeChunks } = createCodec({ utf8: runtime.resolve('utf8'), ui8: runtime.resolve('ui8') });
    const { findAll, replaceAll, isMatch } = createFinder(runtime.resolve('str'));

    /** @type {{name: string|null, handle: FileSystemFileHandle|null, encoding: Encoding, eol: Eol,
     *   savedFormat: string, wrap: boolean, zoom: number,
     *   panel: 'find'|'replace'|'goto'|null}} */
    const st = {
        name: null, handle: null, encoding: 'utf-8', eol: platformEol(),
        savedFormat: '', wrap: opts.wrap ?? true,
        zoom: ZOOM_STEPS.includes(opts.zoom ?? 1) ? (opts.zoom ?? 1) : 1, panel: null
    };
    st.savedFormat = format();
    /** Undo / redo, and where the text was last saved. */
    const history = createHistory();
    /** The text as the last recorded change left it (the base of the next delta). */
    let current = '';

    // ── DOM ────────────────────────────────────────────────────────────
    const region = h('section', { class: 'awn', id, lang: locale, role: 'region', 'data-dragover': 'false' });
    const toolbar = createToolbar({ t, help: typeof opts.onHelp === 'function', onAction: (a) => run(() => act(a)) });
    const panels = createPanels({
        id, t,
        onFind: (backwards) => { find(backwards); },
        onReplace: () => replaceOne(),
        onReplaceAll: () => replaceEvery(),
        onGoto: (line) => goto(line),
        onClose: () => closePanel(),
        onQuery: () => marks()
    });
    const text = /** @type {HTMLTextAreaElement} */ (h('textarea', {
        class: 'awn-text', id: `${id}-text`, spellcheck: 'false', autocomplete: 'off',
        autocapitalize: 'off', 'aria-multiline': 'true'
    }));
    const status = createStatus({
        id, t, tn, number,
        onEol: (eol) => { st.eol = eol; changed(); },
        onEncoding: (encoding) => { st.encoding = encoding; changed(); }
    });
    const dialog = createDialog({ id, focus: runtime.resolve('focus') });
    // The fallback picker where the File System Access API is missing.
    const input = /** @type {HTMLInputElement} */ (h('input', {
        type: 'file', class: 'awn-visually-hidden', tabindex: '-1', 'aria-hidden': 'true', multiple: ''
    }));
    region.append(toolbar.element, ...panels.elements, text, status.element, dialog.element, input);
    root.append(region);
    /** Find's matches, marked over the text. */
    const highlighter = createHighlighter({ text, host: region });

    // ── state → DOM ────────────────────────────────────────────────────
    function format() { return `${st.encoding}/${st.eol}`; }
    function displayName() { return st.name || t('doc.untitled'); }
    /** Unsaved: the history moved off the saved point, or the format changed. O(1). */
    function isDirty() { return !history.atSaved || format() !== st.savedFormat; }

    function sync() {
        region.setAttribute('aria-label', t('app.regionWith', { name: displayName() }));
        text.setAttribute('aria-label', t('doc.text'));
        text.setAttribute('wrap', st.wrap ? 'soft' : 'off');
        region.dataset.wrap = String(st.wrap);
        region.style.setProperty('--awn-zoom', String(st.zoom));
        toolbar.update({ name: displayName(), dirty: isDirty(), wrap: st.wrap, panel: st.panel });
        caret();
    }

    /** The status bar: caret, length, size, format. */
    function caret() {
        const value = text.value;
        const at = text.selectionDirection === 'backward' ? text.selectionStart : text.selectionEnd;
        const { line, col } = position(value, at ?? 0);
        status.update({ line, col, length: value.length, zoom: st.zoom, eol: st.eol, encoding: st.encoding });
    }

    /** After anything that may change the document or its dirty state. */
    function changed() {
        sync();
        if (opts.onChange) opts.onChange({ name: displayName(), dirty: isDirty() });
    }

    function label() {
        toolbar.label();
        panels.label();
        status.label();
        sync();
    }

    /** @param {string} message */
    function say(message) { announcer.announce(message); }

    /**
     * No action while a question waits for its answer.
     * @param {() => unknown} fn
     */
    function run(fn) {
        if (dialog.open) return;
        void fn();
    }

    // ── questions ──────────────────────────────────────────────────────
    /** @param {string} message */
    async function inform(message) {
        await dialog.ask({ title: t('ask.title'), message, choices: [{ value: 'ok', label: t('ask.ok'), primary: true }] });
    }

    /**
     * Ask to save unsaved changes; resolves `true` when the caller may go on.
     * @returns {Promise<boolean>}
     */
    async function confirmDiscard() {
        if (!isDirty()) return true;
        const answer = await dialog.ask({
            title: t('ask.title'),
            message: t('ask.unsaved', { name: displayName() }),
            choices: [
                { value: 'save', label: t('ask.save'), primary: true },
                { value: 'discard', label: t('ask.discard') },
                { value: 'cancel', label: t('ask.cancel') }
            ]
        });
        if (answer === 'save') return save();
        return answer === 'discard';
    }

    // ── documents ──────────────────────────────────────────────────────
    /**
     * Show a document.
     * @param {{text: string, name: string|null, handle: FileSystemFileHandle|null,
     *   encoding: Encoding, eol: Eol, dirty?: boolean}} doc
     */
    function load(doc) {
        closePanel(false);
        status.note(null);
        text.value = doc.text;
        current = text.value;
        history.reset(!!doc.dirty);
        st.name = doc.name;
        st.handle = doc.handle;
        st.encoding = doc.encoding;
        st.eol = doc.eol;
        st.savedFormat = format();
        text.setSelectionRange(0, 0);
        text.scrollTop = 0;
        text.scrollLeft = 0;
        changed();
        text.focus({ preventScroll: true });
        based(!!doc.dirty);
    }

    /** Tell the host the document's new base (the journal starts over from it). @param {boolean} dirty */
    function based(dirty) {
        if (opts.onLoad) {
            opts.onLoad({ name: st.name, text: current, encoding: st.encoding, eol: st.eol, handle: st.handle, dirty });
        }
    }

    /**
     * Read and show a file (no unsaved-changes question: the caller asked).
     * @param {Source} source
     * @param {FileSystemFileHandle|null} handle
     * @returns {Promise<boolean>}
     */
    async function read(source, handle) {
        let file;
        const fallbackName = /** @type {{name?: string}} */ (source).name || handle?.name || '';
        const tooLarge = (/** @type {string} */ name) => inform(t('error.tooLarge', {
            name, size: number(MAX_BYTES / 1048576, { style: 'unit', unit: 'megabyte' })
        }));
        // Refuse by size before reading a byte: a 2 GB file is not read only to be refused.
        const size = typeof Blob !== 'undefined' && source instanceof Blob ? source.size : 0;
        if (size > MAX_BYTES) {
            await tooLarge(fallbackName || t('doc.untitled'));
            return false;
        }
        const reading = new AbortController();
        const shownName = fallbackName || t('doc.untitled');
        const progress = (/** @type {number} */ fraction) => status.note(
            t('status.opening', { name: shownName, percent: number(fraction, { style: 'percent', maximumFractionDigits: 0 }) }),
            { label: t('status.cancel'), run: () => reading.abort() });
        if (size >= STREAM_FROM) progress(0);
        try {
            file = await readSource(source, { onProgress: progress, signal: reading.signal });
        } catch (err) {
            status.note(null);
            if (/** @type {Error} */ (err)?.name === 'AbortError') {
                say(t('status.openCancelled', { name: shownName }));
                return false;
            }
            await inform(t('error.read', { name: shownName }));
            return false;
        }
        status.note(null);
        const name = file.name || handle?.name || t('doc.untitled');
        if (file.bytes.length > MAX_BYTES) {
            await tooLarge(name);
            return false;
        }
        const doc = decode(file.bytes);
        if (doc.binary) {
            await inform(t('error.binary', { name }));
            return false;
        }
        load({ text: doc.text, name, handle, encoding: doc.encoding, eol: doc.eol || platformEol() });
        // Honest about the cost: past a few MB the textarea itself makes typing slow.
        if (file.bytes.length >= LARGE_FROM) status.note(t('status.largeFile'));
        say(t('status.opened', { name }));
        return true;
    }

    /**
     * Open a document, after asking to save unsaved changes.
     * @param {Source} source
     * @param {FileSystemFileHandle|null} [handle] Its handle, so Save writes back to it.
     */
    async function open(source, handle = null) {
        if (!(await confirmDiscard())) return false;
        return read(source, handle);
    }

    /** Open through the system picker. */
    async function pick() {
        if (!(await confirmDiscard())) return false;
        if (!fs.support().fsa) {
            input.click();
            return false;
        }
        /** @type {FileSystemFileHandle[]} */
        let handles;
        try {
            handles = await fs.pickFiles();
        } catch {
            handles = [];
        }
        const [handle, ...rest] = handles;
        if (!handle) return false;
        more(rest.map((h) => ({ handle: h })));
        try {
            return await read(await handle.getFile(), handle);
        } catch {
            await inform(t('error.read', { name: handle.name }));
            return false;
        }
    }
    input.addEventListener('change', () => {
        const [file, ...rest] = input.files ? [...input.files] : [];
        input.value = '';
        more(rest.map((f) => ({ file: f })));
        if (file) void read(file, null);
    });

    /**
     * Files chosen or dropped with the first: to the host (the standalone
     * page offers each in a window of its own, by design), else said.
     * @param {{file?: File, handle?: FileSystemFileHandle}[]} items
     */
    function more(items) {
        if (!items.length) return;
        if (opts.onMore) opts.onMore(items);
        else say(tn('more.notOpened', items.length, { count: number(items.length) }));
    }

    async function newDocument() {
        if (!(await confirmDiscard())) return false;
        load({ text: '', name: null, handle: null, encoding: 'utf-8', eol: platformEol() });
        say(t('status.newDoc'));
        return true;
    }

    /** The name a save proposes. */
    function suggestedName() {
        const name = st.name || t('doc.untitled');
        return /\.[^./\\]+$/.test(name) ? name : `${name}.txt`;
    }

    /**
     * A file name as typed, made safe for every system: no path separator,
     * no character Windows refuses, no control character, no trailing dot or
     * space; `''` when nothing is left.
     * @param {string} raw
     */
    function cleanName(raw) {
        return raw.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/, '').slice(0, 255);
    }

    /**
     * Rename the document. With a file handle that can move, the file on
     * the device is renamed; without one, the name is the next save's.
     * @param {string} raw
     */
    async function rename(raw) {
        const next = cleanName(raw);
        if (!next || next === st.name) return false;
        const handle = /** @type {any} */ (st.handle);
        if (handle && typeof handle.move === 'function') {
            try {
                await handle.move(next);
            } catch {
                await inform(t('error.rename', { name: displayName(), next }));
                return false;
            }
            st.name = handle.name || next;
            say(t('status.renamed', { name: st.name }));
        } else {
            st.name = next;
            say(t('status.renamedNext', { name: next }));
        }
        changed();
        return true;
    }

    /** Edit the name in the toolbar, then `then(name)` (not called on Escape). */
    function editName(/** @type {(name: string) => unknown} */ then) {
        toolbar.editName(st.name || suggestedName(), (value) => {
            text.focus({ preventScroll: true });
            if (value !== null) void then(value);
        });
    }

    /**
     * The bytes to write, after the lossy-encoding question when needed;
     * `null` when the user cancels. A large text comes as a Blob of pieces
     * (no second copy of it all in memory), written or downloaded as is.
     * @param {string} value
     * @returns {Promise<Uint8Array|Blob|null>}
     */
    async function bytesOf(value) {
        const lost = unencodable(value, st.encoding);
        if (lost > 0) {
            const answer = await dialog.ask({
                title: t('ask.title'),
                message: tn('ask.lossy', lost, { count: number(lost), encoding: t(`encoding.${st.encoding}`) }),
                choices: [
                    { value: 'utf8', label: t('ask.lossyUtf8'), primary: true },
                    { value: 'keep', label: t('ask.lossyKeep') },
                    { value: 'cancel', label: t('ask.cancel') }
                ]
            });
            if (answer === 'cancel') return null;
            if (answer === 'utf8') st.encoding = 'utf-8';
        }
        const format = { encoding: st.encoding, eol: st.eol };
        return value.length > CHUNK_CHARS ? new Blob(encodeChunks(value, format)) : encode(value, format);
    }

    /** @param {string} value */
    function markSaved(value) {
        if (value === current) history.markSaved();
        st.savedFormat = format();
        changed();
        based(isDirty());
    }

    /**
     * @param {FileSystemFileHandle} handle
     * @returns {Promise<boolean>}
     */
    async function writeTo(handle) {
        const value = text.value;
        const bytes = await bytesOf(value);
        if (!bytes) return false;
        try {
            await fs.write(handle, bytes);
        } catch {
            await inform(t('error.write', { name: handle.name || displayName() }));
            return false;
        }
        st.handle = handle;
        st.name = handle.name || st.name;
        markSaved(value);
        say(t('status.saved', { name: displayName() }));
        return true;
    }

    /** Save to the file's own handle, else Save as. @returns {Promise<boolean>} */
    async function save() {
        if (st.handle && typeof st.handle.createWritable === 'function') return writeTo(st.handle);
        return fs.support().fsa ? saveAs() : download();
    }

    /** Said once: without the File System Access API a save is a downloaded copy. */
    let downloadExplained = false;

    /**
     * Save as a download: the only way without the File System Access API
     * (Firefox, Safari, mobile browsers). It cannot write back to the
     * opened file: each save is a new copy in the downloads, named after the
     * document — the toolbar says "Download", and the first time, why.
     */
    async function download() {
        const value = text.value;
        const bytes = await bytesOf(value);
        if (!bytes) return false;
        const name = suggestedName();
        const charset = st.encoding.startsWith('utf-8') ? 'utf-8' : st.encoding;
        const type = `text/plain;charset=${charset}`;
        if (bytes instanceof Uint8Array) downloader.bytes(bytes, name, type);
        else downloader.blob(new Blob([bytes], { type }), name);
        st.name = name;
        st.handle = null;
        markSaved(value);
        say(t('status.downloaded', { name }));
        if (!downloadExplained) {
            downloadExplained = true;
            status.note(t('status.downloadNote'));
        }
        return true;
    }

    /** Save under a name the user picks (a download without the File System Access API). */
    async function saveAs() {
        if (fs.support().fsa) {
            let handle;
            try {
                handle = await fs.pickSave({ suggestedName: suggestedName() });
            } catch {
                await inform(t('error.write', { name: suggestedName() }));
                return false;
            }
            return handle ? writeTo(handle) : false;
        }
        // Without a save picker, "Save as" asks the name in place, then downloads.
        return new Promise((resolve) => {
            toolbar.editName(st.name || suggestedName(), (value) => {
                text.focus({ preventScroll: true });
                if (value === null) { resolve(false); return; }
                const next = cleanName(value);
                if (next) st.name = next;
                resolve(download());
            });
        });
    }

    // ── editing: every change is one delta (undo, redo, journal) ───────
    /**
     * Record a change the text just received, and pass it on.
     * @param {import('./core/history.js').Edit} change
     */
    function recorded(change) {
        current = text.value;
        history.record(change);
        if (opts.onEdit) opts.onEdit(change);
        changed();
        marksLater();
    }

    /**
     * Change the text from script — Insert date, Replace, Replace all — as
     * one step of the history (a script edit wipes the textarea's own undo).
     * @param {number} start
     * @param {number} end
     * @param {string} inserted
     * @param {[number, number]} [selection] The selection after; default: after the inserted text.
     */
    function edit(start, end, inserted, selection) {
        const before = /** @type {[number, number]} */ ([text.selectionStart, text.selectionEnd]);
        const removed = current.slice(start, end);
        text.setRangeText(inserted, start, end, 'end');
        if (selection) text.setSelectionRange(selection[0], selection[1]);
        recorded({
            at: start, removed, inserted, before,
            after: [text.selectionStart, text.selectionEnd], time: Date.now(), kind: 'other'
        });
    }

    /**
     * Apply an undo or redo step: its text, then its selection, in view.
     * @param {import('./core/history.js').Edit|null} step
     */
    function replay(step) {
        if (!step) return false;
        text.setRangeText(step.inserted, step.at, step.at + step.removed.length, 'end');
        text.setSelectionRange(step.after[0], step.after[1]);
        revealRange(text, step.after[0], step.after[1]);
        current = text.value;
        if (opts.onEdit) opts.onEdit(step);
        changed();
        marksLater();
        return true;
    }
    function undo() { return replay(history.undo()); }
    function redo() { return replay(history.redo()); }

    // Typed changes: the selection before (`beforeinput`) and after (`input`)
    // bound the change, so a keystroke costs the size of what it changed,
    // not of the text. Changes whose place is not the selection (a drop)
    // and anything that does not add up fall back to a full comparison.
    /** @type {{start: number, end: number, type: string}|null} */
    let pending = null;
    /** Input types whose change starts at the selection. */
    const AT_SELECTION = /^(insertText|insertLineBreak|insertParagraph|insertFromPaste|insertFromYank|insertCompositionText|insertTranspose|delete(Content|Word|SoftLine|HardLine|ByCut|EntireSoftLine))/;
    text.addEventListener('beforeinput', (e) => {
        const type = /** @type {InputEvent} */ (e).inputType || '';
        // The browser's own undo stack is not the text's history any more: ours answers.
        if (type === 'historyUndo' || type === 'historyRedo') {
            e.preventDefault();
            run(() => (type === 'historyUndo' ? undo() : redo()));
            return;
        }
        pending = { start: text.selectionStart, end: text.selectionEnd, type };
    });
    text.addEventListener('input', () => {
        const was = current;
        const now = text.value;
        const p = pending;
        pending = null;
        /** @type {{at: number, removed: string, inserted: string}|null} */
        let change = null;
        if (p && AT_SELECTION.test(p.type)) {
            const at = Math.min(p.start, text.selectionStart);
            const insertedEnd = Math.max(text.selectionEnd, at);
            const removedLength = was.length - (now.length - (insertedEnd - at));
            // The two edges of the change must agree (NaN past an end compares unequal: test those apart).
            const same = (i, j) => (i >= was.length && j >= now.length) || was.charCodeAt(i) === now.charCodeAt(j);
            if (removedLength >= 0 && same(at + removedLength, insertedEnd) && (at === 0 || same(at - 1, at - 1))) {
                change = { at, removed: was.slice(at, at + removedLength), inserted: now.slice(at, insertedEnd) };
            }
        }
        if (!change) change = diff(was, now);
        const type = p ? p.type : '';
        recorded({
            ...change,
            before: p ? [p.start, p.end] : [change.at, change.at],
            after: [text.selectionStart, text.selectionEnd],
            time: Date.now(),
            kind: type === 'insertText' ? 'type' : /^deleteContent(Backward|Forward)$/.test(type) ? 'delete' : 'other'
        });
    });
    // A caret moved by hand ends the typing step.
    text.addEventListener('pointerup', () => history.seal());
    text.addEventListener('keydown', (e) => {
        if (/^(Arrow|Home|End|Page)/.test(e.key)) history.seal();
    });

    // ── find, replace, go to ───────────────────────────────────────────
    /** @param {'find'|'replace'|'goto'} which */
    function showPanel(which) {
        const selected = text.value.slice(text.selectionStart, text.selectionEnd);
        st.panel = which;
        panels.show(which, {
            seed: selected && !selected.includes('\n') ? selected : '',
            line: position(text.value, text.selectionStart).line
        });
        sync();
        marks();
    }

    /** @param {boolean} [focusText=true] */
    function closePanel(focusText = true) {
        if (!st.panel) return;
        st.panel = null;
        highlighter.clear();
        panels.show(null);
        if (focusText) text.focus();
        sync();
    }

    /** @param {{start: number, end: number}} range */
    function select(range) {
        text.focus();
        text.setSelectionRange(range.start, range.end);
        revealRange(text, range.start, range.end);
        caret();
        panels.refocus();
    }

    /**
     * Select the next match of the find field.
     * @param {boolean} backwards
     * @returns {boolean}
     */
    function find(backwards) {
        const query = panels.query;
        if (!query) { showPanel(st.panel === 'replace' ? 'replace' : 'find'); return false; }
        const all = findAll(current, query, { matchCase: panels.matchCase });
        if (!all.length) {
            highlighter.clear();
            const message = t('find.notFound', { query });
            panels.message('find', message);
            say(message);
            return false;
        }
        // The next match after the selection (or before it), wrapping around.
        const from = backwards ? text.selectionStart : text.selectionEnd;
        let index = backwards ? all.findLastIndex((m) => m.end <= from) : all.findIndex((m) => m.start >= from);
        if (index < 0) index = backwards ? all.length - 1 : 0;
        select(all[index]);
        highlighter.show(all, index);
        const message = t('find.count', { index: number(index + 1), count: number(all.length) });
        panels.message('find', message);
        say(message);
        return true;
    }

    /**
     * Mark every match of the find field as it is typed (no caret move), up
     * to the size where marking stays cheap; above it, Find marks its match.
     */
    function marks() {
        const query = panels.query;
        if (!st.panel || st.panel === 'goto' || !query || current.length > MIRROR_MAX) { highlighter.clear(); return; }
        highlighter.show(findAll(current, query, { matchCase: panels.matchCase }), -1);
    }
    /** The text changed under open marks: mark again once typing pauses. */
    let remark = null;
    function marksLater() {
        if (!st.panel || st.panel === 'goto') return;
        if (remark) clearTimeout(remark);
        remark = setTimeout(() => { remark = null; marks(); }, 200);
    }

    function replaceOne() {
        const query = panels.query;
        if (!query) return;
        const { selectionStart: s, selectionEnd: e } = text;
        if (isMatch(current, s, e, query, { matchCase: panels.matchCase })) {
            edit(s, e, panels.replacement);
        }
        find(false);
    }

    function replaceEvery() {
        const query = panels.query;
        if (!query) return;
        const result = replaceAll(current, query, panels.replacement, { matchCase: panels.matchCase });
        if (result.count === 0) {
            const message = t('find.notFound', { query });
            panels.message('find', message);
            say(message);
            return;
        }
        // One step for all of them, the caret where the first change starts.
        const change = diff(current, result.text);
        edit(change.at, change.at + change.removed.length, change.inserted, [change.at, change.at]);
        const message = tn('find.replaced', result.count, { count: number(result.count) });
        panels.message('find', message);
        say(message);
    }

    /** @param {number} line */
    function goto(line) {
        const count = lineCount(text.value);
        if (line > count) {
            const message = t('goto.beyond', { count: number(count) });
            panels.message('goto', message);
            say(message);
            return;
        }
        const offset = lineOffset(text.value, line);
        closePanel();
        text.setSelectionRange(offset, offset);
        revealRange(text, offset);
        caret();
    }

    /** Insert the time and date at the caret, like Notepad's F5. */
    function insertDate() {
        const stamp = dates.format(new Date(), { locale: tr.locale, timeStyle: 'short', dateStyle: 'short' });
        edit(text.selectionStart, text.selectionEnd, stamp);
    }

    // ── view ───────────────────────────────────────────────────────────
    function prefs() {
        sync();
        // Wrapping and text size move every line: the marks follow.
        highlighter.refresh();
        if (opts.onPrefs) opts.onPrefs({ wrap: st.wrap, zoom: st.zoom });
    }

    /** @param {number} direction */
    function zoomBy(direction) {
        const at = ZOOM_STEPS.indexOf(st.zoom);
        const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, at + direction))];
        if (next === st.zoom) return;
        st.zoom = next;
        prefs();
        say(t('status.zoom', { zoom: number(st.zoom, { style: 'percent', maximumFractionDigits: 0 }) }));
    }

    /** @param {import('./ui/toolbar.js').Action} action */
    function act(action) {
        switch (action) {
            case 'new': return newDocument();
            case 'open': return pick();
            case 'save': return save();
            case 'saveAs': return saveAs();
            case 'find': return st.panel === 'find' ? closePanel() : showPanel('find');
            case 'replace': return st.panel === 'replace' ? closePanel() : showPanel('replace');
            case 'goto': return st.panel === 'goto' ? closePanel() : showPanel('goto');
            case 'wrap': st.wrap = !st.wrap; return prefs();
            case 'zoomOut': return zoomBy(-1);
            case 'zoomIn': return zoomBy(1);
            case 'rename': return editName(rename);
            case 'help': return opts.onHelp?.();
        }
    }

    // ── events (scoped to the region) ──────────────────────────────────
    for (const type of ['keyup', 'pointerup', 'select', 'selectionchange', 'focus']) text.addEventListener(type, caret);

    const keys = runtime.resolve('keybindings').create({ target: region });
    /** @param {string} combo @param {() => unknown} fn */
    const bindMod = (combo, fn) => {
        keys.bind(`Ctrl+${combo}`, () => run(fn));
        keys.bind(`Meta+${combo}`, () => run(fn));
    };
    bindMod('n', newDocument);
    bindMod('o', pick);
    bindMod('s', save);
    bindMod('Shift+s', saveAs);
    bindMod('f', () => showPanel('find'));
    bindMod('h', () => showPanel('replace'));
    bindMod('g', () => showPanel('goto'));
    // Undo and redo are the notepad's own (the textarea's are wiped by any script edit).
    bindMod('z', undo);
    bindMod('y', redo);
    bindMod('Shift+z', redo);
    keys.bind('F3', () => run(() => find(false)));
    keys.bind('Shift+F3', () => run(() => find(true)));
    const noDefault = { preventDefault: false };
    // F5 inserts the time and date in the text only; elsewhere it stays the browser's.
    keys.bind('F5', (/** @type {KeyboardEvent} */ e) => {
        if (e.target !== text || dialog.open) return;
        e.preventDefault();
        insertDate();
    }, noDefault);
    keys.bind('Escape', (/** @type {KeyboardEvent} */ e) => {
        if (dialog.open || !st.panel) return;
        e.preventDefault();
        closePanel();
    }, noDefault);
    keys.attach();

    /** Ctrl + wheel sizes the text, not the page. @param {WheelEvent} e */
    function wheelZoom(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1 : -1);
    }
    text.addEventListener('wheel', wheelZoom, { passive: false });

    // An OS file dropped anywhere on the notepad opens.
    /** @param {DragEvent} e */
    const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    region.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        region.dataset.dragover = 'true';
    });
    region.addEventListener('dragleave', (e) => {
        if (!region.contains(/** @type {Node|null} */ (e.relatedTarget))) region.dataset.dragover = 'false';
    });
    region.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        region.dataset.dragover = 'false';
        const [file, ...rest] = e.dataTransfer ? [...e.dataTransfer.files] : [];
        if (!file) return;
        run(() => {
            more(rest.map((f) => ({ file: f })));
            return open(file);
        });
    });

    // Without the File System Access API, Save and Save as download a copy: say so.
    toolbar.setSaveMode(fs.support().fsa ? 'save' : 'download');
    label();

    return {
        element: region,
        open,
        newDocument,
        save,
        saveAs,
        undo,
        redo,
        /** The current text (with `\n` line breaks). */
        get text() { return text.value; },
        /**
         * The document as it stands, to keep a draft.
         * @returns {Snapshot}
         */
        snapshot() {
            return { name: st.name, text: text.value, encoding: st.encoding, eol: st.eol };
        },
        /**
         * Show recovered text, as unsaved changes. With its file handle (where
         * the browser keeps them) Save writes back to the same file; without
         * one, Save asks where.
         * @param {Snapshot & {handle?: FileSystemFileHandle|null}} snap
         */
        restore(snap) {
            const encoding = ENCODINGS.includes(snap.encoding) ? snap.encoding : 'utf-8';
            const eol = EOLS.includes(snap.eol) ? snap.eol : platformEol();
            const handle = snap.handle && typeof snap.handle.createWritable === 'function' ? snap.handle : null;
            load({ text: String(snap.text || ''), name: snap.name || null, handle, encoding, eol, dirty: true });
            say(t('status.restored'));
        },
        /** @param {string} next */
        setLocale(next) {
            tr.setLocale(negotiateLocale(next));
            region.setAttribute('lang', tr.locale);
            label();
        },
        destroy() {
            dialog.answer('cancel');
            keys.dispose();
            text.removeEventListener('wheel', wheelZoom);
            if (remark) clearTimeout(remark);
            highlighter.destroy();
            region.remove();
        },
        status: {
            get name() { return displayName(); },
            get dirty() { return isDirty(); },
            get canUndo() { return history.canUndo; },
            get canRedo() { return history.canRedo; },
            get encoding() { return st.encoding; },
            get eol() { return st.eol; },
            get wrap() { return st.wrap; },
            get zoom() { return st.zoom; },
            get panel() { return st.panel; },
            get saveTarget() { return st.handle ? 'handle' : 'picker'; }
        }
    };
}
