// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { pdfXref } from './xref.js';
import { pdfTokenizer } from './tokenizer.js';
import { pdfParserObj } from './parser-obj.js';
import { pdfParser } from './parser.js';
import { pdfErrors } from '../errors.js';
const _pdfErrors_TD1 = pdfErrors.factory();
import { pdfShared } from '../_shared/index.js';
import { pdfCrossRefStream } from './crossRefStream.js';
const _errors = _pdfErrors_TD1;
const { ParseError } = _errors;
const _tokenizer = pdfTokenizer.factory(_errors, pdfShared.factory());
const _parserObj = pdfParserObj.factory();
const _parser = pdfParser.factory(_errors, _parserObj, _tokenizer);
const { locateStartXref, readStartXref, parseXrefTable, parseTrailerDict,
    readXrefStreamDict, buildXrefStream } =
    pdfXref.factory(_errors, _tokenizer, _parser);
const _crossRefStream = pdfCrossRefStream.factory(_errors, _parserObj);
const te = new TextEncoder();

// Build a canonical xref entry (20 bytes: 10 digits + " " + 5 digits + " " + n/f + EOL).
function entry(offset, gen, free) {
    const off = String(offset).padStart(10, '0');
    const g   = String(gen).padStart(5, '0');
    const tag = free ? 'f' : 'n';
    return `${off} ${g} ${tag} \n`;
}

const SIMPLE_XREF =
    'xref\n' +
    '0 3\n' +
    entry(0, 65535, true) +
    entry(17, 0, false) +
    entry(81, 0, false) +
    'trailer\n' +
    '<< /Size 3 /Root 1 0 R >>\n' +
    'startxref\n' +
    '491\n' +
    '%%EOF\n';

describe('locateStartXref / readStartXref', () => {
    test('finds the keyword and reads the offset', () => {
        const b = te.encode(SIMPLE_XREF);
        const idx = locateStartXref(b);
        expect(idx).toBeGreaterThan(-1);
        expect(readStartXref(b, idx)).toBe(491);
    });

    test('returns -1 when absent in tail', () => {
        const b = te.encode('hello no xref here');
        expect(locateStartXref(b)).toBe(-1);
    });

    test('readStartXref on wrong offset throws', () => {
        const b = te.encode(SIMPLE_XREF);
        expect(() => readStartXref(b, 0)).toThrow(ParseError);
    });
});

describe('parseXrefTable', () => {
    test('parses the simple table', () => {
        const b = te.encode(SIMPLE_XREF);
        const { entries, end } = parseXrefTable(b, 0);
        expect(entries[0]).toEqual({ offset: 0, gen: 65535, free: true });
        expect(entries[1]).toEqual({ offset: 17, gen: 0, free: false });
        expect(entries[2]).toEqual({ offset: 81, gen: 0, free: false });
        // `end` should land right at the `trailer` keyword
        const tail = new TextDecoder().decode(b.subarray(end));
        expect(tail.trimStart().startsWith('trailer')).toBe(true);
    });

    test('parses multi-subsection table', () => {
        const src =
            'xref\n' +
            '0 1\n' +
            entry(0, 65535, true) +
            '5 2\n' +
            entry(500, 0, false) +
            entry(600, 1, false);
        const { entries } = parseXrefTable(te.encode(src), 0);
        expect(Object.keys(entries).sort()).toEqual(['0', '5', '6']);
        expect(entries[5].offset).toBe(500);
        expect(entries[6].gen).toBe(1);
    });

    test('rejects missing xref keyword', () => {
        expect(() => parseXrefTable(te.encode('foo'), 0)).toThrow(ParseError);
    });

    test('rejects truncated entry', () => {
        const src = 'xref\n0 1\nshort';
        expect(() => parseXrefTable(te.encode(src), 0)).toThrow(ParseError);
    });

    test('rejects bad entry flag', () => {
        const src = 'xref\n0 1\n0000000000 65535 x \n';
        expect(() => parseXrefTable(te.encode(src), 0)).toThrow(ParseError);
    });

    test('rejects non-digit in offset', () => {
        const src = 'xref\n0 1\n00000000XX 65535 n \n';
        expect(() => parseXrefTable(te.encode(src), 0)).toThrow(ParseError);
    });
});

describe('parseTrailerDict', () => {
    test('parses the trailer dict', () => {
        const b = te.encode(SIMPLE_XREF);
        const at = b.indexOf(0x74) >= 0
            ? new TextDecoder().decode(b).indexOf('trailer')
            : -1;
        const { dict } = parseTrailerDict(b, at);
        expect(dict.entries.Size.value).toBe(3);
        expect(dict.entries.Root).toEqual({ type: 'ref', num: 1, gen: 0 });
    });

    test('throws when keyword missing', () => {
        expect(() => parseTrailerDict(te.encode('no kw here'), 0))
            .toThrow(ParseError);
    });

    test('throws when payload is not a dict', () => {
        expect(() => parseTrailerDict(te.encode('trailer 42'), 0))
            .toThrow(ParseError);
    });
});

describe('hybrid xref (Item #4)', () => {
    // PDF 1.5+ hybrid xref : a classical xref table coexists with an xref
    // stream referenced by the trailer's `/XRefStm` entry. Legacy readers
    // see only the classical table ; aware readers union the two.
    //
    // We assert here at the syntax layer :
    //   1. the classical xref table parses normally,
    //   2. the trailer dict carries the `/XRefStm` integer pointing to the
    //      offset of the xref stream object — so downstream layers can
    //      follow it.
    test('reads hybrid xref (classical table + xref stream reference)', () => {
        const HYBRID =
            '%PDF-2.0\n' +
            '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
            '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
            // Classical xref table covering objects 0..2.
            'xref\n' +
            '0 3\n' +
            entry(0, 65535, true) +
            entry(9, 0, false) +
            entry(60, 0, false) +
            // Trailer carries /XRefStm pointing to a hypothetical xref
            // stream object at byte 9999. Aware readers follow this.
            'trailer\n' +
            '<< /Size 3 /Root 1 0 R /XRefStm 9999 >>\n' +
            'startxref\n' +
            '120\n' +
            '%%EOF\n';
        const b = te.encode(HYBRID);
        // The xref table parses cleanly — legacy view.
        const txt = new TextDecoder().decode(b);
        const at = txt.indexOf('xref\n');
        const { entries, end } = parseXrefTable(b, at);
        expect(entries[0]).toEqual({ offset: 0, gen: 65535, free: true });
        expect(entries[1].free).toBe(false);
        expect(entries[2].free).toBe(false);
        // The trailer must carry an /XRefStm key — hybrid marker.
        const { dict } = parseTrailerDict(b, end);
        expect(dict.entries.Size.value).toBe(3);
        expect(dict.entries.Root).toEqual(
            { type: 'ref', num: 1, gen: 0 });
        expect(dict.entries.XRefStm).toBeDefined();
        expect(dict.entries.XRefStm.type).toBe('int');
        expect(dict.entries.XRefStm.value).toBe(9999);
    });
});

describe('readXrefStreamDict / buildXrefStream — BL-1533', () => {
    const PREFIX = te.encode('%PDF-1.5\n' + 'x'.repeat(300));

    function built(opts) {
        const section = buildXrefStream({ offset: PREFIX.length, prev: 17,
            root: { num: 1, gen: 0 }, ...opts });
        const bytes = new Uint8Array(PREFIX.length + section.length);
        bytes.set(PREFIX, 0);
        bytes.set(section, PREFIX.length);
        return { section, bytes };
    }

    test('emits a /Type /XRef stream carrying /W /Index /Size /Prev /Root', () => {
        const { bytes } = built({ num: 9, entries: [
            { num: 3, offset: 120 }, { num: 4, offset: 70000, gen: 2 }, { num: 8, offset: 250 }
        ], info: { num: 2, gen: 0 }, id: [new Uint8Array([0xAB]), new Uint8Array([0xCD])] });
        const { num, gen, dict } = readXrefStreamDict(bytes, PREFIX.length);
        expect([num, gen]).toEqual([9, 0]);
        const e = dict.entries;
        expect(e.Type.value).toBe('XRef');
        expect(e.W.items.map(i => i.value)).toEqual([1, 3, 2]);
        // object 0, the run 3-4, the run 8-9 (9 = the stream itself)
        expect(e.Index.items.map(i => i.value)).toEqual([0, 1, 3, 2, 8, 2]);
        expect(e.Size.value).toBe(10);
        expect(e.Prev.value).toBe(17);
        expect(e.Root).toEqual({ type: 'ref', num: 1, gen: 0 });
        expect(e.Info).toEqual({ type: 'ref', num: 2, gen: 0 });
        expect(e.Filter).toBeUndefined();
        expect(e.ID.items.length).toBe(2);
    });

    test('the rows decode through pdfCrossRefStream, the stream\'s own row included', () => {
        const { bytes } = built({ num: 9, size: 12, entries: [
            { num: 3, offset: 120 }, { num: 4, offset: 70000, gen: 2 }
        ] });
        const { dict } = readXrefStreamDict(bytes, PREFIX.length);
        const text = new TextDecoder('latin1').decode(bytes);
        const dataAt = text.indexOf('stream\n', text.indexOf('>>')) + 'stream\n'.length;
        const data = bytes.subarray(dataAt, dataAt + dict.entries.Length.value);
        const { entries } = _crossRefStream.parseCrossRefStream(data, dict);
        expect(entries[0].free).toBe(true);
        expect(entries[3]).toMatchObject({ offset: 120, gen: 0, free: false });
        expect(entries[4]).toMatchObject({ offset: 70000, gen: 2, free: false });
        expect(entries[9]).toMatchObject({ offset: PREFIX.length, gen: 0, free: false });
        expect(dict.entries.Size.value).toBe(12);   // opts.size above num + 1 wins
    });

    test('readXrefStreamDict refuses a non-stream object and a classical table', () => {
        const notXref = te.encode('5 0 obj\n<< /Type /Catalog >>\nendobj\n');
        expect(() => readXrefStreamDict(notXref, 0)).toThrow(ParseError);
        try { readXrefStreamDict(notXref, 0); } catch (e) {
            expect(e.code).toBe('pdf/xref/not-xref-stream');
        }
        const table = te.encode(SIMPLE_XREF);
        expect(() => readXrefStreamDict(table, 0)).toThrow(/no cross-reference stream at offset 0/);
        expect(() => readXrefStreamDict(table, 1e9)).toThrow(/offset outside the file/);
    });

    test('buildXrefStream refuses unusable input with a named error', () => {
        const base = { num: 5, offset: 10, prev: 0, root: { num: 1, gen: 0 }, entries: [] };
        for (const bad of [{ num: 0 }, { offset: -1 }, { prev: 'x' }, { root: null },
            { entries: [{ num: 0, offset: 3 }] }]) {
            let err = null;
            try { buildXrefStream({ ...base, ...bad }); } catch (e) { err = e; }
            expect(err && err.code).toBe('pdf/xref/bad-stream-section');
        }
    });
});

describe('pdfXref module', () => {
    test('module shape + worker safety', () => {
        expect(pdfXref.name).toBe('pdfXref');
        expect(pdfXref.dependencies).toEqual(['pdfErrors', 'pdfTokenizer', 'pdfParser']);
        expect(pdfXref.factory.toString()).toContain('function');
        const m = pdfXref.factory(_pdfErrors_TD1, {}, {});
        expect(typeof m.locateStartXref).toBe('function');
        expect(typeof m.parseXrefTable).toBe('function');
    });
});

// An update over an encrypted document repeats the document's /Encrypt
// in its cross-reference stream dictionary (ISO 32000-2 §7.5.6).
describe('buildXrefStream — opts.encrypt', () => {
    const ID = [Uint8Array.of(1, 2, 3, 4), Uint8Array.of(5, 6, 7, 8)];
    const BASE_OPTS = { num: 12, offset: 300, prev: 17, root: { num: 1, gen: 0 },
        info: { num: 2, gen: 0 }, id: ID, entries: [{ num: 3, offset: 120 }] };
    const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
    // Output of this exact call captured before the option existed.
    const PINNED_SHA256 = 'e12d2717992cd430f42eaf19a4fa030fd4581478a9d8d044f052069f28ce68da';

    test('a reference is written as /Encrypt n g R right after /ID, and reads back', () => {
        const section = buildXrefStream({ ...BASE_OPTS, encrypt: { num: 4, gen: 0 } });
        const text = new TextDecoder('latin1').decode(section);
        expect(text).toContain('/ID [<01020304><05060708>] /Encrypt 4 0 R /Prev 17');
        const prefix = te.encode('x'.repeat(300));
        const bytes = new Uint8Array(prefix.length + section.length);
        bytes.set(prefix, 0);
        bytes.set(section, prefix.length);
        const { dict } = readXrefStreamDict(bytes, 300);
        expect(dict.entries.Encrypt).toEqual({ type: 'ref', num: 4, gen: 0 });
    });

    test('without the option (or with null) the output is byte-identical to before', () => {
        expect(sha256Hex(buildXrefStream(BASE_OPTS))).toBe(PINNED_SHA256);
        expect(sha256Hex(buildXrefStream({ ...BASE_OPTS, encrypt: null }))).toBe(PINNED_SHA256);
        expect(new TextDecoder('latin1').decode(buildXrefStream(BASE_OPTS)))
            .not.toContain('/Encrypt');
    });

    test('anything but an indirect reference is refused (a direct dictionary is not written here)', () => {
        for (const encrypt of [{ type: 'dict', entries: {} }, { num: 0, gen: 0 }]) {
            let err = null;
            try { buildXrefStream({ ...BASE_OPTS, encrypt }); } catch (e) { err = e; }
            expect(err && err.code).toBe('pdf/xref/bad-stream-section');
        }
    });
});
