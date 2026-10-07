// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { pdfXrefStreamWriter } from './xrefStreamWriter.js';
import { pdfErrors } from '../errors.js';
import { pdfSerializer } from '../syntax/serializer.js';
import { pdfFlate } from '../syntax/filters/flate.js';
import { pdfParserObj } from '../syntax/parser-obj.js';
import { pdfTokenizer } from '../syntax/tokenizer.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfXref } from '../syntax/xref.js';
import { pdfCrossRefStream } from '../syntax/crossRefStream.js';
import { pdfObjStream } from '../syntax/objStream.js';
import { pdfShared } from '../_shared/index.js';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bitstream } from '@awacloud/fw/io/compress/bitstream.js';
import { huffman }   from '@awacloud/fw/io/compress/huffman.js';
import { deflate }   from '@awacloud/fw/io/compress/deflate.js';
import { lz77 }     from '@awacloud/fw/io/compress/lz77.js';
import { adler32 }   from '@awacloud/fw/io/calc/adler32.js';
import { zlib }      from '@awacloud/fw/io/compress/zlib.js';

// ── Wiring (factory-only, mirrors writer.test.js) ────────────────────
const _pdfErrors_TD1 = pdfErrors.factory();
const errors = _pdfErrors_TD1;
const { RenderError } = errors;

const _rt = new ModuleRuntime();
_rt.register(bitstream); _rt.register(huffman); _rt.register(lz77); _rt.register(deflate);
_rt.register(adler32);   _rt.register(zlib);
const _fwZlib = _rt.resolve('zlib');

const _serializer = pdfSerializer.factory(errors);
const _flate      = pdfFlate.factory(errors, _fwZlib);
const _parserObj  = pdfParserObj.factory();
const { obj }     = _parserObj;
const _shared     = pdfShared.factory();
const _tokenizer  = pdfTokenizer.factory(errors, _shared);
const _parser     = pdfParser.factory(errors, _parserObj, _tokenizer);
const _xref       = pdfXref.factory(errors, _tokenizer, _parser);
const _crossRef   = pdfCrossRefStream.factory(errors, _parserObj);
const _objStm     = pdfObjStream.factory(errors, _parserObj, _tokenizer, _parser);

const { writeXrefStreamDocument } =
    pdfXrefStreamWriter.factory(errors, _serializer, _flate);

const td = new TextDecoder('latin1');

// ── Fixture: a minimal 1-page indirect graph ─────────────────────────
function fixtureIndirects() {
    return [
        { num: 1, gen: 0, value: obj.dict({
            Type:  obj.name('Catalog'),
            Pages: obj.ref(2, 0)
        }) },
        { num: 2, gen: 0, value: obj.dict({
            Type:  obj.name('Pages'),
            Kids:  obj.array([obj.ref(3, 0)]),
            Count: obj.int(1)
        }) },
        { num: 3, gen: 0, value: obj.dict({
            Type:      obj.name('Page'),
            Parent:    obj.ref(2, 0),
            MediaBox:  obj.array([obj.int(0), obj.int(0),
                                  obj.int(612), obj.int(792)])
        }) }
    ];
}

/**
 * Re-read a document emitted by `writeXrefStreamDocument` using the
 * package's OWN parser stack — never the writer's internals.
 *
 * @returns {{ entries: object, size: number, trailer: object,
 *             xrefAt: number, xrefNum: number }}
 */
function readBackXref(bytes) {
    const at = _xref.locateStartXref(bytes);
    expect(at).toBeGreaterThan(-1);
    const xrefAt = _xref.readStartXref(bytes, at);

    const ind = _parser.parseIndirectFromBytes(bytes, xrefAt);
    expect(ind.value.type).toBe('stream');
    const dict = ind.value.dict;
    expect(dict.entries.Type.value).toBe('XRef');

    const payload = _flate.decode(ind.value.raw);
    const parsed = _crossRef.parseCrossRefStream(payload, dict);
    return { ...parsed, xrefAt, xrefNum: ind.num };
}

describe('writeXrefStreamDocument — read-back validation (no ObjStm)', () => {
    test('emits a PDF 2.0 header and a startxref/%%EOF tail', () => {
        const out = writeXrefStreamDocument({
            indirects: fixtureIndirects(),
            root: { num: 1, gen: 0 }
        });
        const txt = td.decode(out);
        expect(txt.startsWith('%PDF-2.0\n')).toBe(true);
        expect(txt.endsWith('%%EOF\n')).toBe(true);
        expect(txt).toContain('startxref');
    });

    test('the xref stream re-reads through pdfCrossRefStream', () => {
        const out = writeXrefStreamDocument({
            indirects: fixtureIndirects(),
            root: { num: 1, gen: 0 }
        });
        const { entries, size, trailer, xrefAt, xrefNum } = readBackXref(out);

        // Object 0 is the free head.
        expect(entries[0]).toEqual({
            type: 0, offset: 0, gen: 65535, free: true
        });
        // 1..3 are uncompressed indirects, 4 is the xref stream itself.
        for (const n of [1, 2, 3]) {
            expect(entries[n].type).toBe(1);
            expect(entries[n].free).toBe(false);
        }
        expect(xrefNum).toBe(4);
        expect(entries[4]).toEqual({
            type: 1, offset: xrefAt, gen: 0, free: false
        });
        expect(size).toBe(5);
        expect(trailer.entries.Root).toEqual({ type: 'ref', num: 1, gen: 0 });
    });

    test('every recorded offset re-parses to the ORIGINAL object value',
        () => {
            const indirects = fixtureIndirects();
            const out = writeXrefStreamDocument({
                indirects, root: { num: 1, gen: 0 }
            });
            const { entries } = readBackXref(out);

            for (const src of indirects) {
                const e = entries[src.num];
                expect(e.type).toBe(1);
                const back = _parser.parseIndirectFromBytes(out, e.offset);
                expect(back.num).toBe(src.num);
                expect(back.gen).toBe(src.gen);
                // Structural equality of the round-tripped object.
                expect(back.value).toEqual(src.value);
            }
        });

    test('/Info and /ID survive into the xref-stream trailer dict', () => {
        const indirects = fixtureIndirects();
        indirects.push({ num: 4, gen: 0, value: obj.dict({
            Producer: obj.string(new TextEncoder().encode('awa'))
        }) });
        const out = writeXrefStreamDocument({
            indirects,
            root: { num: 1, gen: 0 },
            info: { num: 4, gen: 0 },
            id: [Uint8Array.of(0x00, 0x11), Uint8Array.of(0xAA, 0xBB)]
        });
        const { trailer, entries } = readBackXref(out);
        expect(trailer.entries.Info).toEqual({ type: 'ref', num: 4, gen: 0 });
        expect(trailer.entries.ID.type).toBe('array');
        expect(trailer.entries.ID.items.length).toBe(2);
        // The /Info object itself is reachable through the xref data.
        const back = _parser.parseIndirectFromBytes(out, entries[4].offset);
        expect(td.decode(back.value.entries.Producer.value)).toBe('awa');
    });

    test('honours an explicit version', () => {
        const out = writeXrefStreamDocument({
            indirects: fixtureIndirects(),
            root: { num: 1, gen: 0 },
            version: '1.5'
        });
        expect(td.decode(out).startsWith('%PDF-1.5\n')).toBe(true);
        // Still re-readable.
        expect(readBackXref(out).entries[1].type).toBe(1);
    });
});

describe('writeXrefStreamDocument — read-back validation (useObjStm)', () => {
    test('compressible objects land in an ObjStm and re-read from it',
        () => {
            const indirects = fixtureIndirects();
            const out = writeXrefStreamDocument({
                indirects,
                root: { num: 1, gen: 0 },
                useObjStm: true
            });
            const { entries, xrefNum } = readBackXref(out);

            // 1..3 are now type-2 (compressed) entries pointing at the
            // single ObjStm; the ObjStm itself is a type-1 entry.
            const objStmNums = new Set();
            for (const n of [1, 2, 3]) {
                expect(entries[n].type).toBe(2);
                objStmNums.add(entries[n].objStm);
            }
            expect(objStmNums.size).toBe(1);
            const stmNum = [...objStmNums][0];
            expect(entries[stmNum].type).toBe(1);
            expect(xrefNum).toBe(stmNum + 1);

            // Re-read the ObjStm through the package's own parser.
            const stmInd = _parser.parseIndirectFromBytes(
                out, entries[stmNum].offset);
            expect(stmInd.num).toBe(stmNum);
            expect(stmInd.value.dict.entries.Type.value).toBe('ObjStm');
            const decoded = _flate.decode(stmInd.value.raw);
            const members = _objStm.parseObjectStream(
                decoded, stmInd.value.dict);
            expect(members.length).toBe(3);

            for (const src of indirects) {
                const e = entries[src.num];
                const member = members[e.index];
                expect(member.num).toBe(src.num);
                expect(member.value).toEqual(src.value);
            }
        });

    test('stream objects stay uncompressed alongside the ObjStm', () => {
        const indirects = fixtureIndirects();
        indirects.push({ num: 4, gen: 0, value: {
            type: 'stream',
            dict: obj.dict({ Subtype: obj.name('Raw') }),
            raw: new Uint8Array([1, 2, 3, 4])
        } });
        const out = writeXrefStreamDocument({
            indirects, root: { num: 1, gen: 0 }, useObjStm: true
        });
        const { entries } = readBackXref(out);

        expect(entries[4].type).toBe(1);
        const back = _parser.parseIndirectFromBytes(out, entries[4].offset);
        expect(back.num).toBe(4);
        expect(Array.from(back.value.raw)).toEqual([1, 2, 3, 4]);
        for (const n of [1, 2, 3]) expect(entries[n].type).toBe(2);
    });

    test('objStmCapacity splits members across several ObjStms', () => {
        const indirects = [];
        for (let n = 1; n <= 5; n++) {
            indirects.push({ num: n, gen: 0, value: obj.dict({
                Idx: obj.int(n)
            }) });
        }
        indirects[0] = { num: 1, gen: 0, value: obj.dict({
            Type: obj.name('Catalog')
        }) };
        const out = writeXrefStreamDocument({
            indirects, root: { num: 1, gen: 0 },
            useObjStm: true, objStmCapacity: 2
        });
        const { entries } = readBackXref(out);
        const stms = new Set();
        for (let n = 1; n <= 5; n++) {
            expect(entries[n].type).toBe(2);
            stms.add(entries[n].objStm);
        }
        expect(stms.size).toBe(3); // ceil(5 / 2)
        for (const stmNum of stms) {
            const stmInd = _parser.parseIndirectFromBytes(
                out, entries[stmNum].offset);
            const members = _objStm.parseObjectStream(
                _flate.decode(stmInd.value.raw), stmInd.value.dict);
            expect(members.length).toBeGreaterThan(0);
        }
    });

    test('a non-zero generation object is never compressed', () => {
        const indirects = fixtureIndirects();
        indirects.push({ num: 4, gen: 2, value: obj.dict({
            Note: obj.name('GenTwo')
        }) });
        const out = writeXrefStreamDocument({
            indirects, root: { num: 1, gen: 0 }, useObjStm: true
        });
        const { entries } = readBackXref(out);
        expect(entries[4].type).toBe(1);
        expect(entries[4].gen).toBe(2);
    });
});

describe('writeXrefStreamDocument — contract errors', () => {
    test('rejects a missing indirect list', () => {
        expect(() => writeXrefStreamDocument(null)).toThrow(RenderError);
        expect(() => writeXrefStreamDocument({})).toThrow(RenderError);
    });

    test('rejects a missing root', () => {
        expect(() => writeXrefStreamDocument({ indirects: [] }))
            .toThrow(RenderError);
    });

    test('rejects a malformed version', () => {
        expect(() => writeXrefStreamDocument({
            indirects: [], root: { num: 1, gen: 0 }, version: '2'
        })).toThrow(RenderError);
    });

    test('rejects a bad object number', () => {
        expect(() => writeXrefStreamDocument({
            indirects: [{ num: 0, gen: 0, value: obj.dict({}) }],
            root: { num: 1, gen: 0 }
        })).toThrow(RenderError);
    });

    test('rejects duplicate object numbers', () => {
        expect(() => writeXrefStreamDocument({
            indirects: [
                { num: 1, gen: 0, value: obj.dict({}) },
                { num: 1, gen: 0, value: obj.dict({}) }
            ],
            root: { num: 1, gen: 0 }
        })).toThrow(RenderError);
    });

    test('requires pdfFlate.encode', () => {
        const { writeXrefStreamDocument: noFlate } =
            pdfXrefStreamWriter.factory(errors, _serializer, {});
        expect(() => noFlate({
            indirects: fixtureIndirects(), root: { num: 1, gen: 0 }
        })).toThrow(RenderError);
    });
});
