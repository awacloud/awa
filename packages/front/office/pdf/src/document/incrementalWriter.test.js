// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the incremental update writer (Gap G4).
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pdfIncrementalWriter } from './incrementalWriter.js';
import { pdfWriter } from './writer.js';
import { pdfDocument } from './document.js';
import { pdfShared } from '../_shared/index.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfTrailer } from '../syntax/trailer.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfCatalog } from './catalog.js';
import { pdfPage } from './page.js';
import { pdfPages } from './pages.js';
import { pdfErrors } from '../errors.js';
import { buildDocument } from '../../tests/_helpers/build.js';

const errors = pdfErrors.factory();
const { RenderError } = errors;
const _shared = pdfShared.factory();
const _tokenizer = pdfTokenizer.factory(errors, _shared);
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const _parser = pdfParser.factory(errors, _parserObj, _tokenizer);
const _xref   = pdfXref.factory(errors, _tokenizer, _parser);
const _trailer = pdfTrailer.factory(errors, _parserObj);
const _serializer = pdfSerializer.factory(errors);
const _catalog = pdfCatalog.factory(errors, _parserObj);
const _page    = pdfPage.factory(errors, _parserObj);
const _pages   = pdfPages.factory(errors, _parserObj);
const { readDocument } = pdfDocument.factory(
    errors, _tokenizer, _parser, _xref, _trailer, _catalog, _page, _pages
);
const { writeDocument } = pdfWriter.factory(errors, _serializer);
const { appendIncremental, appendIncrementalWithOffsets, readBaseTrailer } =
    pdfIncrementalWriter.factory(
        errors, _serializer, _tokenizer, _parser, _xref, _trailer
    );

const td = new TextDecoder('latin1');

/** Committed xref-stream base: two streams, /Root only in the OLDER one. */
function streamBase() {
    return new Uint8Array(readFileSync(new URL(
        '../../tests/_fixtures/real-shapes/xref-stream-update-missing-root.pdf',
        import.meta.url)));
}

describe('appendIncremental — basic', () => {
    test('appends a new object and re-reads with /Prev chain', () => {
        const original = buildDocument({ pages: [''] });
        const docPrev = readDocument(original);

        // Add a new object (num = totalObjs + 1) — an Info dict.
        const prevSize = docPrev.trailer.size;
        const newNum = prevSize; // first free slot
        const out = appendIncremental(original, {
            updates: [
                { num: newNum, gen: 0, value: obj.dict({
                    Title: { type: 'string', value: new TextEncoder().encode('Hello'), syntax: 'literal' }
                }) }
            ],
            info: { num: newNum, gen: 0 }
        });

        // Output starts with original bytes verbatim.
        expect(out.length).toBeGreaterThan(original.length);
        for (let i = 0; i < original.length; i++) {
            expect(out[i]).toBe(original[i]);
        }
        const txt = td.decode(out);
        expect(txt).toContain('/Prev ');
        expect(txt.lastIndexOf('%%EOF') > original.lastIndexOf('%%EOF')).toBe(true);

        // Re-read sees both the original pages and the new info dict.
        const doc = readDocument(out);
        expect(doc.pages.length).toBe(1);
        // /Prev chain followed — at least 2 sections in xref.
        expect(doc.xref.sections.length).toBeGreaterThanOrEqual(2);
        expect(doc.trailer.size).toBeGreaterThanOrEqual(prevSize + 1);
    });

    test('replaces an existing object (catalog) via incremental update', () => {
        const original = buildDocument({ pages: [''] });
        const docPrev = readDocument(original);
        const catNum = docPrev.trailer.root.num;

        // New catalog dict — add /Lang.
        const newCatalog = obj.dict({
            Type: obj.name('Catalog'),
            Pages: obj.ref(2, 0),
            Lang: { type: 'string',
                    value: new TextEncoder().encode('en-US'),
                    syntax: 'literal' }
        });

        const out = appendIncremental(original, {
            updates: [{ num: catNum, gen: 0, value: newCatalog }]
        });

        const doc = readDocument(out);
        // Updated catalog wins — the new section's entry is preferred.
        // Verify by resolving the catalog object and inspecting /Lang.
        const resolved = doc._raw.resolve({
            type: 'ref', num: catNum, gen: 0
        });
        expect(resolved.entries.Lang).toBeDefined();
    });

    test('roundtrip preserves Root from previous trailer', () => {
        const original = buildDocument({ pages: ['BT ET'] });
        const docPrev = readDocument(original);

        // Add an object without specifying root — should inherit.
        const newNum = docPrev.trailer.size + 1;
        const out = appendIncremental(original, {
            updates: [
                { num: newNum, gen: 0, value: obj.dict({
                    Type: obj.name('Metadata')
                }) }
            ]
        });
        const doc = readDocument(out);
        expect(doc.trailer.root.num).toBe(docPrev.trailer.root.num);
    });

    test('rejects missing root when previous trailer unparseable', () => {
        // We can simulate this with bad input: pass random bytes.
        const noisy = new Uint8Array(32);
        for (let i = 0; i < 32; i++) noisy[i] = 0x20;
        expect(() => appendIncremental(noisy, { updates: [] })).toThrow();
    });

    test('rejects bad inputs', () => {
        expect(() => appendIncremental(null, { updates: [] }))
            .toThrow(RenderError);
        expect(() => appendIncremental(new Uint8Array(0), null))
            .toThrow(RenderError);
        const original = buildDocument({ pages: [''] });
        expect(() => appendIncremental(original, {
            updates: [{ num: 0, gen: 0, value: obj.nul() }]
        })).toThrow(RenderError);
    });
});

// office/BATCH_42/02 — the additive members pdfSign builds on (BL-1565).
describe('appendIncrementalWithOffsets', () => {
    const upd = (num, n) => ({ num, gen: 0, value: obj.dict({
        Probe: { type: 'int', value: n } }) });

    for (const [label, makeBase] of [
        ['classical base', () => buildDocument({ pages: ['x'] })],
        ['xref-stream base', streamBase]
    ]) {
        test(`${label}: bytes identical to appendIncremental; offsets name each header`, () => {
            const base = makeBase();
            const size = readBaseTrailer(base).trailer.size;
            const opts = { updates: [upd(size + 1, 2), upd(size, 1)] };
            const plain = appendIncremental(base, opts);
            const r = appendIncrementalWithOffsets(base, opts);
            expect(r.bytes).toEqual(plain);
            expect([...r.offsets.keys()].sort((a, b) => a - b)).toEqual([size, size + 1]);
            for (const [num, at] of r.offsets) {
                expect(td.decode(r.bytes.subarray(at, at + 12)))
                    .toStartWith(`${num} 0 obj\n`);
            }
            // xrefOffset is what the new startxref records.
            const text = td.decode(r.bytes);
            const sx = text.lastIndexOf('startxref\n');
            expect(parseInt(text.slice(sx + 10), 10)).toBe(r.xrefOffset);
            expect(r.xrefOffset).toBeGreaterThan(Math.max(...r.offsets.values()));
        });
    }

    test('validates exactly like appendIncremental', () => {
        expect(() => appendIncrementalWithOffsets('x', { updates: [] })).toThrow(RenderError);
        expect(() => appendIncrementalWithOffsets(buildDocument({ pages: [''] }), {}))
            .toThrow(RenderError);
    });
});

describe('readBaseTrailer', () => {
    test('classical base: form table, trailer as readDocument types it', () => {
        const base = buildDocument({ pages: ['a', 'b'] });
        const r = readBaseTrailer(base);
        const doc = readDocument(base);
        expect(r.form).toBe('table');
        expect(r.trailer.size).toBe(doc.trailer.size);
        expect(r.trailer.root).toEqual(doc.trailer.root);
        expect(r.xrefOffset).toBe(doc.xref.sections[0].at);
    });

    test('xref-stream base: /Root merged from the OLDER section; nothing written', () => {
        const base = streamBase();
        const copy = new Uint8Array(base);
        const r = readBaseTrailer(base);
        expect(r.form).toBe('stream');
        expect(r.trailer.root).toEqual({ num: 1, gen: 0 });
        expect(Number.isInteger(r.trailer.size)).toBe(true);
        expect(base).toEqual(copy);
    });

    test('a chain with no /Root yields trailer null (no throw)', () => {
        const base = buildDocument({ pages: [''] });
        const text = td.decode(base);
        const at = text.lastIndexOf('/Root ');
        const end = text.indexOf('R', at) + 1;
        const noRoot = new Uint8Array(base.length - (end - at));
        noRoot.set(base.subarray(0, at), 0);
        noRoot.set(base.subarray(end), at);
        expect(readBaseTrailer(noRoot).trailer).toBeNull();
    });

    test('rejects non-bytes input', () => {
        expect(() => readBaseTrailer('x')).toThrow(RenderError);
    });
});

describe('pdfIncrementalWriter module', () => {
    test('module shape', () => {
        expect(pdfIncrementalWriter.name).toBe('pdfIncrementalWriter');
        expect(pdfIncrementalWriter.dependencies).toEqual([
            'pdfErrors', 'pdfSerializer', 'pdfTokenizer',
            'pdfParser', 'pdfXref', 'pdfTrailer'
        ]);
        expect(typeof appendIncremental).toBe('function');
    });
});

// An update over an encrypted document repeats the document's /Encrypt
// in its trailer (ISO 32000-2 §7.5.6) — `opts.encrypt`, never defaulted.
describe('appendIncremental — opts.encrypt', () => {
    const ID = [Uint8Array.of(1, 2, 3, 4), Uint8Array.of(5, 6, 7, 8)];
    const upd = () => [{ num: 9, gen: 0, value: obj.dict({ Probe: { type: 'int', value: 7 } }) }];
    const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
    // Outputs of these exact calls captured before the option existed.
    const PINNED = {
        classical: '429fc668bfe367a8ccd1bee4de5dec185d848d389df92b9dd0a7f5519f993b18',
        stream: 'a4e7adac3c3f9d1fa6124d26e709964ee936da793bd27be741d65da2b2c89fae'
    };
    const CLASSICAL_TAIL = '\n9 0 obj\n<< /Probe 7 >>\nendobj\nxref\n0 1\n'
        + '0000000000 65535 f \n9 1\n0000000421 00000 n \ntrailer\n'
        + '<< /Size 10 /Root 1 0 R /ID [<01020304><05060708>] /Prev 257 >>\n'
        + 'startxref\n451\n%%EOF\n';

    test('classical base: /Encrypt 4 0 R right after /ID; readDocument reports it', () => {
        const base = buildDocument({ pages: [''] });
        const out = appendIncremental(base, { updates: upd(), id: ID,
            encrypt: { num: 4, gen: 0 } });
        const tail = td.decode(out.subarray(base.length));
        expect(tail).toContain('/ID [<01020304><05060708>] /Encrypt 4 0 R /Prev ');
        expect(readDocument(out, { allowEncrypted: true }).trailer.encrypt)
            .toEqual({ num: 4, gen: 0 });
    });

    test('without the option the output is byte-identical to before (both forms)', () => {
        const base = buildDocument({ pages: [''] });
        const out = appendIncremental(base, { updates: upd(), id: ID });
        expect(base.length).toBe(420);
        expect(td.decode(out.subarray(base.length))).toBe(CLASSICAL_TAIL);
        expect(sha256Hex(out)).toBe(PINNED.classical);
        expect(sha256Hex(appendIncremental(streamBase(), { updates: upd(), id: ID })))
            .toBe(PINNED.stream);
        expect(sha256Hex(appendIncrementalWithOffsets(base,
            { updates: upd(), id: ID, encrypt: undefined }).bytes)).toBe(PINNED.classical);
    });

    test('xref-stream base: the stream dictionary carries /Encrypt; readBaseTrailer reports it', () => {
        const base = streamBase();
        const out = appendIncremental(base, { updates: upd(), encrypt: { num: 4, gen: 0 } });
        expect(td.decode(out.subarray(base.length))).toContain(' /Encrypt 4 0 R /Prev ');
        expect(readBaseTrailer(out).trailer.encrypt).toEqual({ num: 4, gen: 0 });
    });

    test('a direct /Encrypt dictionary: written verbatim in a classical trailer, refused in a stream one', () => {
        const O = Uint8Array.from({ length: 32 }, (_, i) => 0xE0 ^ i);
        const direct = obj.dict({ Filter: obj.name('Standard'),
            V: { type: 'int', value: 4 }, O: { type: 'string', value: O } });
        const base = buildDocument({ pages: [''] });
        const out = appendIncremental(base, { updates: upd(), encrypt: direct });
        const enc = readBaseTrailer(out).trailer.encrypt;
        expect(enc.type).toBe('dict');
        expect(enc.entries.Filter.value).toBe('Standard');
        expect(Array.from(enc.entries.O.value)).toEqual(Array.from(O));
        let err = null;
        try { appendIncremental(streamBase(), { updates: upd(), encrypt: direct }); }
        catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('pdf/xref/bad-stream-section');
    });
});
