// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T66 (a), D40: pdfMerge on documents written by the
// pdf writer, the merged file read back.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { pdfMerge } from './merge.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const { merge } = rt.resolve('pdfMerge');
const { readDocument } = rt.resolve('pdfDocument');
const { writeDocument } = rt.resolve('pdfWriter');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { ContractError } = rt.resolve('pdfErrors');

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const arr = (...items) => ({ type: 'array', items });
const dict = (entries) => ({ type: 'dict', entries });
const stream = (text) => ({ type: 'stream', dict: dict({ Length: int(text.length) }), raw: te.encode(text) });
const bytesOf = (r) => (r instanceof Uint8Array ? r : r.bytes);

/**
 * A source of three pages under one Pages node carrying the inherited
 * Resources (a shared font) and MediaBox: page 1 rotated, with a link to
 * page 3 and one to page 2, a Widget and StructParents; pages 2 and 3
 * plain. Each page's content says its name.
 */
function source(tag, version = '1.7') {
    const indirects = [
        { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2), Outlines: ref(20) }) },
        { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(ref(3), ref(4), ref(5)), Count: int(3),
            Resources: dict({ Font: dict({ F1: ref(10) }) }), MediaBox: arr(int(0), int(0), int(400), int(600)) }) },
        { num: 3, gen: 0, value: dict({ Type: name('Page'), Parent: ref(2), Contents: ref(6), Rotate: int(90), StructParents: int(0),
            Annots: arr(ref(11), ref(12), ref(13)) }) },
        { num: 4, gen: 0, value: dict({ Type: name('Page'), Parent: ref(2), Contents: ref(7) }) },
        { num: 5, gen: 0, value: dict({ Type: name('Page'), Parent: ref(2), Contents: ref(8), MediaBox: arr(int(0), int(0), int(100), int(100)) }) },
        { num: 6, gen: 0, value: stream(`${tag}-1`) },
        { num: 7, gen: 0, value: stream(`${tag}-2`) },
        { num: 8, gen: 0, value: stream(`${tag}-3`) },
        { num: 10, gen: 0, value: dict({ Type: name('Font'), Subtype: name('Type1'), BaseFont: name('Helvetica') }) },
        // A link to page 3, one to page 2, a Widget.
        { num: 11, gen: 0, value: dict({ Type: name('Annot'), Subtype: name('Link'), P: ref(3), StructParent: int(1),
            Rect: arr(int(0), int(0), int(10), int(10)), Dest: arr(ref(5), name('Fit')) }) },
        { num: 12, gen: 0, value: dict({ Type: name('Annot'), Subtype: name('Link'), Rect: arr(int(0), int(0), int(10), int(10)), Dest: arr(ref(4), name('Fit')) }) },
        { num: 13, gen: 0, value: dict({ Type: name('Annot'), Subtype: name('Widget'), Rect: arr(int(0), int(0), int(10), int(10)), FT: name('Tx') }) },
        { num: 20, gen: 0, value: dict({ Type: name('Outlines'), Count: int(0) }) }
    ];
    return bytesOf(writeDocument({ indirects, root: { num: 1, gen: 0 }, version }));
}

const contents = (doc) => doc.pages.map((_, i) => td.decode(doc.pageContents(i)));
const entry = (doc, i, k) => doc.resolve(doc.pages[i].raw.entries[k]);

describe('pdfMerge — descriptor', () => {
    test('a strict factory descriptor, registered in the modules', () => {
        expect([pdfMerge.name, pdfMerge.dependencies]).toEqual(['pdfMerge', ['pdfErrors', 'pdfDocument', 'pdfPages', 'pdfWriter']]);
        expect(modules).toContain(pdfMerge);
    });
});

describe('pdfMerge — merge', () => {
    test('every page of each source, in order', () => {
        const doc = readDocument(merge([source('a'), source('b')]));
        expect(contents(doc)).toEqual(['a-1', 'a-2', 'a-3', 'b-1', 'b-2', 'b-3']);
    });
    test('the chosen pages, in the order given, a page given twice copied twice', () => {
        const doc = readDocument(merge([{ bytes: source('a'), pages: [2, 0] }, { bytes: source('b'), pages: [1, 1] }]));
        expect(contents(doc)).toEqual(['a-3', 'a-1', 'b-2', 'b-2']);
    });
    test('the inherited attributes taken from the Pages node; a page\'s own kept', () => {
        const doc = readDocument(merge([source('a')]));
        expect(doc.pages.map((p) => p.mediaBox)).toEqual([[0, 0, 400, 600], [0, 0, 400, 600], [0, 0, 100, 100]]);
        expect(doc.pages[0].rotate).toBe(90);
        expect(entry(doc, 1, 'Resources').entries.Font.entries.F1.type).toBe('ref');
    });
    test('an object two copied pages share is written once', () => {
        const doc = readDocument(merge([source('a')]));
        const f = (i) => doc.pages[i].raw.entries.Resources.entries.Font.entries.F1;
        expect([f(0).num, f(1).num, f(2).num].every((n) => n === f(0).num)).toBe(true);
        expect(doc.resolve(f(0)).entries.BaseFont.value).toBe('Helvetica');
    });
    test("a link to a copied page points to its copy; to a page left out, its destination is null; Widgets, StructParents, /P to a page left out removed", () => {
        const doc = readDocument(merge([{ bytes: source('a'), pages: [0, 2] }]));
        const annots = entry(doc, 0, 'Annots').items.map((a) => doc.resolve(a));
        expect(annots.map((a) => a.entries.Subtype.value)).toEqual(['Link', 'Link']);
        const [toThree, toTwo] = annots;
        expect(doc.resolve(toThree.entries.Dest.items[0]).entries.Contents.type).toBe('ref');
        expect(td.decode(doc.pageContents(1))).toBe('a-3');
        const kids = doc.resolve(doc.catalog.raw.entries.Pages).entries.Kids.items;
        expect(toThree.entries.Dest.items[0].num).toBe(kids[1].num);
        expect(toThree.entries.P.num).toBe(kids[0].num);
        expect(toTwo.entries.Dest.items[0]).toEqual({ type: 'null' });
        expect(toThree.entries.StructParent).toBeUndefined();
        expect(toThree.entries.P.type).toBe('ref');
        expect(doc.pages[0].raw.entries.StructParents).toBeUndefined();
        const left = readDocument(merge([{ bytes: source('a'), pages: [1] }]));
        expect(left.pages[0].raw.entries.Annots).toBeUndefined();
    });
    test("the catalog's structures are not carried; the version is the highest source's, or opts.version", () => {
        const bytes = merge([source('a', '1.4'), source('b', '1.7')]);
        const doc = readDocument(bytes);
        expect(doc.version).toBe('1.7');
        expect(doc.catalog.raw.entries.Outlines).toBeUndefined();
        expect(readDocument(merge([source('a')], { version: '2.0' })).version).toBe('2.0');
    });
});

describe('pdfMerge — errors', () => {
    const code = (fn) => { try { fn(); } catch (e) { return [e instanceof ContractError, e.code]; } return null; };
    test('sources not a non-empty array of bytes or { bytes, pages } throw pdf/merge/bad-sources', () => {
        for (const s of [[], null, ['x'], [{ bytes: 'x' }], [{ bytes: new Uint8Array(1), pages: 3 }]]) {
            expect(code(() => merge(s))).toEqual([true, 'pdf/merge/bad-sources']);
        }
    });
    test('a page index that is not the source\'s throws pdf/merge/bad-page', () => {
        for (const i of [3, -1, 0.5]) expect(code(() => merge([{ bytes: source('a'), pages: [i] }]))).toEqual([true, 'pdf/merge/bad-page']);
    });
    // T30 (c): readDocument opens an empty-user-password file by default, so
    // merge refuses an encrypted source by name rather than write it clear.
    test('an encrypted source is refused by name; a source that does not read, its ParseError', () => {
        const enc = { version: 5, revision: 5, ownerPassword: 'o', userPassword: '', permissions: -4, randomBytes: (n) => new Uint8Array(n).fill(3) };
        const encrypted = writeEncryptedDocument({ indirects: [
            { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2) }) },
            { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(), Count: int(0) }) }
        ], root: { num: 1, gen: 0 }, encrypt: enc }).bytes;
        let code = null;
        try { merge([encrypted]); } catch (e) { code = e.code; }
        expect(code).toBe('pdf/merge/encrypted-source');
        expect(() => merge([new Uint8Array([1, 2, 3])])).toThrow();
    }, 20000);
});
