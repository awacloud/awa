// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mountNotepad()` end to end in Happy-DOM: the empty state,
 * opening, editing and saving (back to a file handle, or as a download),
 * the unsaved-changes question, refusals, find / replace / go to line,
 * format menus, view preferences, locale switching and `destroy()`.
 *
 * @module notepad/notepad.test
 */
import '../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, afterEach } from 'bun:test';
import { mountNotepad } from './notepad.js';

const enc = (s) => new TextEncoder().encode(s);
/** @type {ReturnType<typeof mountNotepad>[]} */
const mounted = [];
function mount(opts = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const n = mountNotepad(host, { locale: 'en', ...opts });
    mounted.push(n);
    return n;
}
afterEach(() => { for (const n of mounted.splice(0)) n.destroy(); document.body.replaceChildren(); });

/** A FileSystemFileHandle stand-in that records what is written. */
function fakeHandle(name, initial = '') {
    const written = [];
    return {
        written,
        handle: /** @type {any} */ ({
            kind: 'file', name,
            async getFile() { return new File([initial], name); },
            async createWritable() {
                const chunks = [];
                return {
                    async write(data) { chunks.push(data); },
                    async seek() {},
                    async close() { written.push(chunks[0]); }
                };
            }
        })
    };
}

/** @param {HTMLElement} root */
const textarea = (root) => /** @type {HTMLTextAreaElement} */ (root.querySelector('textarea'));
/** Type into the text: set the value and fire `input`, as the browser does. */
function type(root, value) {
    const t = textarea(root);
    t.value = value;
    t.dispatchEvent(new Event('input', { bubbles: true }));
}
/** @param {HTMLElement} root @param {string} action */
const click = (root, action) => /** @type {HTMLButtonElement} */ (root.querySelector(`.awn-bar [data-action="${action}"]`)).click();
/** The open question box, its message and buttons. */
function dialog(root) {
    const d = /** @type {HTMLDialogElement} */ (root.querySelector('dialog'));
    return {
        open: d.hasAttribute('open'),
        message: d.querySelector('.awn-dialog-msg')?.textContent,
        /** @param {string} label */
        press(label) {
            const b = [...d.querySelectorAll('button')].find((x) => x.textContent === label);
            if (!b) throw new Error(`no "${label}" button`);
            b.click();
        }
    };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('mountNotepad', () => {
    test('empty state: a named region, a labelled toolbar, a status bar', () => {
        const n = mount();
        const el = n.element;
        expect(el.getAttribute('role')).toBe('region');
        expect(el.getAttribute('aria-label')).toBe('Text editor: Untitled');
        const bar = /** @type {HTMLElement} */ (el.querySelector('[role=toolbar]'));
        expect(bar.getAttribute('aria-label')).toBe('Editor tools');
        expect(/** @type {HTMLElement} */ (bar.querySelector('[data-action=save]')).getAttribute('aria-label')).toBe('Download a copy (Ctrl+S)');   // no File System Access API here
        // One tab stop in the toolbar.
        expect([...bar.querySelectorAll('button')].filter((b) => b.tabIndex === 0).length).toBe(1);
        expect(textarea(el).getAttribute('aria-label')).toBe('Text');
        expect(el.querySelector('.awn-status')?.textContent).toContain('Ln 1, Col 1');
        expect(n.status.dirty).toBe(false);
        expect(n.status.panel).toBe(null);
    });

    test('opening a file shows its text and format; typing makes it dirty', async () => {
        const changes = [];
        const n = mount({ onChange: (e) => changes.push(e) });
        expect(await n.open({ name: 'notes.txt', bytes: enc('one\r\ntwo\r\n') })).toBe(true);
        expect(n.text).toBe('one\ntwo\n');
        expect(n.status.name).toBe('notes.txt');
        expect(n.status.eol).toBe('crlf');
        expect(n.status.encoding).toBe('utf-8');
        expect(n.status.dirty).toBe(false);
        expect(n.element.getAttribute('aria-label')).toBe('Text editor: notes.txt');
        expect(/** @type {HTMLSelectElement} */ (n.element.querySelector('.awn-status select')).value).toBe('crlf');
        type(n.element, 'one\ntwo\nthree');
        expect(n.status.dirty).toBe(true);
        expect(/** @type {HTMLElement} */ (n.element.querySelector('.awn-dirty')).hidden).toBe(false);
        expect(changes.at(-1)).toEqual({ name: 'notes.txt', dirty: true });
        expect(n.element.querySelector('.awn-status')?.textContent).toContain('13 characters');
    });

    test('Save writes back to the file handle, with the file’s line endings', async () => {
        const n = mount();
        const { handle, written } = fakeHandle('a.txt');
        await n.open({ name: 'a.txt', bytes: enc('x\r\n') }, handle);
        type(n.element, 'x\ny\n');
        expect(await n.save()).toBe(true);
        expect([...written[0]]).toEqual([...enc('x\r\ny\r\n')]);
        expect(n.status.dirty).toBe(false);
        expect(n.status.saveTarget).toBe('handle');
    });

    test('without the File System Access API, Save downloads the file', async () => {
        const n = mount();
        type(n.element, 'hello');
        expect(await n.save()).toBe(true);
        expect(n.status.name).toBe('Untitled.txt');
        expect(n.status.dirty).toBe(false);
    });

    test('with the File System Access API the toolbar says Save; without it, Download a copy, and why once', async () => {
        const saved = globalThis.showOpenFilePicker;
        globalThis.showOpenFilePicker = /** @type {any} */ (async () => []);
        try {
            const n = mount();
            expect(n.element.querySelector('[data-action=save]')?.getAttribute('aria-label')).toBe('Save (Ctrl+S)');
            expect(n.element.querySelector('[data-action=saveAs]')?.getAttribute('aria-label')).toBe('Save as (Ctrl+Shift+S)');
        } finally {
            if (saved === undefined) delete globalThis.showOpenFilePicker; else globalThis.showOpenFilePicker = saved;
        }
        const d = mount();
        type(d.element, 'x');
        await d.save();
        const note = d.element.querySelector('.awn-status-notice');
        expect(/** @type {HTMLElement} */ (note).hidden).toBe(false);
        expect(note?.textContent).toContain('this browser cannot write to the file itself');
    });

    test('the name is shown, and renamed in place: cleaned, Escape keeps it, a handle moves the file', async () => {
        const n = mount();
        await n.open({ name: 'notes.txt', bytes: enc('x') });
        const button = /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-name'));
        expect(button.getAttribute('aria-label')).toBe('Rename “notes.txt”');
        button.click();
        const field = /** @type {HTMLInputElement} */ (n.element.querySelector('.awn-name-field'));
        expect(field.hidden).toBe(false);
        expect(field.value).toBe('notes.txt');
        expect([field.selectionStart, field.selectionEnd]).toEqual([0, 5]);   // the name, not its extension
        field.value = 'a/b:c?.txt';
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await Promise.resolve();
        expect(n.status.name).toBe('abc.txt');
        button.click();
        field.value = 'other.txt';
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await Promise.resolve();
        expect(n.status.name).toBe('abc.txt');
        // With a handle that can move, the file itself is renamed; when it cannot, the user is told.
        const moved = [];
        const handle = /** @type {any} */ ({ name: 'a.txt', getFile: async () => new File(['x'], 'a.txt'), createWritable: async () => ({}), move: async (to) => { moved.push(to); handle.name = to; } });
        await n.open(new File(['x'], 'a.txt'), handle);
        button.click();
        field.value = 'b.txt';
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        expect(moved).toEqual(['b.txt']);
        expect(n.status.name).toBe('b.txt');
        handle.move = async () => { throw new DOMException('no', 'NotAllowedError'); };
        button.click();
        field.value = 'c.txt';
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        expect(dialog(n.element).message).toContain('could not be renamed c.txt');
        dialog(n.element).press('OK');
        expect(n.status.name).toBe('b.txt');
    });

    test('a large file is read as a stream: progress, Cancel keeps the text, and a note about typing', async () => {
        const n = mount();
        type(n.element, 'mine');
        const size = 5 * 1024 * 1024;
        const line = 'a line of text\n';
        const body = line.repeat(Math.ceil(size / line.length)).slice(0, size);
        // Read in pieces; the test presses Cancel at the first progress.
        class SlowFile extends File {
            stream() {
                const bytes = new TextEncoder().encode(body);
                let at = 0;
                return new ReadableStream({
                    async pull(c) {
                        await new Promise((r) => setTimeout(r, 5));   // a slow device
                        if (at >= bytes.length) { c.close(); return; }
                        c.enqueue(bytes.subarray(at, at + 1048576));
                        at += 1048576;
                    }
                });
            }
        }
        const notice = () => /** @type {HTMLElement} */ (n.element.querySelector('.awn-status-notice'));
        const opening = n.open(new SlowFile([body], 'big.log'));
        // Unsaved text first: answer "Don't save".
        await new Promise((r) => setTimeout(r, 0));
        dialog(n.element).press('Don’t save');
        for (let i = 0; i < 20 && !/Opening big\.log/.test(notice().textContent || ''); i++) await new Promise((r) => setTimeout(r, 0));
        expect(notice().textContent).toMatch(/Opening big\.log… \d+\s?%/);
        /** @type {HTMLButtonElement} */ (notice().querySelector('button')).click();
        expect(await opening).toBe(false);
        expect(n.text).toBe('mine');
        expect(notice().hidden).toBe(true);
        // Read to the end: open, with the note about typing speed.
        n.newDocument();
        await new Promise((r) => setTimeout(r, 0));
        dialog(n.element).press('Don’t save');
        await new Promise((r) => setTimeout(r, 0));
        expect(await n.open(new SlowFile([body], 'big.log'))).toBe(true);
        expect(n.text.length).toBe(size);
        expect(notice().textContent).toBe('Large file: typing may be slow.');
    });

    test('a file over the limit is refused by its size, before it is read', async () => {
        const n = mount();
        let read = false;
        class Huge extends File {
            get size() { return 17 * 1024 * 1024; }
            arrayBuffer() { read = true; return super.arrayBuffer(); }
            stream() { read = true; return super.stream(); }
        }
        const opening = n.open(new Huge(['x'], 'huge.txt'));
        await new Promise((r) => setTimeout(r, 0));
        expect(dialog(n.element).message).toContain('huge.txt is too large');
        dialog(n.element).press('OK');
        expect(await opening).toBe(false);
        expect(read).toBe(false);
    });

    test('changing the encoding or line endings is a change to save', async () => {
        const n = mount();
        await n.open({ name: 'a.txt', bytes: enc('a\nb') });
        const select = /** @type {HTMLSelectElement} */ (n.element.querySelectorAll('.awn-status select')[1]);
        select.value = 'utf-16le';
        select.dispatchEvent(new Event('change'));
        expect(n.status.encoding).toBe('utf-16le');
        expect(n.status.dirty).toBe(true);
    });

    test('unsaved changes: New asks, "Don’t save" discards, "Cancel" keeps', async () => {
        const n = mount();
        type(n.element, 'draft');
        let pending = n.newDocument();
        await tick();
        expect(dialog(n.element).open).toBe(true);
        expect(dialog(n.element).message).toBe('Do you want to save the changes to Untitled?');
        dialog(n.element).press('Cancel');
        expect(await pending).toBe(false);
        expect(n.text).toBe('draft');
        pending = n.newDocument();
        await tick();
        dialog(n.element).press('Don’t save');
        expect(await pending).toBe(true);
        expect(n.text).toBe('');
        expect(n.status.dirty).toBe(false);
    });

    test('a binary file is refused, the text stays', async () => {
        const n = mount();
        type(n.element, 'keep');
        const pending = n.open({ name: 'app.exe', bytes: Uint8Array.of(0x4d, 0x5a, 0x00, 0x00) });
        await tick();
        dialog(n.element).press('Don’t save');
        await tick();
        expect(dialog(n.element).message).toBe('app.exe is not a text file. Opening it here could damage it.');
        dialog(n.element).press('OK');
        expect(await pending).toBe(false);
        expect(n.text).toBe('keep');
    });

    test('saving characters Windows-1252 cannot hold asks first', async () => {
        const n = mount();
        const { handle, written } = fakeHandle('old.txt');
        await n.open({ name: 'old.txt', bytes: Uint8Array.of(0x63, 0x61, 0x66, 0xe9) }, handle);
        expect(n.status.encoding).toBe('windows-1252');
        type(n.element, 'café 😀');
        const pending = n.save();
        await tick();
        expect(dialog(n.element).message).toContain('1 character cannot be written in Windows-1252 (ANSI)');
        dialog(n.element).press('Save as UTF-8');
        expect(await pending).toBe(true);
        expect(n.status.encoding).toBe('utf-8');
        expect(new TextDecoder().decode(written[0])).toBe('café 😀');
    });

    test('find, replace and replace all', async () => {
        const n = mount();
        await n.open({ name: 'a.txt', bytes: enc('cat dog cat') });
        click(n.element, 'replace');
        expect(n.status.panel).toBe('replace');
        const [query, replacement] = /** @type {HTMLInputElement[]} */ ([...n.element.querySelectorAll('.awn-panel input[type=search], .awn-panel input[type=text]')]);
        query.value = 'cat';
        replacement.value = 'cow';
        /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-panel [data-action=next]')).click();
        const t = textarea(n.element);
        expect([t.selectionStart, t.selectionEnd]).toEqual([0, 3]);
        /** @type {HTMLButtonElement} */ (n.element.querySelector('[data-action=replaceOne]')).click();
        expect(n.text).toBe('cow dog cat');
        expect([t.selectionStart, t.selectionEnd]).toEqual([8, 11]);
        /** @type {HTMLButtonElement} */ (n.element.querySelector('[data-action=replaceAll]')).click();
        expect(n.text).toBe('cow dog cow');
        expect(n.element.querySelector('.awn-panel-msg')?.textContent).toBe('1 match replaced.');
        query.value = 'bird';
        /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-panel [data-action=next]')).click();
        expect(n.element.querySelector('.awn-panel-msg')?.textContent).toBe('Cannot find “bird”.');
        expect(n.status.dirty).toBe(true);
    });

    test('Escape closes the bar; go to line moves the caret or explains', async () => {
        const n = mount();
        await n.open({ name: 'a.txt', bytes: enc('one\ntwo\nthree') });
        click(n.element, 'goto');
        const line = /** @type {HTMLInputElement} */ (n.element.querySelector('.awn-line'));
        line.value = '9';
        /** @type {HTMLFormElement} */ (line.form).requestSubmit();
        expect(n.element.querySelectorAll('.awn-panel-msg')[1]?.textContent).toBe('The line number is beyond the total number of lines (3).');
        line.value = '3';
        /** @type {HTMLFormElement} */ (line.form).requestSubmit();
        expect(n.status.panel).toBe(null);
        expect(textarea(n.element).selectionStart).toBe(8);
        click(n.element, 'find');
        expect(n.status.panel).toBe('find');
        n.element.querySelector('.awn-panel input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(n.status.panel).toBe(null);
    });

    test('undo and redo survive Insert date and Replace all, back to a clean document', async () => {
        const n = mount();
        await n.open({ name: 'a.txt', bytes: enc('cat dog cat') });
        const t = textarea(n.element);
        const key = (k, mods = {}) => t.dispatchEvent(new KeyboardEvent('keydown', {
            key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, bubbles: true, cancelable: true, ...mods
        }));
        // Typed text, then a script edit (F5) that wipes the textarea's own undo.
        t.setSelectionRange(11, 11);
        type(n.element, 'cat dog cat!');
        t.setSelectionRange(12, 12);
        key('F5');
        expect(n.text.startsWith('cat dog cat!')).toBe(true);
        expect(n.text.length).toBeGreaterThan(12);
        key('z', { ctrlKey: true });
        expect(n.text).toBe('cat dog cat!');
        key('z', { ctrlKey: true });
        expect(n.text).toBe('cat dog cat');
        expect(n.status.dirty).toBe(false);
        key('y', { ctrlKey: true });
        expect(n.text).toBe('cat dog cat!');
        expect(n.status.dirty).toBe(true);
        // Replace all is one step.
        click(n.element, 'replace');
        const [query, replacement] = /** @type {HTMLInputElement[]} */ ([...n.element.querySelectorAll('.awn-panel input[type=search], .awn-panel input[type=text]')]);
        query.value = 'cat';
        replacement.value = 'cow';
        /** @type {HTMLButtonElement} */ (n.element.querySelector('[data-action=replaceAll]')).click();
        expect(n.text).toBe('cow dog cow!');
        expect(t.selectionStart).toBe(1);   // the caret stays where the change starts, not at the top
        expect(n.undo()).toBe(true);
        expect(n.text).toBe('cat dog cat!');
        expect(n.redo()).toBe(true);
        expect(n.text).toBe('cow dog cow!');
        // The context menu's Undo goes to the same history.
        const ev = new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true });
        t.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(n.text).toBe('cat dog cat!');
    });

    test('every change reaches onEdit as one delta, and replays to the text', async () => {
        const edits = [];
        const n = mount({ onEdit: (e) => edits.push(e) });
        await n.open({ name: 'a.txt', bytes: enc('abc') });
        const t = textarea(n.element);
        t.setSelectionRange(3, 3);
        t.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'd', bubbles: true, cancelable: true }));
        t.value = 'abcd';
        t.setSelectionRange(4, 4);
        t.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'd', bubbles: true }));
        n.undo();
        let text = 'abc';
        for (const e of edits) text = text.slice(0, e.at) + e.inserted + text.slice(e.at + e.removed.length);
        expect(text).toBe(n.text);
        expect(edits[0]).toMatchObject({ at: 3, removed: '', inserted: 'd', kind: 'type' });
        expect(edits.length).toBe(2);
    });

    test('find marks every match over the text, says which one, and drops the marks on close', async () => {
        const n = mount();
        await n.open({ name: 'a.txt', bytes: enc('a needle, a needle, a needle') });
        const layer = /** @type {HTMLElement} */ (n.element.querySelector('.awn-marks'));
        expect(layer.hidden).toBe(true);
        expect(layer.getAttribute('aria-hidden')).toBe('true');
        click(n.element, 'find');
        const query = /** @type {HTMLInputElement} */ (n.element.querySelector('.awn-panel input[type=search]'));
        query.value = 'needle';
        query.dispatchEvent(new Event('input', { bubbles: true }));
        expect(layer.hidden).toBe(false);                    // marked as typed, caret not moved
        expect(textarea(n.element).selectionStart).toBe(0);
        /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-panel [data-action=next]')).click();
        /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-panel [data-action=next]')).click();
        expect(n.element.querySelector('.awn-panel-msg')?.textContent).toBe('Match 2 of 3');
        /** @type {HTMLButtonElement} */ (n.element.querySelector('.awn-panel [data-action=prev]')).click();
        expect(n.element.querySelector('.awn-panel-msg')?.textContent).toBe('Match 1 of 3');
        query.value = 'bird';
        query.dispatchEvent(new Event('input', { bubbles: true }));
        expect(layer.hidden).toBe(true);
        query.value = 'needle';
        query.dispatchEvent(new Event('input', { bubbles: true }));
        click(n.element, 'find');                            // closes the bar
        expect(n.status.panel).toBe(null);
        expect(layer.hidden).toBe(true);
    });

    test('keyboard: Ctrl+F opens the find bar from the text', () => {
        const n = mount();
        textarea(n.element).dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', ctrlKey: true, bubbles: true }));
        expect(n.status.panel).toBe('find');
    });

    test('word wrap and text size are preferences', () => {
        const prefs = [];
        const n = mount({ wrap: false, zoom: 1.25, onPrefs: (p) => prefs.push(p) });
        expect(textarea(n.element).getAttribute('wrap')).toBe('off');
        click(n.element, 'wrap');
        expect(textarea(n.element).getAttribute('wrap')).toBe('soft');
        expect(/** @type {HTMLElement} */ (n.element.querySelector('[data-action=wrap]')).getAttribute('aria-pressed')).toBe('true');
        click(n.element, 'zoomIn');
        expect(prefs.at(-1)).toEqual({ wrap: true, zoom: 1.5 });
        expect(n.element.style.getPropertyValue('--awn-zoom')).toBe('1.5');
    });

    test('a draft comes back as unsaved changes', () => {
        const n = mount();
        n.restore({ name: 'notes.txt', text: 'kept', encoding: 'utf-8', eol: 'lf' });
        expect(n.text).toBe('kept');
        expect(n.status.name).toBe('notes.txt');
        expect(n.status.dirty).toBe(true);
        expect(n.snapshot()).toEqual({ name: 'notes.txt', text: 'kept', encoding: 'utf-8', eol: 'lf' });
    });

    test('Help: a last toolbar button only when the host takes onHelp', () => {
        expect(mount().element.querySelector('[data-action=help]')).toBeNull();
        let asked = 0;
        const n = mount({ onHelp: () => { asked++; } });
        // The tool buttons; the document's name (rename) sits apart, after them.
        const buttons = [...n.element.querySelectorAll('.awn-bar button[data-action]:not(.awn-name)')];
        expect(buttons.at(-1)?.getAttribute('data-action')).toBe('help');
        expect(buttons.at(-1)?.getAttribute('aria-label')).toBe('Help');
        click(n.element, 'help');
        expect(asked).toBe(1);
    });

    test('setLocale relabels everything', () => {
        const n = mount();
        n.setLocale('fr');
        expect(n.element.getAttribute('lang')).toBe('fr');
        expect(n.element.getAttribute('aria-label')).toBe('Éditeur de texte\u202f: Sans titre');
        expect(/** @type {HTMLElement} */ (n.element.querySelector('[data-action=save]')).getAttribute('title')).toBe('Télécharger une copie (Ctrl+S)');
        expect(n.element.querySelector('.awn-status')?.textContent).toContain('0 caractère');
    });

    test('destroy removes everything', () => {
        const n = mount();
        const host = /** @type {HTMLElement} */ (n.element.parentElement);
        n.destroy();
        mounted.length = 0;
        expect(host.children.length).toBe(0);
    });
});
