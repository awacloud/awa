// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * `readDocument` through a byte source (`{ byteLength, read(offset,
 * length) }`): the document read by windows is the document read from its
 * bytes; the window grows past a long stream; its cap, `recoverXref` and a
 * bad source are refused.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { getRuntime } from '../../tests/_helpers/build.js';

const rt = getRuntime();
const pdf = rt.resolve('pdf');
const { obj } = rt.resolve('pdfParser');
const parserMod = rt.resolve('pdfParser');
const te = new TextEncoder();

/** A byte source over `bytes`, counting its reads and the bytes they return. */
function sourceOf(bytes) {
    const s = {
        byteLength: bytes.length,
        reads: 0,
        bytesRead: 0,
        read(offset, length) {
            s.reads++;
            const out = bytes.slice(offset, offset + length);
            s.bytesRead += out.length;
            return out;
        }
    };
    return s;
}

/** A one-page document whose page content is `content` (a string or bytes), plus `extra` indirects. */
function docBytes(content, extra = []) {
    const data = typeof content === 'string' ? te.encode(content) : content;
    const indirects = [
        { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
        { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
        { num: 3, gen: 0, value: obj.dict({
            Type: obj.name('Page'), Parent: obj.ref(2, 0),
            MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
            Contents: obj.ref(4, 0)
        }) },
        { num: 4, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(data.length) }), data) },
        ...extra
    ];
    return pdf.write({ indirects, root: { num: 1, gen: 0 }, version: '1.7' });
}

/** Every in-use object of `doc`, resolved, by key. */
function objects(doc) {
    const out = {};
    for (const [num, e] of Object.entries(doc.xref.entries)) {
        if (e.free) continue;
        out[num] = doc._raw.resolve({ type: 'ref', num: Number(num), gen: e.gen || 0 });
    }
    return out;
}
const shape = (doc) => ({ version: doc.version, pages: doc.pages.length, catalog: doc.catalog, trailer: doc.trailer, objects: objects(doc) });

const saved = { ...parserMod.parserLimits };
afterEach(() => parserMod.setParserLimits(saved));

describe('pdf.read through a byte source (T6)', () => {
    test('the document read by windows is the document read from its bytes', () => {
        const extra = [{ num: 5, gen: 0, value: obj.dict({ Title: obj.string(te.encode('A title')), Count: obj.int(7) }) }];
        const bytes = docBytes('BT /F1 12 Tf 72 720 Td (Hello) Tj ET', extra);
        const fromBytes = pdf.read(bytes);
        for (const sourceWindow of [16, 64, 1024, undefined]) {
            const src = sourceOf(bytes);
            const doc = pdf.read(src, sourceWindow === undefined ? undefined : { sourceWindow });
            expect(shape(doc)).toEqual(shape(fromBytes));
            expect(doc._raw.source).toBe(src);
            expect(doc._raw.bytes).toBeUndefined();
        }
        expect(fromBytes._raw.bytes).toBe(bytes);
        expect(fromBytes._raw.source).toBeUndefined();
    });

    test('a stream longer than the window is read whole, never cut at an endstream inside it', () => {
        // 200 KiB of content that holds the word endstream early on.
        const body = 'BT (endstream endobj) Tj ET\n' + '0 0 m 1 1 l S\n'.repeat(200 * 1024 / 14);
        const bytes = docBytes(body);
        const src = sourceOf(bytes);
        const doc = pdf.read(src, { sourceWindow: 256 });
        const stream = doc._raw.resolve({ type: 'ref', num: 4, gen: 0 });
        expect(stream.raw.length).toBe(te.encode(body).length);
        expect(shape(doc)).toEqual(shape(pdf.read(bytes)));
    });

    test('a read touches the objects it resolves, not the whole file', () => {
        const big = new Uint8Array(3 * 1024 * 1024).fill(0x41);
        const extra = [{ num: 5, gen: 0, value: obj.stream(obj.dict({ Length: obj.int(big.length) }), big) }];
        const bytes = docBytes('BT (x) Tj ET', extra);
        const src = sourceOf(bytes);
        const doc = pdf.read(src);
        expect(doc.pages.length).toBe(1);
        expect(src.bytesRead).toBeLessThan(bytes.length / 4);
    });

    test('a window past the parser\'s maxStreamBytes + 64 KiB throws pdf/document/source-window', () => {
        parserMod.setParserLimits({ maxStreamBytes: 1024 });
        const bytes = docBytes('0 0 m 1 1 l S\n'.repeat(10000));
        expect(pdf.read(bytes).pages.length).toBe(1);
        const doc = pdf.read(sourceOf(bytes));
        let err;
        try { doc._raw.resolve({ type: 'ref', num: 4, gen: 0 }); } catch (e) { err = e; }
        expect(err && err.code).toBe('pdf/document/source-window');
    });

    test('an xref offset past the source throws pdf/document/bad-offset, as from bytes', () => {
        const bytes = docBytes('BT ET');
        const doc = pdf.read(sourceOf(bytes));
        doc.xref.entries[4] = { ...doc.xref.entries[4], offset: bytes.length + 10 };
        let err;
        try { doc._raw.resolve({ type: 'ref', num: 4, gen: 0 }); } catch (e) { err = e; }
        expect(err && err.code).toBe('pdf/document/bad-offset');
    });

    test('recoverXref with a source reads; a bad source, a bad read and a bad sourceWindow are refused', () => {
        const bytes = docBytes('BT ET');
        const code = (f) => { try { f(); } catch (e) { return e.code; } return null; };
        // Since T30 (b) a source may rebuild: it is read whole on a failed chain.
        expect(pdf.read(sourceOf(bytes), { recoverXref: true }).pages.length).toBe(1);
        for (const bad of [{}, { byteLength: -1, read() {} }, { byteLength: 1.5, read() {} }, { byteLength: 10 }, 'x', null]) {
            expect(code(() => pdf.read(bad))).toBe('pdf/document/bad-input');
        }
        expect(code(() => pdf.read({ byteLength: bytes.length, read: () => 'abc' }))).toBe('pdf/document/bad-source-read');
        for (const w of [0, 15, 1.5, '64', -64]) {
            expect(code(() => pdf.read(sourceOf(bytes), { sourceWindow: w }))).toBe('pdf/document/bad-source-window-option');
        }
        expect(code(() => pdf.read(bytes, { sourceWindow: 64 }))).toBeNull();
    });
});
