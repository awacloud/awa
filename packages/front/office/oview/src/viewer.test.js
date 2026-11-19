// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `mountViewer()` end to end in Happy-DOM: the empty state,
 * opening documents, paging, zoom, errors, locale switching, the WAI-ARIA
 * toolbar and `destroy()`.
 *
 * @module oview/viewer.test
 */
import '../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect, afterEach } from 'bun:test';
import { corpus, fixture, withPart } from '../tests/context.js';
import { mountViewer, MAX_DOCUMENT_BYTES } from './viewer.js';
import { MAX_TEXT_CHARS } from './render/text.js';
import { createUrlPool } from './render/view.js';

const enc = (s) => new TextEncoder().encode(s);
/** @type {ReturnType<typeof mountViewer>[]} */
const mounted = [];
function mount(opts = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const v = mountViewer(host, { locale: 'en', ...opts });
    mounted.push(v);
    return v;
}
afterEach(() => { for (const v of mounted.splice(0)) v.destroy(); document.body.replaceChildren(); });

describe('mountViewer', () => {
    test('empty state: a named region, a toolbar, the dropzone', () => {
        const v = mount();
        const el = v.element;
        expect(el.getAttribute('role')).toBe('region');
        expect(el.getAttribute('aria-label')).toBe('Document viewer');
        expect(el.dataset.state).toBe('empty');
        const bar = /** @type {HTMLElement} */ (el.querySelector('[role=toolbar]'));
        expect(bar.getAttribute('aria-label')).toBe('Document tools');
        // Only "Open" is reachable before a document is open.
        const visible = [...bar.querySelectorAll('button')].filter((b) => !b.closest('[hidden]') && !b.hidden);
        expect(visible.map((b) => b.getAttribute('aria-label'))).toEqual(['Open a document']);
        expect(visible[0].tabIndex).toBe(0);
        expect(el.querySelector('.awv-dropzone')?.textContent).toContain('Your file stays on this device.');
        expect(el.querySelector('input[type=file]')?.getAttribute('accept')).toContain('.docx');
        // The picker itself stays out of the accessibility tree: Open and the dropzone operate it.
        expect(el.querySelector('input[type=file]')?.getAttribute('aria-hidden')).toBe('true');
        // No empty scroll box in the tab order before the dropzone.
        expect(/** @type {HTMLElement} */ (el.querySelector('.awv-stage')).tabIndex).toBe(-1);
    });

    test('opening a text file shows it and names the region after it', async () => {
        const v = mount();
        expect(await v.open({ name: 'notes.txt', bytes: enc('hello') })).toBe(true);
        expect(v.status.state).toBe('ready');
        expect(v.status.format).toBe('text');
        expect(v.element.getAttribute('aria-label')).toBe('Document viewer: notes.txt');
        expect(v.element.querySelector('pre')?.textContent).toBe('hello');
        expect(/** @type {HTMLElement} */ (v.element.querySelector('.awv-stage')).tabIndex).toBe(0);
        // The document controls appear; the pager stays hidden for a flow view.
        expect(/** @type {HTMLElement} */ (v.element.querySelector('[data-action=zoomIn]')).closest('[hidden]')).toBe(null);
        expect(/** @type {HTMLElement} */ (v.element.querySelector('.awv-group--pager')).hidden).toBe(true);
    });

    test('a slide deck pages with the toolbar', async () => {
        const v = mount();
        await v.open({ name: 'deck.pptx', bytes: corpus('pptx/poi-sampleshow.pptx') });
        expect(v.status.count).toBe(2);
        const pager = /** @type {HTMLElement} */ (v.element.querySelector('.awv-group--pager'));
        expect(pager.hidden).toBe(false);
        expect(pager.textContent).toContain('of 2');
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=next]')).click();
        expect(v.status.page).toBe(1);
        expect(/** @type {HTMLInputElement} */ (v.element.querySelector('.awv-page-input')).value).toBe('2');
        expect(/** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=next]')).disabled).toBe(true);
    });

    test('a pager button disabled under the keyboard hands the focus to the other one', async () => {
        const v = mount();
        await v.open({ name: 'deck.pptx', bytes: corpus('pptx/poi-sampleshow.pptx') });
        const next = /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=next]'));
        const prev = /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=prev]'));
        next.focus();
        next.click();
        expect(next.disabled).toBe(true);
        // Booleans, not elements: a failing element diff serialises the whole DOM.
        expect(document.activeElement === prev).toBe(true);
        expect(prev.tabIndex).toBe(0);
        prev.click();
        expect(prev.disabled).toBe(true);
        expect(document.activeElement === next).toBe(true);
    });

    test('zoom steps through the presets', async () => {
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('# A') });
        const before = v.status.zoom;
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=zoomIn]')).click();
        expect(v.status.zoom).toBeGreaterThan(before);
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=zoomOut]')).click();
        expect(v.status.zoom).toBe(before);
    });

    test('a legacy binary is explained, not attempted', async () => {
        const v = mount();
        const cfb = new Uint8Array(1024);
        cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        expect(await v.open({ name: 'old.doc', bytes: cfb })).toBe(false);
        const alert = /** @type {HTMLElement} */ (v.element.querySelector('[role=alert]'));
        expect(alert.textContent).toContain('older Microsoft Office file');
        expect(alert.querySelector('small')?.textContent).toBe('E_LEGACY_FORMAT');
        expect(alert.querySelector('button')?.textContent).toBe('Try another file');
    });

    test('an unreadable document reports a read error with its format', async () => {
        const errors = [];
        const v = mount({ onError: (e) => errors.push(e) });
        expect(await v.open({ name: 'broken.pdf', bytes: enc('%PDF-1.7\ngarbage') })).toBe(false);
        expect(v.element.querySelector('[role=alert] p')?.textContent).toBe('This file could not be read. It may be damaged, or not a real PDF document.');
        expect(errors).toHaveLength(1);
    });

    test('a document past a reader limit is reported as too large or too complex, with its code', async () => {
        const deep = '<w:customXml w:element="x">'.repeat(1100) + '</w:customXml>'.repeat(1100);
        const bytes = withPart(fixture('rich.docx'), 'word/document.xml', (x) => x.replace('<w:body>', `<w:body>${deep}`));
        const v = mount();
        expect(await v.open({ name: 'deep.docx', bytes })).toBe(false);
        const alert = /** @type {HTMLElement} */ (v.element.querySelector('[role=alert]'));
        expect(alert.querySelector('p')?.textContent).toBe('This document is too large or too complex for the viewer: opening it would take too much memory or time.');
        expect(alert.querySelector('small')?.textContent).toBe('opc/xml-too-deep');
    });

    test('an empty file', async () => {
        const v = mount();
        await v.open({ name: 'empty.txt', bytes: new Uint8Array(0) });
        expect(v.element.querySelector('[role=alert] small')?.textContent).toBe('E_EMPTY');
    });

    test('setLocale relabels everything', async () => {
        const v = mount();
        v.setLocale('fr');
        expect(v.element.getAttribute('lang')).toBe('fr');
        expect(v.element.querySelector('[data-action=open]')?.getAttribute('aria-label')).toBe('Ouvrir un document');
        expect(v.element.querySelector('.awv-dropzone')?.textContent).toContain('Votre fichier reste sur cet appareil.');
    });

    test('the toolbar is one tab stop; arrows move inside it', async () => {
        const v = mount();
        await v.open({ name: 'a.txt', bytes: enc('x') });
        const bar = /** @type {HTMLElement} */ (v.element.querySelector('[role=toolbar]'));
        const open = /** @type {HTMLButtonElement} */ (bar.querySelector('[data-action=open]'));
        open.focus();
        open.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const close = /** @type {HTMLButtonElement} */ (bar.querySelector('[data-action=close]'));
        expect(document.activeElement === close).toBe(true);
        const stops = [...bar.querySelectorAll('button, input, select')].filter((c) => /** @type {HTMLElement} */ (c).tabIndex === 0);
        expect(stops).toHaveLength(1);
    });

    test('close returns to the dropzone; destroy removes the region', async () => {
        const v = mount();
        await v.open({ name: 'a.txt', bytes: enc('x') });
        v.close();
        expect(v.status.state).toBe('empty');
        expect(v.element.querySelector('.awv-dropzone')).not.toBe(null);
        const host = /** @type {HTMLElement} */ (v.element.parentElement);
        v.destroy();
        expect(host.querySelector('.awv')).toBe(null);
        mounted.splice(mounted.indexOf(v), 1);
    });

    test('an unreadable source ends in an error, never stuck loading', async () => {
        const v = mount();
        const blob = new Blob(['x']);
        blob.arrayBuffer = () => Promise.reject(new Error('revoked'));
        expect(await v.open(blob)).toBe(false);
        expect(v.status.state).toBe('error');
        expect(v.element.querySelector('[role=alert] small')?.textContent).toBe('E_FILE');
        // The device could not hand the file over: say so, not "damaged" nor a format.
        const message = v.element.querySelector('[role=alert]')?.textContent || '';
        expect(message).toContain('could not be read from your device');
        expect(message).not.toContain('Unknown file type');
    });

    test('close and a failed open drop the previous document from the details panel', async () => {
        const v = mount();
        const body = () => /** @type {HTMLElement} */ (v.element.querySelector('.awv-info-body'));
        await v.open({ name: 'a.txt', bytes: enc('x') });
        expect(body().textContent).toContain('a.txt');
        v.close();
        expect(body().childNodes.length).toBe(0);
        await v.open({ name: 'b.txt', bytes: enc('y') });
        expect(body().textContent).toContain('b.txt');
        const blob = new Blob(['x']);
        blob.arrayBuffer = () => Promise.reject(new Error('revoked'));
        await v.open(blob);
        expect(body().childNodes.length).toBe(0);
        // A relabel (locale switch) does not bring it back either.
        v.setLocale('fr');
        expect(body().textContent).not.toContain('b.txt');
    });

    test('a new document drops the previous sheet tabs', async () => {
        const v = mount();
        await v.open({ name: 'book.xlsx', bytes: fixture('rich.xlsx') });
        expect(/** @type {HTMLElement} */ (v.element.querySelector('.awv-tabbar')).hidden).toBe(false);
        await v.open({ name: 'broken.pdf', bytes: enc('%PDF-1.7 garbage') });
        expect(/** @type {HTMLElement} */ (v.element.querySelector('.awv-tabbar')).hidden).toBe(true);
        expect(v.element.querySelectorAll('[role=tab]').length).toBe(0);
    });

    test('page keys leave sheets and flowing documents to native scrolling', async () => {
        const v = mount();
        await v.open({ name: 'book.xlsx', bytes: fixture('rich.xlsx') });
        const stage = /** @type {HTMLElement} */ (v.element.querySelector('.awv-stage'));
        const e = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
        stage.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(false);
        expect(v.status.page).toBe(0);
    });

    test('each document opens at 100 % whatever the previous zoom', async () => {
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('# A') });
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=zoomIn]')).click();
        expect(v.status.zoom).toBeGreaterThan(1);
        await v.open({ name: 'b.md', bytes: enc('# B') });
        expect(v.status.zoom).toBe(1);
    });

    test('a malformed in-document anchor is ignored, not thrown', async () => {
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('[bad](#%E0%A4%A) [ok](#x)') });
        // Its href took the viewer's prefix (anchorIds); the malformed escape is kept as written.
        const a = /** @type {HTMLAnchorElement} */ ([...v.element.querySelectorAll('a[href^="#"]')].find((x) => x.textContent === 'bad'));
        expect(a.getAttribute('href')).toMatch(/^#awv-[0-9a-z]+-%E0%A4/);
        const errors = [];
        const onError = (e) => errors.push(e);
        window.addEventListener('error', onError);
        const e = new MouseEvent('click', { bubbles: true, cancelable: true });
        a.dispatchEvent(e);
        window.removeEventListener('error', onError);
        expect(errors).toHaveLength(0);
        expect(e.defaultPrevented).toBe(true);
    });

    test('a source error after a document resets the document state', async () => {
        const v = mount();
        await v.open({ name: 'deck.pptx', bytes: corpus('pptx/poi-sampleshow.pptx') });
        v.showSourceError('remote.pdf', 'E_HTTP_404');
        expect(v.status.state).toBe('error');
        expect(v.status.format).toBe(null);
        expect(v.status.count).toBe(0);
        expect(/** @type {HTMLElement} */ (v.element.querySelector('.awv-group--pager')).hidden).toBe(true);
    });

    test('several files dropped at once: the first opens, the others go to the host', async () => {
        const more = [];
        const v = mount({ onMore: (files) => more.push(...files.map((f) => f.name)) });
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.md'), new File(['c'], 'c.txt')];
        Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files } });
        v.element.dispatchEvent(drop);
        await new Promise((r) => setTimeout(r, 20));
        expect(v.status.state).toBe('ready');
        expect(v.element.querySelector('pre')?.textContent).toBe('a');
        expect(more).toEqual(['b.md', 'c.txt']);
        // The picker takes several files too.
        expect(v.element.querySelector('input[type=file]')?.hasAttribute('multiple')).toBe(true);
    });

    test('a document over the size limit is refused before it is read', async () => {
        const v = mount();
        let read = false;
        class Huge extends File {
            get size() { return MAX_DOCUMENT_BYTES + 1; }
            arrayBuffer() { read = true; return super.arrayBuffer(); }
        }
        expect(await v.open(new Huge(['x'], 'huge.pdf'))).toBe(false);
        expect(read).toBe(false);
        expect(v.element.querySelector('[role=alert] small')?.textContent).toBe('E_TOO_BIG');
    });

    test('opening says so at once, before a slow source is read, and the old document is gone', async () => {
        const v = mount();
        await v.open({ name: 'old.txt', bytes: enc('old text') });
        /** @type {(b: ArrayBuffer) => void} */
        let release = () => {};
        const slow = new File(['new text'], 'slow.txt');
        slow.arrayBuffer = () => new Promise((resolve) => { release = resolve; });
        const opening = v.open(slow);
        expect(v.status.state).toBe('loading');
        expect(v.element.querySelector('pre')).toBe(null);
        expect(v.element.querySelector('.awv-progress')?.textContent).toContain('slow.txt');
        release(new TextEncoder().encode('new text').buffer);
        expect(await opening).toBe(true);
        expect(v.element.querySelector('pre')?.textContent).toBe('new text');
    });

    test('a host callback that throws never breaks the viewer', async () => {
        const v = mount({ onOpen: () => { throw new Error('host bug'); } });
        const saved = console.error;
        console.error = () => {};
        try {
            expect(await v.open({ name: 'a.txt', bytes: enc('x') })).toBe(true);
        } finally {
            console.error = saved;
        }
        expect(v.status.state).toBe('ready');
    });

    test('a very long text shows its start and reports the rest', async () => {
        const v = mount();
        const big = 'x'.repeat(MAX_TEXT_CHARS + 10);
        await v.open({ name: 'big.log', bytes: enc(big) });
        expect(v.element.querySelector('pre')?.textContent?.length).toBe(MAX_TEXT_CHARS);
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=info]')).click();
        expect(v.element.querySelector('.awv-info')?.textContent).toContain('the end of a very long text');
    });

    test('SVG pictures are data: URLs (no same-origin document), others object URLs', () => {
        const pool = createUrlPool();
        const svg = pool.add(enc('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
        expect(svg.startsWith('data:image/svg+xml;base64,')).toBe(true);
        expect(atob(svg.slice(svg.indexOf(',') + 1))).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
        expect(pool.add(enc('png'), 'image/png').startsWith('blob:')).toBe(true);
        pool.dispose();
    });

    test('a README table of contents scrolls to its headings, never to the host page', async () => {
        const decoy = document.createElement('h2');
        decoy.id = 'quick-start';
        document.body.append(decoy);
        let hostScrolled = false;
        decoy.scrollIntoView = () => { hostScrolled = true; };
        const v = mount();
        await v.open({ name: 'README.md', bytes: enc('# Tool\n\n- [Quick start](#quick-start)\n\n## Quick start\n\nText.\n\n## Quick start\n') });
        const link = /** @type {HTMLAnchorElement} */ (v.element.querySelector('a[href^="#"]'));
        const headings = [...v.element.querySelectorAll('.awv-prose [id]')].map((el) => el.id);
        expect(link.getAttribute('href')).toBe(`#${headings[1]}`);
        expect(headings[1].endsWith('-quick-start')).toBe(true);
        expect(headings[2].endsWith('-quick-start-1')).toBe(true);   // duplicates numbered, as GitHub does
        const target = /** @type {HTMLElement} */ (v.element.querySelector(`[id="${headings[1]}"]`));
        let scrolled = false;
        target.scrollIntoView = () => { scrolled = true; };
        link.click();
        expect(scrolled).toBe(true);
        expect(hostScrolled).toBe(false);
        decoy.remove();
    });

    test('samples are offered under the dropzone; one opens, its details say it is a sample', async () => {
        const loaded = [];
        const v = mount({
            samples: [
                { label: 'Markdown', load: async () => { loaded.push('md'); return new File(['# Hello'], 'awa-markdown.md'); } },
                { label: 'Broken', load: async () => { throw new Error('offline'); } }
            ]
        });
        const buttons = [...v.element.querySelectorAll('.awv-samples button')];
        expect(buttons.map((b) => b.textContent)).toEqual(['Markdown', 'Broken']);
        expect(v.element.querySelector('.awv-samples')?.textContent).toContain('No document at hand? Try a sample:');
        /** @type {HTMLButtonElement} */ (buttons[0]).click();
        await new Promise((r) => setTimeout(r, 30));
        expect(loaded).toEqual(['md']);
        expect(v.status.state).toBe('ready');
        /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=info]')).click();
        expect(v.element.querySelector('.awv-info')?.textContent).toContain('Sample provided by AwaCloud');
        // A user's own file says nothing of the kind.
        await v.open({ name: 'mine.txt', bytes: enc('x') });
        expect(v.element.querySelector('.awv-info')?.textContent).not.toContain('Sample provided by AwaCloud');
        // A sample that cannot load is an error, not a stuck state.
        v.close();
        /** @type {HTMLButtonElement} */ ([...v.element.querySelectorAll('.awv-samples button')][1]).click();
        await new Promise((r) => setTimeout(r, 30));
        expect(v.status.state).toBe('error');
        expect(v.element.querySelector('[role=alert] small')?.textContent).toBe('E_SAMPLE');
    });

    test('Help: a last toolbar button, shown even before a document, only when the host takes onHelp', () => {
        expect(mount().element.querySelector('[data-action=help]')?.closest('[hidden]')).toBeTruthy();
        let asked = 0;
        const v = mount({ onHelp: () => { asked++; } });
        const visible = [...v.element.querySelectorAll('[role=toolbar] button')].filter((b) => !b.closest('[hidden]') && !b.hidden);
        expect(visible.map((b) => b.getAttribute('data-action'))).toEqual(['open', 'help']);
        expect(visible[1].getAttribute('aria-label')).toBe('Help');
        /** @type {HTMLButtonElement} */ (visible[1]).click();
        expect(asked).toBe(1);
    });

    test('two viewers on one page do not share ids', () => {
        const a = mount();
        const b = mount();
        expect(a.element.id).not.toBe(b.element.id);
        expect(document.querySelectorAll(`#${a.element.id}-stage`).length).toBe(1);
    });
});

describe('zoom keys', () => {
    /**
     * @param {HTMLElement} target
     * @param {KeyboardEventInit} init
     */
    const press = (target, init) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(e);
        return e;
    };
    const opened = async () => {
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('# A') });
        return v;
    };

    test('+ (Shift + Equal), = and - step the zoom, 0 resets it; each key is consumed', async () => {
        const v = await opened();
        const plus = press(v.element, { key: '+', code: 'Equal', shiftKey: true });
        const up = v.status.zoom;
        expect(up).toBeGreaterThan(1);
        expect(plus.defaultPrevented).toBe(true);
        const minus = press(v.element, { key: '-', code: 'Minus' });
        expect(v.status.zoom).toBe(1);
        expect(minus.defaultPrevented).toBe(true);
        const equal = press(v.element, { key: '=', code: 'Equal' });
        expect(v.status.zoom).toBe(up);
        expect(equal.defaultPrevented).toBe(true);
        const zero = press(v.element, { key: '0', code: 'Digit0' });
        expect(v.status.zoom).toBe(1);
        expect(zero.defaultPrevented).toBe(true);
    });

    test('with Ctrl the browser keeps its page zoom: no change, not consumed', async () => {
        const v = await opened();
        for (const key of ['+', '=', '-', '0']) {
            const e = press(v.element, { key, ctrlKey: true });
            expect(e.defaultPrevented).toBe(false);
        }
        expect(v.status.zoom).toBe(1);
    });

    test('on the empty state nothing changes and nothing is consumed', () => {
        const v = mount();
        const e = press(v.element, { key: '+', code: 'Equal', shiftKey: true });
        expect(v.status.state).toBe('empty');
        expect(v.status.zoom).toBe(1);
        expect(e.defaultPrevented).toBe(false);
    });

    test('typing in the toolbar page field keeps its keys', async () => {
        const v = await opened();
        const field = /** @type {HTMLInputElement} */ (v.element.querySelector('.awv-page-input'));
        const e = press(field, { key: '+', code: 'Equal', shiftKey: true });
        expect(v.status.zoom).toBe(1);
        expect(e.defaultPrevented).toBe(false);
    });
});

describe('file intake through fw', () => {
    const dropOf = (files) => {
        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files } });
        return drop;
    };

    test('a drop on the region opens the first file and hands the rest to onMore', async () => {
        const more = [];
        const v = mount({ onMore: (files) => more.push(...files.map((f) => f.name)) });
        v.element.dispatchEvent(dropOf([new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]));
        await new Promise((r) => setTimeout(r, 20));
        expect(v.status.state).toBe('ready');
        expect(more).toEqual(['b.txt']);
    });

    test('the dropzone is in the tab order and Enter opens the picker', () => {
        const v = mount();
        const zone = /** @type {HTMLElement} */ (v.element.querySelector('.awv-dropzone'));
        expect(zone.tabIndex).toBe(0);
        const input = /** @type {HTMLInputElement} */ (v.element.querySelector('input[type=file]'));
        let clicks = 0;
        input.click = () => { clicks++; };
        const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        zone.dispatchEvent(e);
        expect(clicks).toBe(1);
        expect(e.defaultPrevented).toBe(true);
    });

    test('destroy() unwires the drop', async () => {
        const v = mount();
        v.destroy();
        v.element.dispatchEvent(dropOf([new File(['a'], 'a.txt')]));
        await new Promise((r) => setTimeout(r, 20));
        expect(v.status.state).toBe('empty');
    });
});

describe('copy with formatting', () => {
    /**
     * A browser clipboard stand-in, installed BEFORE the viewer mounts (fw
     * reads `navigator.clipboard` once, at factory time). Like the browser, a
     * rich write commits only when every flavour of the item resolves.
     * @param {{rich?: boolean, text?: boolean, fail?: boolean}} [o] `fail`:
     *   every write rejects, nothing committed.
     */
    function installClipboard({ rich = true, text = true, fail = false } = {}) {
        const saved = {
            own: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
            item: Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem')
        };
        const log = { writes: [], texts: [], committed: [], settled: [] };
        const clip = {};
        if (rich) {
            clip.write = async (items) => {
                const data = {};
                log.writes.push(items);
                if (fail) throw new Error('clipboard: write refused');
                for (const [type, pending] of Object.entries(items[0].data)) {
                    data[type] = await (await pending).text();
                    log.settled.push(type);
                }
                log.committed.push(data);
            };
            globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
        } else {
            delete globalThis.ClipboardItem;
        }
        if (text) clip.writeText = async (s) => { if (fail) throw new Error('clipboard: write refused'); log.texts.push(s); };
        Object.defineProperty(navigator, 'clipboard', { value: rich || text ? clip : undefined, configurable: true });
        const restore = () => {
            if (saved.own) Object.defineProperty(navigator, 'clipboard', saved.own); else delete navigator.clipboard;
            if (saved.item) Object.defineProperty(globalThis, 'ClipboardItem', saved.item); else delete globalThis.ClipboardItem;
        };
        return { log, restore };
    }
    /** @type {(() => void)[]} */
    const restores = [];
    afterEach(() => { for (const r of restores.splice(0)) r(); });
    const withClipboard = (o) => { const c = installClipboard(o); restores.push(c.restore); return c.log; };

    /** What the screen reader was told. */
    const said = () => [...document.querySelectorAll('[data-fw-a11y]')].map((e) => e.textContent).join(' | ');
    /** Wait for a condition (a copy settles behind promises), at most `ms`. */
    const until = async (cond, ms = 8000) => {
        const end = Date.now() + ms;
        while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
        expect(cond()).toBe(true);
    };
    /** A copy is over once the screen reader has been told how it ended. */
    const over = () => /copied|could not be copied/i.test(said().replace('Copying…', ''));
    const button = (v) => /** @type {HTMLButtonElement} */ (v.element.querySelector('[data-action=copy]'));
    const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
    const press = (v, init) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        v.element.dispatchEvent(e);
        return e;
    };

    test('the button follows the document state, and is named in both locales', async () => {
        withClipboard();
        const v = mount();
        expect(button(v).disabled).toBe(true);
        expect(button(v).closest('[hidden]')).not.toBe(null);
        await v.open({ name: 'a.md', bytes: enc('# A') });
        expect(button(v).closest('[hidden]')).toBe(null);
        expect(button(v).hidden).toBe(false);
        expect(button(v).disabled).toBe(false);
        expect(button(v).getAttribute('aria-label')).toBe('Copy with formatting');
        expect(button(v).getAttribute('title')).toBe('Copy with formatting');
        v.setLocale('fr');
        expect(button(v).getAttribute('aria-label')).toBe('Copier avec la mise en forme');
        expect(button(v).getAttribute('title')).toBe('Copier avec la mise en forme');
        v.close();
        expect(button(v).disabled).toBe(true);
    });

    test('with no clipboard at all (an insecure context) the button is not shown', async () => {
        withClipboard({ rich: false, text: false });
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('# A') });
        expect(button(v).hidden).toBe(true);
        // Nor does the shortcut do anything.
        const e = press(v, { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
        expect(e.defaultPrevented).toBe(false);
    });

    test('rich write is called before any conversion settles (the gesture rule)', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'report.pdf', bytes: corpus('pdf-tagged/tagged-structured.pdf') });
        button(v).click();
        // Synchronously: the item is handed over, with its flavours still pending.
        expect(log.writes).toHaveLength(1);
        expect(Object.keys(log.writes[0][0].data).sort()).toEqual(['text/html', 'text/plain']);
        expect(log.settled).toEqual([]);
        expect(log.committed).toEqual([]);
        await until(over);
        expect(log.committed).toHaveLength(1);
        expect(said()).toContain('Document copied');
    });

    test('a pdf yields headings in the HTML flavour and Markdown without its ledger in the text', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'report.pdf', bytes: corpus('pdf-tagged/tagged-structured.pdf') });
        button(v).click();
        await until(over);
        const { 'text/html': html, 'text/plain': text } = log.committed[0];
        const doc = parse(html);
        expect(doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length).toBeGreaterThanOrEqual(2);
        expect(doc.querySelector('h1')?.textContent).toBe('Quarterly Report');
        expect(doc.querySelector('p')?.textContent).toContain('summarizes the quarter');
        expect(text).toContain('# Quarterly Report');
        expect(text).not.toContain('profile: v1');
        expect(text).not.toContain('sourceSha256');
    });

    test('a docx yields a table, emphasis and a list', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'rich.docx', bytes: fixture('rich.docx') });
        button(v).click();
        await until(over);
        const doc = parse(log.committed[0]['text/html']);
        expect(doc.querySelector('table')).not.toBe(null);
        expect(doc.querySelector('table tr')).not.toBe(null);
        expect(doc.querySelector('strong')).not.toBe(null);
        expect(doc.querySelector('em')).not.toBe(null);
        expect(doc.querySelector('li')).not.toBe(null);
        expect(doc.querySelector('h1')).not.toBe(null);
    });

    test('Markdown keeps its links and goes through no converter', async () => {
        const log = withClipboard();
        const v = mount();
        const src = '# Notes\n\nSee [the site](https://example.org/a) and *this*.\n\n- one\n- two\n';
        await v.open({ name: 'n.md', bytes: enc(src) });
        button(v).click();
        await until(over);
        const doc = parse(log.committed[0]['text/html']);
        expect(doc.querySelector('h1')?.textContent).toBe('Notes');
        expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.org/a');
        expect(doc.querySelectorAll('li')).toHaveLength(2);
        expect(log.committed[0]['text/plain']).toBe(src);
    });

    test('plain text is copied in a <pre>', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'n.txt', bytes: enc('a <b> c') });
        button(v).click();
        await until(over);
        expect(parse(log.committed[0]['text/html']).querySelector('pre')?.textContent).toBe('a <b> c');
        expect(log.committed[0]['text/plain']).toBe('a <b> c');
    });

    test('pictures of a docx travel as data: URLs; a pdf with dropped pictures says so', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'images.docx', bytes: fixture('images.docx') });
        button(v).click();
        await until(over);
        const imgs = [...parse(log.committed[0]['text/html']).querySelectorAll('img')];
        expect(imgs.length).toBeGreaterThan(0);
        for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^data:image\//);
        const v2 = mount();
        await v2.open({ name: 'images.pdf', bytes: fixture('images.pdf') });
        button(v2).click();
        await until(() => log.committed.length === 2 && /Images were left out/.test(said()));
        expect(parse(log.committed[1]['text/html']).querySelector('img')).toBe(null);
        expect(said()).toContain('Images were left out');
    });

    test('without rich write the Markdown is copied as text, and the user is told', async () => {
        const log = withClipboard({ rich: false });
        const v = mount();
        await v.open({ name: 'report.pdf', bytes: corpus('pdf-tagged/tagged-structured.pdf') });
        button(v).click();
        expect(log.texts).toEqual([]);   // after the conversion, not before
        await until(over);
        expect(log.texts).toHaveLength(1);
        expect(log.texts[0]).toContain('# Quarterly Report');
        expect(log.texts[0]).not.toContain('profile: v1');
        expect(said()).toContain('Copied as text');
    });

    // T30 (c): the converter opens a file whose user password is empty, as the
    // viewer does, so an owner-only RC4 pdf now copies.
    test('an owner-only RC4 pdf copies: the converter opens it with the empty password', async () => {
        const log = withClipboard();
        const v = mount();
        expect(await v.open({ name: 'locked.pdf', bytes: fixture('owner-only-rc4.pdf') })).toBe(true);
        button(v).click();
        await until(over);
        expect(log.committed).toHaveLength(1);
        expect(said()).not.toContain('could not be copied');
    });

    test('a failed copy is announced and leaves the clipboard untouched', async () => {
        const log = withClipboard({ fail: true });
        const v = mount();
        expect(await v.open({ name: 'locked.pdf', bytes: fixture('owner-only-rc4.pdf') })).toBe(true);
        button(v).click();
        await until(over);
        expect(log.committed).toEqual([]);
        expect(log.texts).toEqual([]);
        expect(said()).toContain('could not be copied');
        // The viewer is still usable, and the button works again.
        expect(button(v).disabled).toBe(false);
        // The card shows the failure too.
        const card = /** @type {HTMLElement} */ (v.element.querySelector('.awv-toast'));
        expect(card.hidden).toBe(false);
        expect(card.dataset.tone).toBe('error');
        expect(card.textContent).toBe('The document could not be copied.');
    });

    test('a card shows the copy on screen: busy at once, then the outcome', async () => {
        withClipboard();
        const v = mount();
        await v.open({ name: 'a.md', bytes: enc('# A') });
        const card = /** @type {HTMLElement} */ (v.element.querySelector('.awv-toast'));
        expect(card.hidden).toBe(true);
        // Silent for screen readers: the live region already speaks.
        expect(card.getAttribute('aria-hidden')).toBe('true');
        button(v).click();
        expect(card.hidden).toBe(false);
        expect(card.dataset.tone).toBe('busy');
        expect(card.textContent).toBe('Copying…');
        await until(over);
        await until(() => card.dataset.tone === 'done');
        expect(card.textContent).toBe('Document copied.');
        v.setLocale('fr');
        button(v).click();
        await until(() => card.textContent === 'Document copié.');
        v.destroy();
        expect(card.isConnected).toBe(false);
    });

    test('a second press while a copy runs is ignored', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'report.pdf', bytes: corpus('pdf-tagged/tagged-structured.pdf') });
        button(v).click();
        button(v).click();
        expect(log.writes).toHaveLength(1);
        await until(() => log.committed.length === 1 && button(v).disabled === false);
        await new Promise((r) => setTimeout(r, 20));
        button(v).click();
        expect(log.writes).toHaveLength(2);
        await until(() => log.committed.length === 2);
    });

    test('Ctrl+Shift+C and Cmd+Shift+C copy; plain Ctrl+C stays the browser selection copy', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'n.md', bytes: enc('# N') });
        const plain = press(v, { key: 'c', code: 'KeyC', ctrlKey: true });
        expect(plain.defaultPrevented).toBe(false);
        expect(log.writes).toHaveLength(0);
        const ctrl = press(v, { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
        expect(ctrl.defaultPrevented).toBe(true);
        expect(log.writes).toHaveLength(1);
        await until(() => log.committed.length === 1);
        await new Promise((r) => setTimeout(r, 20));
        const meta = press(v, { key: 'C', code: 'KeyC', metaKey: true, shiftKey: true });
        expect(meta.defaultPrevented).toBe(true);
        expect(log.writes).toHaveLength(2);
        await until(() => log.committed.length === 2);
    });

    test('on the empty state the shortcut does nothing', () => {
        const log = withClipboard();
        const v = mount();
        const e = press(v, { key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
        expect(log.writes).toHaveLength(0);
        expect(e.defaultPrevented).toBe(false);
    });

    test('the shortcut keeps its keys while typing in a field', async () => {
        const log = withClipboard();
        const v = mount();
        await v.open({ name: 'n.md', bytes: enc('# N') });
        const field = /** @type {HTMLInputElement} */ (v.element.querySelector('.awv-page-input'));
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
        field.dispatchEvent(e);
        expect(log.writes).toHaveLength(0);
    });
});
