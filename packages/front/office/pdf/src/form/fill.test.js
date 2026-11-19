// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// office-coverage-3 T66 (b), D40 β: pdfFormFill on a form written by the
// pdf writer, the filled file read back.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { pdfFormFill } from './fill.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const { fill } = rt.resolve('pdfFormFill');
const { readDocument } = rt.resolve('pdfDocument');
const { writeDocument } = rt.resolve('pdfWriter');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { decode } = rt.resolve('pdfFilterDispatch');
const { ContractError } = rt.resolve('pdfErrors');

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const arr = (...items) => ({ type: 'array', items });
const dict = (entries) => ({ type: 'dict', entries });
const str = (s) => ({ type: 'string', value: te.encode(s), syntax: 'lit' });
const rect = (w, h) => arr(int(0), int(0), int(w), int(h));
const ap = (...states) => dict({ N: dict(Object.fromEntries(states.map((s) => [s, ref(40)]))) });
const widget = (extra) => ({ Type: name('Annot'), Subtype: name('Widget'), P: ref(3), ...extra });
const bytesOf = (r) => (r instanceof Uint8Array ? r : r.bytes);

/** The form: catalog 1, pages 2, page 3, AcroForm 4, fields 10–25, a blank appearance 40, Helv 41. */
function form({ inlineAcroForm = false } = {}) {
    const acroForm = dict({ Fields: arr(ref(10), ref(11), ref(14), ref(15), ref(18), ref(19), ref(20), ref(21)),
        DA: str('/Helv 0 Tf 0 g'), DR: dict({ Font: dict({ Helv: ref(41) }) }) });
    const indirects = [
        { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2), AcroForm: inlineAcroForm ? acroForm : ref(4) }) },
        { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(ref(3)), Count: int(1) }) },
        { num: 3, gen: 0, value: dict({ Type: name('Page'), Parent: ref(2), MediaBox: rect(600, 800),
            Annots: arr(ref(10), ref(12), ref(13), ref(14), ref(16), ref(17), ref(18), ref(19), ref(20), ref(21)) }) },
        // name: a text field merged with its widget.
        { num: 10, gen: 0, value: dict(widget({ FT: name('Tx'), T: str('name'), Rect: rect(200, 20) })) },
        // addr.street: a text field with two kid widgets, its own DA.
        { num: 11, gen: 0, value: dict({ T: str('addr'), FT: name('Tx'), Kids: arr(ref(22)) }) },
        { num: 22, gen: 0, value: dict({ T: str('street'), Parent: ref(11), DA: str('/Helv 10 Tf 1 0 0 rg'), Kids: arr(ref(12), ref(13)) }) },
        { num: 12, gen: 0, value: dict(widget({ Parent: ref(22), Rect: rect(150, 30) })) },
        { num: 13, gen: 0, value: dict(widget({ Parent: ref(22), Rect: rect(100, 18) })) },
        // agree: a check box.
        { num: 14, gen: 0, value: dict(widget({ FT: name('Btn'), T: str('agree'), Rect: rect(12, 12), AP: ap('Yes', 'Off'), AS: name('Off') })) },
        // size: a radio group of two.
        { num: 15, gen: 0, value: dict({ FT: name('Btn'), T: str('size'), Ff: int(1 << 15), Kids: arr(ref(16), ref(17)) }) },
        { num: 16, gen: 0, value: dict(widget({ Parent: ref(15), Rect: rect(12, 12), AP: ap('S', 'Off'), AS: name('Off') })) },
        { num: 17, gen: 0, value: dict(widget({ Parent: ref(15), Rect: rect(12, 12), AP: ap('L', 'Off'), AS: name('Off') })) },
        // color: a combo box with options; tags: a multi-select list.
        { num: 18, gen: 0, value: dict(widget({ FT: name('Ch'), T: str('color'), Ff: int(1 << 17), Rect: rect(80, 16), Opt: arr(str('red'), arr(str('b'), str('blue'))) })) },
        { num: 19, gen: 0, value: dict(widget({ FT: name('Ch'), T: str('tags'), Ff: int(1 << 21), Rect: rect(80, 60), Opt: arr(str('x'), str('y'), str('z')) })) },
        // pin: a password field; sig: a signature field.
        { num: 20, gen: 0, value: dict(widget({ FT: name('Tx'), T: str('pin'), Ff: int(1 << 13), Rect: rect(60, 16) })) },
        { num: 21, gen: 0, value: dict(widget({ FT: name('Sig'), T: str('sig'), Rect: rect(60, 16) })) },
        { num: 40, gen: 0, value: { type: 'stream', dict: dict({ Type: name('XObject'), Subtype: name('Form'), BBox: rect(12, 12), Length: int(0) }), raw: new Uint8Array(0) } },
        { num: 41, gen: 0, value: dict({ Type: name('Font'), Subtype: name('Type1'), BaseFont: name('Helvetica') }) }
    ];
    if (!inlineAcroForm) indirects.push({ num: 4, gen: 0, value: acroForm });
    return bytesOf(writeDocument({ indirects, root: { num: 1, gen: 0 }, version: '1.7' }));
}

const text = (v) => {
    const b = v.value;
    if (b[0] === 0xFE && b[1] === 0xFF) { let s = ''; for (let i = 2; i < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; }
    return td.decode(b);
};
const obj = (doc, n) => doc.resolve(ref(n));
const apText = (doc, n) => {
    const s = doc.resolve(obj(doc, n).entries.AP.entries.N);
    return { stream: s, content: td.decode(decode(s)) };
};

describe('pdfFormFill — descriptor', () => {
    test('a strict factory descriptor, registered in the modules', () => {
        expect([pdfFormFill.name, pdfFormFill.dependencies]).toEqual(['pdfFormFill', ['pdfErrors', 'pdfDocument', 'pdfFieldTree', 'pdfIncrementalWriter']]);
        expect(modules).toContain(pdfFormFill);
    });
});

describe('pdfFormFill — fill', () => {
    test('an incremental update: the prior bytes kept as the prefix; NeedAppearances set', () => {
        const before = form();
        const after = fill(before, { name: 'Ada' });
        expect(after.length).toBeGreaterThan(before.length);
        expect(after.subarray(0, before.length)).toEqual(before);
        expect(obj(readDocument(after), 4).entries.NeedAppearances).toEqual({ type: 'bool', value: true });
    });
    test('a direct AcroForm: the catalog carries NeedAppearances', () => {
        const doc = readDocument(fill(form({ inlineAcroForm: true }), { name: 'Ada' }));
        expect(obj(doc, 1).entries.AcroForm.entries.NeedAppearances.value).toBe(true);
    });
    test('a text field: /V a text string, and a generated appearance stream (BBox, Tx block, DA font auto-sized, DR font)', () => {
        const doc = readDocument(fill(form(), { name: 'Ada (x)' }));
        expect(text(obj(doc, 10).entries.V)).toBe('Ada (x)');
        const { stream, content } = apText(doc, 10);
        expect(stream.dict.entries.BBox.items.map((x) => x.value)).toEqual([0, 0, 200, 20]);
        expect(stream.dict.entries.Subtype.value).toBe('Form');
        expect(content).toBe('/Tx BMC\nq\nBT\n0 g\n/Helv 11.2 Tf\n2 6.864 Td\n(Ada \\(x\\)) Tj\nET\nQ\nEMC\n');
        expect(stream.dict.entries.Resources.entries.Font.entries.Helv).toEqual(ref(41));
    });
    test("a text string outside ASCII is UTF-16BE in /V and WinAnsi in the appearance, '?' outside it", () => {
        const doc = readDocument(fill(form(), { name: 'Zoë € 漢' }));
        expect(text(obj(doc, 10).entries.V)).toBe('Zoë € 漢');
        expect(obj(doc, 10).entries.V.value[0]).toBe(0xFE);
        const raw = decode(apText(doc, 10).stream);
        const at = td.decode(raw).indexOf('(Zo');
        expect([...raw.subarray(at + 1, at + 8)]).toEqual([0x5A, 0x6F, 0xEB, 0x20, 0x80, 0x20, 0x3F]);
    });
    test("a field under a parent, by its full name; each of its widgets gets its own appearance with the field's DA", () => {
        const doc = readDocument(fill(form(), { 'addr.street': '1 rue X' }));
        expect(text(obj(doc, 22).entries.V)).toBe('1 rue X');
        expect(apText(doc, 12).content).toBe('/Tx BMC\nq\nBT\n1 0 0 rg\n/Helv 10 Tf\n2 12.2 Td\n(1 rue X) Tj\nET\nQ\nEMC\n');
        expect(apText(doc, 13).stream.dict.entries.BBox.items.map((x) => x.value)).toEqual([0, 0, 100, 18]);
    });
    test('a password field shows * per character', () => {
        const doc = readDocument(fill(form(), { pin: '1234' }));
        expect(text(obj(doc, 20).entries.V)).toBe('1234');
        expect(apText(doc, 20).content).toContain('(****) Tj');
    });
    test('a check box: its on-state or Off, in /V and /AS', () => {
        const on = readDocument(fill(form(), { agree: true }));
        expect([obj(on, 14).entries.V.value, obj(on, 14).entries.AS.value]).toEqual(['Yes', 'Yes']);
        const off = readDocument(fill(form(), { agree: false }));
        expect([obj(off, 14).entries.V.value, obj(off, 14).entries.AS.value]).toEqual(['Off', 'Off']);
    });
    test('a radio group: /V the state, each widget /AS it or Off; null for none', () => {
        const doc = readDocument(fill(form(), { size: 'L' }));
        expect([obj(doc, 15).entries.V.value, obj(doc, 16).entries.AS.value, obj(doc, 17).entries.AS.value]).toEqual(['L', 'Off', 'L']);
        const none = readDocument(fill(form(), { size: null }));
        expect([obj(none, 15).entries.V.value, obj(none, 17).entries.AS.value]).toEqual(['Off', 'Off']);
    });
    test('choices: one of the options (export or display value); several for a multi-select', () => {
        const doc = readDocument(fill(form(), { color: 'blue', tags: ['x', 'z'] }));
        expect(text(obj(doc, 18).entries.V)).toBe('blue');
        expect(obj(doc, 19).entries.V.items.map(text)).toEqual(['x', 'z']);
        expect(text(obj(readDocument(fill(form(), { color: 'b' })), 18).entries.V)).toBe('b');
    });
    test('the fields not named keep their values', () => {
        const doc = readDocument(fill(form(), { agree: true }));
        expect(obj(doc, 10).entries.V).toBeUndefined();
    });
});

describe('pdfFormFill — errors', () => {
    const code = (fn) => { try { fn(); } catch (e) { return [e instanceof ContractError, e.code]; } return null; };
    test('bad values, an unknown field, a wrong value, a signature field', () => {
        const f = form();
        expect(code(() => fill(f, null))).toEqual([true, 'pdf/form/bad-values']);
        expect(code(() => fill(f, ['x']))).toEqual([true, 'pdf/form/bad-values']);
        expect(code(() => fill(f, { nope: 'x' }))).toEqual([true, 'pdf/form/unknown-field']);
        expect(code(() => fill(f, { addr: 'x' }))).toEqual([true, 'pdf/form/unknown-field']);
        for (const v of [{ name: 3 }, { agree: 'yes' }, { size: 'M' }, { size: 1 }, { color: 'green' }, { color: ['red'] }, { tags: [] }, { tags: [1] }]) {
            expect([Object.keys(v)[0], code(() => fill(f, v))]).toEqual([Object.keys(v)[0], [true, 'pdf/form/bad-value']]);
        }
        expect(code(() => fill(f, { sig: 'x' }))).toEqual([true, 'pdf/form/signature-field']);
    });
    test('a push button; a field with no fillable type', () => {
        const withPush = bytesOf(writeDocument({ indirects: [
            { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2), AcroForm: dict({ Fields: arr(ref(5), ref(6)) }) }) },
            { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(), Count: int(0) }) },
            { num: 5, gen: 0, value: dict(widget({ FT: name('Btn'), T: str('go'), Ff: int(1 << 16), Rect: rect(10, 10) })) },
            { num: 6, gen: 0, value: dict(widget({ T: str('bare'), Rect: rect(10, 10) })) }
        ], root: { num: 1, gen: 0 } }));
        expect(code(() => fill(withPush, { go: true }))).toEqual([true, 'pdf/form/bad-value']);
        expect(code(() => fill(withPush, { bare: 'x' }))).toEqual([true, 'pdf/form/bad-value']);
    });
    test('no AcroForm; an encrypted document', () => {
        const plain = bytesOf(writeDocument({ indirects: [
            { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2) }) },
            { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(), Count: int(0) }) }
        ], root: { num: 1, gen: 0 } }));
        expect(code(() => fill(plain, {}))).toEqual([true, 'pdf/form/no-acroform']);
        const enc = { version: 5, revision: 5, ownerPassword: 'o', userPassword: '', permissions: -4, randomBytes: (n) => new Uint8Array(n).fill(5) };
        const encrypted = writeEncryptedDocument({ indirects: [
            { num: 1, gen: 0, value: dict({ Type: name('Catalog'), Pages: ref(2) }) },
            { num: 2, gen: 0, value: dict({ Type: name('Pages'), Kids: arr(), Count: int(0) }) }
        ], root: { num: 1, gen: 0 }, encrypt: enc }).bytes;
        expect(code(() => fill(encrypted, {}))).toEqual([true, 'pdf/form/encrypted']);
    }, 20000);
});

/**
 * `bytes` with a letter in one in-use entry of its last cross-reference
 * table (`startxref` still right): a damaged base the reader refuses
 * strictly and rebuilds by default, while the section is still found.
 */
function damagedXrefEntry(bytes) {
    const s = new TextDecoder('latin1').decode(bytes);
    const table = s.lastIndexOf('\nxref');
    const entry = s.indexOf(' n', table) - 16;
    const moved = s.slice(0, entry) + 'x' + s.slice(entry + 1);
    return Uint8Array.from(moved, (c) => c.charCodeAt(0));
}

// T30 (b): the fill is an incremental update, so it reads its base with
// `recoverXref: false`: a damaged base is refused, though the default read
// rebuilds it.
describe('pdfFormFill.fill — a damaged base is refused (T30 b)', () => {
    test('a base with a broken cross-reference entry: the read rebuilds, the fill refuses', () => {
        const damaged = damagedXrefEntry(form());
        const doc = readDocument(damaged);
        expect(doc.losses.some((l) => l.code === 'pdf/document/xref-rebuilt')).toBe(true);
        let err = null;
        try { fill(damaged, { name: 'Ada' }); } catch (e) { err = e; }
        expect(err).not.toBeNull();
        expect(String(err.code)).toMatch(/^pdf\//);
        expect(fill(form(), { name: 'Ada' })).toBeInstanceOf(Uint8Array);
    });
});
