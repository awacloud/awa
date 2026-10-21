// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { sha256 } from '@awacloud/fw/crypto/hash/sha256.js';
import { bitArray } from '@awacloud/fw/crypto/utils/bitArray.js';
import { utf8 } from '@awacloud/fw/io/codec/utf8.js';
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
import { buildDocument } from '../../tests/_helpers/build.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { RenderError, ParseError } = errors;
const _shared    = pdfShared.factory();
const _tokenizer = pdfTokenizer.factory(errors, _shared);
const _parserObj = pdfParserObj.factory();
const { obj } = _parserObj;
const _parser    = pdfParser.factory(errors, _parserObj, _tokenizer);
const _xref      = pdfXref.factory(errors, _tokenizer, _parser);
const _trailer   = pdfTrailer.factory(errors, _parserObj);
const _serializer = pdfSerializer.factory(errors);
const _catalog   = pdfCatalog.factory(errors, _parserObj);
const _page      = pdfPage.factory(errors, _parserObj);
const _pages     = pdfPages.factory(errors, _parserObj);
const { readDocument } = pdfDocument.factory(
    errors, _tokenizer, _parser, _xref, _trailer, _catalog, _page, _pages
);
const { writeDocument, assembleIndirects } = pdfWriter.factory(errors, _serializer);

const td = new TextDecoder('latin1');

describe('writeDocument — fresh model', () => {
    test('minimal one-page document', () => {
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({
                Type: obj.name('Catalog'),
                Pages: obj.ref(2, 0)
            }) },
            { num: 2, gen: 0, value: obj.dict({
                Type: obj.name('Pages'),
                Kids: obj.array([obj.ref(3, 0)]),
                Count: obj.int(1)
            }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'),
                Parent: obj.ref(2, 0),
                MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(612), obj.int(792)])
            }) }
        ];
        const out = writeDocument({
            indirects,
            root: { num: 1, gen: 0 }
        });
        const txt = td.decode(out);
        expect(txt.startsWith('%PDF-2.0')).toBe(true);
        expect(txt.includes('%%EOF')).toBe(true);
        expect(txt.includes('xref')).toBe(true);

        // The output should be readable back.
        const doc = readDocument(out);
        expect(doc.pages.length).toBe(1);
    });

    test('always emits %PDF-2.0 regardless of opts.version override', () => {
        const out = writeDocument({
            indirects: [{ num: 1, gen: 0, value: obj.dict({
                Type: obj.name('Catalog'),
                Pages: obj.ref(2, 0)
            }) }, { num: 2, gen: 0, value: obj.dict({
                Type: obj.name('Pages'), Kids: obj.array([]), Count: obj.int(0)
            }) }],
            root: { num: 1, gen: 0 },
            version: '2.0'
        });
        expect(td.decode(out).startsWith('%PDF-2.0')).toBe(true);
    });

    test('rejects bad input', () => {
        expect(() => writeDocument(null)).toThrow(RenderError);
        expect(() => writeDocument({})).toThrow(RenderError);
        expect(() => writeDocument({ indirects: [], root: null }))
            .toThrow(RenderError);
    });

    test('rejects bad version', () => {
        expect(() => writeDocument({
            indirects: [], root: { num: 1, gen: 0 }, version: 'X'
        })).toThrow(RenderError);
    });

    test('rejects duplicate num', () => {
        expect(() => writeDocument({
            indirects: [
                { num: 1, gen: 0, value: obj.nul() },
                { num: 1, gen: 0, value: obj.nul() }
            ],
            root: { num: 1, gen: 0 }
        })).toThrow(RenderError);
    });

    test('rejects num < 1', () => {
        expect(() => writeDocument({
            indirects: [{ num: 0, gen: 0, value: obj.nul() }],
            root: { num: 1, gen: 0 }
        })).toThrow(RenderError);
    });

    test('handles gaps with free entries', () => {
        const out = writeDocument({
            indirects: [
                { num: 1, gen: 0, value: obj.dict({
                    Type: obj.name('Catalog'), Pages: obj.ref(3, 0)
                }) },
                { num: 3, gen: 0, value: obj.dict({
                    Type: obj.name('Pages'), Kids: obj.array([]), Count: obj.int(0)
                }) }
            ],
            root: { num: 1, gen: 0 }
        });
        const txt = td.decode(out);
        // Object 2 should be a free entry.
        expect(txt).toContain('0000000000 00000 f');
    });
});

describe('writeDocument — constructive E2E (Item #3)', () => {
    test('writes a 1-page PDF from-scratch (no read upstream)', () => {
        // Build a complete indirect graph by hand — no `pdf.read()` upstream.
        // Proves writeDocument is reachable from a pure-constructive
        // model (catalog + pages + page), independently of the read path.
        const indirects = [
            { num: 1, gen: 0, value: obj.dict({
                Type: obj.name('Catalog'),
                Pages: obj.ref(2, 0)
            }) },
            { num: 2, gen: 0, value: obj.dict({
                Type: obj.name('Pages'),
                Kids: obj.array([obj.ref(3, 0)]),
                Count: obj.int(1),
                MediaBox: obj.array([
                    obj.int(0), obj.int(0), obj.int(612), obj.int(792)])
            }) },
            { num: 3, gen: 0, value: obj.dict({
                Type: obj.name('Page'),
                Parent: obj.ref(2, 0),
                MediaBox: obj.array([
                    obj.int(0), obj.int(0), obj.int(612), obj.int(792)]),
                Resources: obj.dict({})
            }) }
        ];
        const out = writeDocument({
            indirects,
            root: { num: 1, gen: 0 }
        });
        const txt = td.decode(out);

        // Header: must be PDF-2.0 (writer pins the version).
        expect(txt.startsWith('%PDF-2.0')).toBe(true);

        // xref section present, with classical table layout.
        expect(txt.includes('\nxref\n')).toBe(true);

        // Trailer: /Size and /Root entries.
        const trailerStart = txt.indexOf('\ntrailer');
        expect(trailerStart).toBeGreaterThan(-1);
        const trailer = txt.substring(trailerStart);
        expect(trailer).toContain('/Size');
        expect(trailer).toContain('/Root');

        // %%EOF tail.
        expect(txt.includes('%%EOF')).toBe(true);

        // Re-read OK — full roundtrip on a from-scratch model.
        const reread = readDocument(out);
        expect(reread.pages.length).toBe(1);
        expect(reread.catalog).toBeDefined();
        expect(reread.trailer.root.num).toBe(1);
        expect(reread.trailer.root.gen).toBe(0);
        // The re-read page's MediaBox must round-trip.
        const mb = reread.pages[0].mediaBox;
        expect(mb).toBeDefined();
        expect(mb[2]).toBe(612);
        expect(mb[3]).toBe(792);
    });
});

describe('assembleIndirects + write — roundtrip from read', () => {
    test('rewrites a synthesized doc', () => {
        const original = buildDocument({ pages: ['a', 'b'] });
        const doc = readDocument(original);
        const indirects = assembleIndirects(doc);
        expect(indirects.length).toBeGreaterThan(0);

        const re = writeDocument({
            indirects,
            root: { num: doc.trailer.root.num, gen: doc.trailer.root.gen },
            version: '2.0'
        });
        const reread = readDocument(re);
        expect(reread.pages.length).toBe(2);
    });

    test('rejects malformed model', () => {
        expect(() => assembleIndirects(null)).toThrow(RenderError);
        expect(() => assembleIndirects({})).toThrow(RenderError);
    });
});

describe('assembleIndirects — unresolvable objects (BL-332)', () => {
    // Frozen copy of the pre-BL-332 behaviour: silently skip, return the list.
    function legacyAssemble(model) {
        for (const k of Object.keys(model.xref.entries)) {
            const e = model.xref.entries[k];
            if (e.free) continue;
            try { model._raw.resolve({ type: 'ref', num: Number(k), gen: e.gen }); }
            catch (_) { /* skip unresolvable */ }
        }
        const out = [];
        for (const [key, rec] of model._raw.indirects.entries()) {
            const [n, g] = key.split(':').map(Number);
            out.push({ num: n, gen: g, value: rec.value });
        }
        out.sort((a, b) => a.num - b.num);
        return out;
    }

    // Wrap a real model so `resolve` throws for the given object numbers
    // (typed pdf error for the first, a plain Error for the second).
    function breakObjects(model, failing) {
        const realResolve = model._raw.resolve;
        const raw = {
            indirects: model._raw.indirects,
            resolve(ref) {
                if (failing.has(ref.num)) throw failing.get(ref.num);
                return realResolve(ref);
            }
        };
        return { xref: model.xref, trailer: model.trailer, _raw: raw };
    }

    function freshModel() {
        return readDocument(buildDocument({ pages: ['a', 'b', 'c'] }));
    }

    test('fully resolvable model: empty list, indirects identical to the legacy path', () => {
        const model = freshModel();
        const legacy = legacyAssemble(freshModel());
        const out = assembleIndirects(model);
        expect(out.skippedObjects).toEqual([]);
        expect(Array.isArray(out.skippedObjects)).toBe(true);
        expect(out).toEqual(legacy);
        expect(Object.keys(out)).toEqual(legacy.map((_, i) => String(i)));
        const root = { num: model.trailer.root.num, gen: model.trailer.root.gen };
        const bytes = writeDocument({ indirects: out, root, version: '2.0' });
        const legacyBytes = writeDocument({ indirects: legacy, root, version: '2.0' });
        expect(Array.from(bytes)).toEqual(Array.from(legacyBytes));
    });

    test('lenient: lists the 2 skipped objects and still returns the rest', () => {
        const model = freshModel();
        const nums = Object.keys(model.xref.entries)
            .filter((k) => !model.xref.entries[k].free).map(Number).sort((a, b) => a - b);
        expect(nums.length).toBeGreaterThan(3);
        const [a, b] = [nums[nums.length - 1], nums[nums.length - 2]];
        const typed = new ParseError('pdf/parser/bad-object', 'boom');
        const broken = new Map([[a, typed], [b, new Error('plain')]]);
        const baseline = legacyAssemble(freshModel());

        // Evict the two failing objects from the resolved cache: a real
        // damaged file would never have produced them either.
        const m2 = freshModel();
        const bm = breakObjects(m2, broken);
        for (const n of [a, b]) bm._raw.indirects.delete(`${n}:0`);
        const res = assembleIndirects(bm);
        expect(res.skippedObjects).toHaveLength(2);
        const byNum = new Map(res.skippedObjects.map((x) => [x.num, x]));
        expect(byNum.get(a)).toEqual({ num: a, gen: 0, code: 'pdf/parser/bad-object' });
        expect(byNum.get(b)).toEqual({ num: b, gen: 0, code: 'unknown' });
        expect(res.length).toBe(baseline.length - 2);
        // Output is still writable.
        const bytes = writeDocument({
            indirects: res,
            root: { num: m2.trailer.root.num, gen: m2.trailer.root.gen },
            version: '2.0'
        });
        expect(td.decode(bytes).startsWith('%PDF-2.0')).toBe(true);
    });

    test('strict: throws a typed RenderError carrying the 2 entries', () => {
        const model = freshModel();
        const nums = Object.keys(model.xref.entries)
            .filter((k) => !model.xref.entries[k].free).map(Number).sort((a, b) => a - b);
        const [a, b] = [nums[nums.length - 1], nums[nums.length - 2]];
        const bm = breakObjects(model, new Map([
            [a, new ParseError('pdf/xref/truncated', 'x')],
            [b, new Error('plain')]
        ]));
        let err;
        try { assembleIndirects(bm, { strict: true }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('pdf/writer/unresolvable-objects');
        expect(err.message).toContain('2 objects');
        expect(err.context.objects).toHaveLength(2);
        expect(err.context.objects.map((o) => o.num).sort((x, y) => x - y))
            .toEqual([b, a].sort((x, y) => x - y));
    });

    test('strict on a fully resolvable model does not throw', () => {
        const out = assembleIndirects(freshModel(), { strict: true });
        expect(out.skippedObjects).toEqual([]);
        expect(out.length).toBeGreaterThan(0);
    });
});

describe('pdfWriter module', () => {
    test('module shape', () => {
        expect(pdfWriter.name).toBe('pdfWriter');
        expect(pdfWriter.dependencies).toEqual(['pdfErrors', 'pdfSerializer', 'sha256', 'bitArray']);
        expect(pdfWriter.factory.toString()).toContain('function');
        const m = pdfWriter.factory(_pdfErrors_TD1, {});
        expect(typeof m.writeDocument).toBe('function');
        expect(typeof m.assembleIndirects).toBe('function');
    });

    test('declares sha256 and bitArray last, after the two it had', () => {
        expect(pdfWriter.dependencies).toEqual(['pdfErrors', 'pdfSerializer', 'sha256', 'bitArray']);
        expect(pdfWriter.deps).toEqual([pdfErrors, pdfSerializer, sha256, bitArray]);
    });
});

describe('writeDocument — the /ID a PDF 2.0 file requires (ISO 32000-2 Table 15)', () => {
    const _bitArray = bitArray.factory();
    const wired = pdfWriter.factory(errors, _serializer, sha256.factory(_bitArray, utf8.factory()), _bitArray);
    const model = () => ({
        indirects: [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([]), Count: obj.int(0) }) }
        ],
        root: { num: 1, gen: 0 }
    });
    const trailerOf = (out) => td.decode(out).slice(td.decode(out).lastIndexOf('trailer\n'));
    const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

    test('no id given: both halves are the first 16 bytes of the SHA-256 of what precedes the trailer', () => {
        const out = wired.writeDocument(model());
        const body = out.subarray(0, td.decode(out).lastIndexOf('trailer\n'));
        const h = hex(createHash('sha256').update(body).digest().subarray(0, 16));
        expect(trailerOf(out)).toContain(` /ID [<${h}><${h}>]`);
        expect(Array.from(wired.writeDocument(model()))).toEqual(Array.from(out));
        const back = readDocument(out);
        expect(hex(back.trailer.id[0])).toBe(h);
    });

    test('a different body gives a different /ID', () => {
        const other = model();
        other.indirects[1].value = obj.dict({ Type: obj.name('Pages'), Kids: obj.array([]), Count: obj.int(0), X: obj.int(1) });
        const idOf = (out) => (/ \/ID \[<([0-9A-F]{32})><\1>\]/.exec(trailerOf(out)) || [])[1];
        expect(idOf(wired.writeDocument(model()))).toMatch(/^[0-9A-F]{32}$/);
        expect(idOf(wired.writeDocument(other))).toMatch(/^[0-9A-F]{32}$/);
        expect(idOf(wired.writeDocument(other))).not.toBe(idOf(wired.writeDocument(model())));
    });

    test('an explicit id, a 1.x version, or a hand-wiring without the hash keep the old output', () => {
        const id = [new Uint8Array(16).fill(1), new Uint8Array(16).fill(2)];
        expect(Array.from(wired.writeDocument({ ...model(), id }))).toEqual(Array.from(writeDocument({ ...model(), id })));
        expect(trailerOf(wired.writeDocument({ ...model(), version: '1.7' }))).not.toContain('/ID');
        expect(trailerOf(writeDocument(model()))).not.toContain('/ID');
    });
});
