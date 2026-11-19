// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T64 (D40): the public resolver of a read document —
// resolve, info() and pageContents(i) — on documents written by the pdf
// writer.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const { readDocument } = rt.resolve('pdfDocument');
const { writeDocument } = rt.resolve('pdfWriter');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { encodeChain } = rt.resolve('pdfFilterDispatch');
const { ContractError } = rt.resolve('pdfErrors');

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const lit = (bytes) => ({ type: 'string', value: bytes instanceof Uint8Array ? bytes : te.encode(bytes), syntax: 'lit' });
const utf16 = (s) => new Uint8Array([0xFE, 0xFF, ...[...s].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xFF])]);
const box = { type: 'array', items: [int(0), int(0), int(612), int(792)] };
const stream = (bytes, entries = {}) => ({ type: 'stream', dict: { type: 'dict', entries: { Length: int(bytes.length), ...entries } }, raw: bytes });

/** Three pages: a two-stream /Contents array, a Flate-encoded stream, none; Info with text strings. */
function graph(info) {
    const flate = encodeChain(te.encode('0 0 m 10 10 l S'), ['FlateDecode']);
    return [
        { num: 1, gen: 0, value: { type: 'dict', entries: { Type: name('Catalog'), Pages: ref(2) } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: { Type: name('Pages'), Kids: { type: 'array', items: [ref(3), ref(4), ref(5)] }, Count: int(3) } } },
        { num: 3, gen: 0, value: { type: 'dict', entries: { Type: name('Page'), Parent: ref(2), MediaBox: box, Contents: { type: 'array', items: [ref(6), ref(7)] } } } },
        { num: 4, gen: 0, value: { type: 'dict', entries: { Type: name('Page'), Parent: ref(2), MediaBox: box, Contents: ref(8) } } },
        { num: 5, gen: 0, value: { type: 'dict', entries: { Type: name('Page'), Parent: ref(2), MediaBox: box } } },
        { num: 6, gen: 0, value: stream(te.encode('BT /F1 12 Tf')) },
        { num: 7, gen: 0, value: stream(te.encode('(Hi) Tj ET')) },
        { num: 8, gen: 0, value: stream(flate, { Filter: name('FlateDecode') }) },
        { num: 9, gen: 0, value: { type: 'dict', entries: info } }
    ];
}
const INFO = {
    Title: lit(utf16('Résumé ✓')), Author: lit('Ada'), Producer: lit(new Uint8Array([0x41, 0x84, 0x42])),
    CreationDate: lit("D:20261110120000+01'00'"), Trapped: { type: 'bool', value: true },
    Subject: int(3), Custom: lit('kept out')
};
const bytesOf = (r) => (r instanceof Uint8Array ? r : r.bytes);
const write = (info = INFO, withInfo = true) => bytesOf(writeDocument({ indirects: graph(info), root: { num: 1, gen: 0 }, ...(withInfo ? { info: { num: 9, gen: 0 } } : {}) }));

describe('readDocument — resolve (T64)', () => {
    test('a reference to its object, any other value itself; the same resolver as _raw.resolve', () => {
        const doc = readDocument(write());
        expect(doc.resolve(ref(9)).entries.Author.value).toEqual(te.encode('Ada'));
        expect(doc.resolve(int(4))).toEqual(int(4));
        expect(doc.resolve).toBe(doc._raw.resolve);
    });
});

describe('readDocument — info() (T64)', () => {
    test('the Info strings as text, Trapped a name or a boolean, a non-string entry and an unknown key left out', () => {
        expect(readDocument(write()).info()).toEqual({
            title: 'Résumé ✓', author: 'Ada', producer: 'A—B',
            creationDate: "D:20261110120000+01'00'", trapped: 'True'
        });
        expect(readDocument(write({ Trapped: name('Unknown') })).info()).toEqual({ trapped: 'Unknown' });
    });
    test('null without an Info dictionary, or when it is not a dictionary', () => {
        expect(readDocument(write(INFO, false)).info()).toBe(null);
        const bad = graph(INFO);
        bad[8] = { num: 9, gen: 0, value: int(1) };
        expect(readDocument(bytesOf(writeDocument({ indirects: bad, root: { num: 1, gen: 0 }, info: { num: 9, gen: 0 } }))).info()).toBe(null);
    });
    test("an encrypted document's Info is decrypted", () => {
        const enc = { version: 5, revision: 5, ownerPassword: 'o', userPassword: '', permissions: -4, randomBytes: (n) => new Uint8Array(n).fill(7) };
        const bytes = writeEncryptedDocument({ indirects: graph({ Title: lit('Secret title') }), root: { num: 1, gen: 0 }, info: { num: 9, gen: 0 }, encrypt: enc }).bytes;
        expect(readDocument(bytes, { password: '' }).info()).toEqual({ title: 'Secret title' });
    }, 20000);
});

describe('readDocument — pageContents(i) (T64)', () => {
    test("a page's streams decoded and joined with a newline; a Flate stream decoded; no /Contents, empty bytes", () => {
        const doc = readDocument(write());
        expect(td.decode(doc.pageContents(0))).toBe('BT /F1 12 Tf\n(Hi) Tj ET');
        expect(td.decode(doc.pageContents(1))).toBe('0 0 m 10 10 l S');
        expect(doc.pageContents(2)).toEqual(new Uint8Array(0));
    });
    test('an index that is no page throws pdf/document/bad-page-index', () => {
        const doc = readDocument(write());
        for (const i of [-1, 3, 1.5, '0']) {
            let err = null;
            try { doc.pageContents(i); } catch (e) { err = e; }
            expect([err instanceof ContractError, err && err.code]).toEqual([true, 'pdf/document/bad-page-index']);
        }
    });
    test('a content reference that is not a stream throws', () => {
        const g = graph(INFO);
        g[5] = { num: 6, gen: 0, value: int(0) };
        const doc = readDocument(bytesOf(writeDocument({ indirects: g, root: { num: 1, gen: 0 } })));
        expect(() => doc.pageContents(0)).toThrow('is not a stream');
    });
});
