// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The copy module is pure: it turns `(source, engine)` into the
 * two promises the clipboard takes. Every engine here is a stub; the
 * assertions are structural (an element is present), never byte for byte
 * against what the converter writes.
 *
 * @module oview/ui/copy.test
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { buildCopy, stripFrontMatter, sniffImage, MAX_IMAGE_BYTES } from './copy.js';

const enc = (s) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WMF = new Uint8Array([0xd7, 0xcd, 0xc6, 0x9a, 0, 0, 0, 0]);

const FRONT = '---\nprofile: v1\nconvertedAt: 2026-10-26T00:00:00Z\nlossy: false\n---\n';

/** Parse a clipboard HTML flavour like a word processor would. */
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

/**
 * Stub engines. `toMd` and `renderHtml` record their calls.
 * @param {{markdown?: string, assets?: any[], losses?: any[], html?: string, toMd?: Function}} [o]
 */
function engines(o = {}) {
    const calls = { toMd: [], renderHtml: [], engine: [] };
    const oconv = {
        toMd: o.toMd || (async (req) => {
            calls.toMd.push(req);
            return { markdown: o.markdown ?? `${FRONT}# Title\n\nBody *text*.\n`, assets: o.assets || [], losses: o.losses || [] };
        })
    };
    const md = {
        renderHtml(text, opts) {
            calls.renderHtml.push({ text, opts });
            return o.html ?? '<h1>Title</h1><p>Body <em>text</em>.</p>';
        }
    };
    const engine = async (name) => {
        calls.engine.push(name);
        if (name === 'oconv') return { oconv };
        if (name === 'md') return { md };
        throw new Error(`no engine ${name}`);
    };
    return { engine, calls };
}

describe('stripFrontMatter', () => {
    test('drops the leading fence, keeps the body', () => {
        expect(stripFrontMatter(`${FRONT}# A\n`)).toBe('# A\n');
    });
    test('leaves a document without front matter alone', () => {
        expect(stripFrontMatter('# A\n\n---\n\ntext\n')).toBe('# A\n\n---\n\ntext\n');
    });
    test('an unclosed fence is not front matter', () => {
        expect(stripFrontMatter('---\nno end\n')).toBe('---\nno end\n');
    });
    test('handles CRLF', () => {
        expect(stripFrontMatter('---\r\na: 1\r\n---\r\n# A\r\n')).toBe('# A\r\n');
    });
});

describe('sniffImage', () => {
    test('names the raster types a word processor takes', () => {
        expect(sniffImage(PNG)).toBe('image/png');
        expect(sniffImage(JPEG)).toBe('image/jpeg');
        expect(sniffImage(enc('GIF89a....'))).toBe('image/gif');
    });
    test('refuses vector and unknown payloads', () => {
        expect(sniffImage(WMF)).toBe(null);
        expect(sniffImage(enc('<svg xmlns="x"></svg>'))).toBe(null);
        expect(sniffImage(undefined)).toBe(null);
    });
});

describe('buildCopy', () => {
    test('returns its promises at once, before any engine settles', () => {
        let release;
        const gate = new Promise((r) => { release = r; });
        const engine = async (name) => { await gate; return name === 'md' ? { md: { renderHtml: () => '<p>x</p>' } } : { oconv: { toMd: async () => ({ markdown: 'x', assets: [], losses: [] }) } }; };
        const job = buildCopy({ format: 'docx', name: 'a.docx', bytes: enc('x') }, engine);
        expect(job.html).toBeInstanceOf(Promise);
        expect(job.text).toBeInstanceOf(Promise);
        release();
        return Promise.all([job.html, job.text]);
    });

    test('a converted format goes through toMd with a caller-owned timestamp, then md', async () => {
        const { engine, calls } = engines();
        const bytes = enc('PK');
        const job = buildCopy({ format: 'docx', name: 'report.docx', bytes }, engine);
        const [html, text] = await Promise.all([job.html, job.text]);
        expect(calls.toMd).toHaveLength(1);
        expect(calls.toMd[0].name).toBe('report.docx');
        expect(calls.toMd[0].format).toBe('docx');
        expect(calls.toMd[0].bytes).toBe(bytes);
        expect(calls.toMd[0].convertedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
        // The ledger is not pasted: no front matter in either flavour.
        expect(text).toBe('# Title\n\nBody *text*.\n');
        expect(text).not.toContain('profile');
        expect(calls.renderHtml[0].text).toBe(text);
        expect(calls.renderHtml[0].opts.sanitize).toBe(true);
        // A minimal document around the fragment.
        expect(html.startsWith('<!doctype html><meta charset="utf-8"><body>')).toBe(true);
        const doc = parse(html);
        expect(doc.querySelector('h1')?.textContent).toBe('Title');
        expect(doc.querySelector('em')?.textContent).toBe('text');
    });

    test('the timestamp comes from the injected clock', async () => {
        const { engine, calls } = engines();
        const job = buildCopy({ format: 'pdf', name: 'a.pdf', bytes: enc('%PDF') }, engine, { now: () => '2030-01-02T03:04:05.000Z' });
        await job.text;
        expect(calls.toMd[0].convertedAt).toBe('2030-01-02T03:04:05.000Z');
    });

    test('Markdown skips the converter and is copied as written', async () => {
        const { engine, calls } = engines({ html: '<h2>Doc</h2>' });
        const src = '## Doc\n\ntext\n';
        const job = buildCopy({ format: 'md', name: 'a.md', bytes: enc(src) }, engine);
        expect(await job.text).toBe(src);
        expect(await job.html).toContain('<h2>Doc</h2>');
        expect(calls.engine).toEqual(['md']);
        expect(calls.toMd).toHaveLength(0);
    });

    test('plain text is an escaped <pre>, and no engine loads', async () => {
        const { engine, calls } = engines();
        const job = buildCopy({ format: 'text', name: 'a.txt', bytes: enc('a < b && "c" > d') }, engine);
        expect(await job.text).toBe('a < b && "c" > d');
        const html = await job.html;
        const pre = parse(html).querySelector('pre');
        expect(pre?.textContent).toBe('a < b && "c" > d');
        expect(html).not.toContain('a < b');
        expect(calls.engine).toEqual([]);
    });

    test('withHtml: false skips the HTML flavour entirely', async () => {
        const { engine, calls } = engines();
        const job = buildCopy({ format: 'docx', name: 'a.docx', bytes: enc('PK') }, engine, { withHtml: false });
        expect(await job.html).toBe('');
        expect(await job.text).toContain('# Title');
        expect(calls.renderHtml).toHaveLength(0);
        expect(calls.engine).toEqual(['oconv']);
    });

    test('a conversion failure rejects both flavours', async () => {
        const { engine } = engines({ toMd: async () => { throw new Error('document is encrypted'); } });
        const job = buildCopy({ format: 'pdf', name: 'a.pdf', bytes: enc('%PDF') }, engine);
        await expect(job.text).rejects.toThrow('encrypted');
        await expect(job.html).rejects.toThrow('encrypted');
        await expect(job.notes).rejects.toThrow('encrypted');
    });

    test('images the converter hands back are embedded as data: URLs', async () => {
        const { engine } = engines({
            markdown: `${FRONT}A ![pic](<Picture 1>)\n`,
            assets: [{ kind: 'image', name: 'Picture 1', bytes: PNG }],
            html: '<p>A <img src="Picture%201" alt="pic"></p>'
        });
        const job = buildCopy({ format: 'docx', name: 'a.docx', bytes: enc('PK') }, engine);
        const html = await job.html;
        const img = parse(html).querySelector('img');
        expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
        expect(img?.getAttribute('alt')).toBe('pic');
        // The plain flavour carries no bytes.
        expect(await job.text).not.toContain('base64');
        expect(await job.notes).toEqual({ imagesLeftOut: false });
    });

    test('a remote image never reaches the clipboard: its alt text does', async () => {
        const { engine } = engines({
            markdown: 'x', html: '<p><img src="https://tracker.example/p.gif" alt="a banner"></p><p><img src="//x.example/y.png" alt=""></p>'
        });
        const job = buildCopy({ format: 'md', name: 'a.md', bytes: enc('![a banner](https://tracker.example/p.gif)') }, engine);
        const html = await job.html;
        expect(html).not.toContain('tracker.example');
        expect(html).not.toContain('x.example');
        const doc = parse(html);
        expect(doc.querySelector('img')).toBe(null);
        expect(doc.body.textContent).toContain('a banner');
        expect((await job.notes).imagesLeftOut).toBe(true);
    });

    test('an image the browser or a word processor cannot take becomes alt text', async () => {
        const { engine } = engines({
            markdown: 'x', assets: [{ kind: 'image', name: 'Image4', bytes: WMF }],
            html: '<p><img src="Image4" alt="A metafile drawing"></p>'
        });
        const job = buildCopy({ format: 'odt', name: 'a.odt', bytes: enc('PK') }, engine);
        const doc = parse(await job.html);
        expect(doc.querySelector('img')).toBe(null);
        expect(doc.body.textContent).toContain('A metafile drawing');
        expect((await job.notes).imagesLeftOut).toBe(true);
    });

    test('images past the total budget fall back to alt text, in document order', async () => {
        const big = new Uint8Array(6);
        big.set(PNG.subarray(0, 6));
        const { engine } = engines({
            markdown: 'x',
            assets: [{ kind: 'image', name: 'one', bytes: big }, { kind: 'image', name: 'two', bytes: big }],
            html: '<p><img src="one" alt="first"><img src="two" alt="second"></p>'
        });
        const job = buildCopy({ format: 'docx', name: 'a.docx', bytes: enc('PK') }, engine, { maxImageBytes: 8 });
        const doc = parse(await job.html);
        expect(doc.querySelectorAll('img')).toHaveLength(1);
        expect(doc.querySelector('img')?.getAttribute('alt')).toBe('first');
        expect(doc.body.textContent).toContain('second');
        expect((await job.notes).imagesLeftOut).toBe(true);
    });

    test('the default budget is 10 MiB', () => {
        expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    });

    test('a pdf whose images the converter dropped says so in the notes', async () => {
        const { engine } = engines({ losses: [{ code: 'image/dropped', detail: 'J1' }, { code: 'struct/dropped', detail: 'Table' }] });
        const job = buildCopy({ format: 'pdf', name: 'a.pdf', bytes: enc('%PDF') }, engine);
        await job.html;
        expect((await job.notes).imagesLeftOut).toBe(true);
    });

    test('a document with no images reports none left out', async () => {
        const { engine } = engines({ losses: [{ code: 'struct/dropped', detail: 'Table' }] });
        const job = buildCopy({ format: 'pdf', name: 'a.pdf', bytes: enc('%PDF') }, engine);
        expect(await job.notes).toEqual({ imagesLeftOut: false });
    });
});
