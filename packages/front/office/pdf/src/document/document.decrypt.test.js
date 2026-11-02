// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// `readDocument(bytes, { password })`: the decrypting read (ISO 32000-2
// § 7.6), proved by round trips through `writeEncryptedDocument`.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const { readDocument } = rt.resolve('pdfDocument');
const pdf = rt.resolve('pdf');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { writeDocument } = rt.resolve('pdfWriter');
const security = rt.resolve('pdfSecurity');
const { ContractError, EncryptionError, ParseError } = rt.resolve('pdfErrors');

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const str = (s) => ({ type: 'string', value: te.encode(s), syntax: 'lit' });
const ref = (num) => ({ type: 'ref', num, gen: 0 });

function rand(seed) {
    let n = seed | 0;
    return (len) => {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) { n = (n * 1103515245 + 12345) & 0x7fffffff; out[i] = n & 0xff; }
        return out;
    };
}

const CONTENT = 'BT /F1 12 Tf 72 720 Td (Hello, encrypted world) Tj ET';
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:title>clear metadata</dc:title></x:xmpmeta>';
const SIG_CONTENTS = new Uint8Array([0x30, 0x82, 0x01, 0x02, 0xAA, 0xBB]);

/** Catalog, pages, one page (a string in its dict), content, Info, metadata, a signature dict. */
function graph() {
    return [
        { num: 1, gen: 0, value: { type: 'dict', entries: { Type: name('Catalog'), Pages: ref(2), Metadata: ref(6) } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: { Type: name('Pages'), Kids: { type: 'array', items: [ref(3)] }, Count: int(1) } } },
        { num: 3, gen: 0, value: { type: 'dict', entries: {
            Type: name('Page'), Parent: ref(2), Contents: ref(4), PZ: int(1),
            MediaBox: { type: 'array', items: [int(0), int(0), int(612), int(792)] },
            PieceInfo: { type: 'dict', entries: { Note: str('a page string') } }
        } } },
        { num: 4, gen: 0, value: { type: 'stream', dict: { type: 'dict', entries: { Length: int(CONTENT.length) } }, raw: te.encode(CONTENT) } },
        { num: 5, gen: 0, value: { type: 'dict', entries: { Title: str('An encrypted title') } } },
        { num: 6, gen: 0, value: { type: 'stream', dict: { type: 'dict', entries: { Type: name('Metadata'), Subtype: name('XML'), Length: int(XMP.length) } }, raw: te.encode(XMP) } },
        { num: 7, gen: 0, value: { type: 'dict', entries: {
            Type: name('Sig'), Name: str('the signer'),
            Contents: { type: 'string', value: SIG_CONTENTS, syntax: 'hex' },
            ByteRange: { type: 'array', items: [int(0), int(10), int(20), int(10)] }
        } } }
    ];
}

const CASES = [
    { label: 'V4 AESV2', encrypt: { version: 4, revision: 4, method: 'AESV2' } },
    { label: 'V4 RC4 (V2)', encrypt: { version: 4, revision: 4, method: 'V2' } },
    { label: 'V5 R5', encrypt: { version: 5, revision: 5 } },
    { label: 'V5 R6 AESV3', encrypt: { version: 5, revision: 6 } },
    { label: 'V5 R6 AESV4', encrypt: { version: 5, revision: 6, method: 'AESV4' } }
];

function write(c, { userPassword = 'user', encryptMetadata } = {}) {
    const encrypt = { ...c.encrypt, ownerPassword: 'owner', userPassword, permissions: -4, randomBytes: rand(7) };
    if (encryptMetadata !== undefined) encrypt.encryptMetadata = encryptMetadata;
    return writeEncryptedDocument({ indirects: graph(), root: { num: 1, gen: 0 }, info: { num: 5, gen: 0 }, encrypt }).bytes;
}

const text = (v) => td.decode(v.value);
function plainOf(doc) {
    const r = doc._raw.resolve;
    return {
        content: td.decode(r(ref(4)).raw),
        title: text(r(ref(5)).entries.Title),
        page: text(r(ref(3)).entries.PieceInfo.entries.Note),
        sigName: text(r(ref(7)).entries.Name)
    };
}
const PLAIN = { content: CONTENT, title: 'An encrypted title', page: 'a page string', sigName: 'the signer' };

describe('readDocument — opts.password decrypts (A16a)', () => {
    for (const c of CASES) {
        test(`${c.label}: the user, the owner and the empty user password open it`, () => {
            const bytes = write(c);
            expect(plainOf(readDocument(bytes, { password: 'user' }))).toEqual(PLAIN);
            expect(plainOf(readDocument(bytes, { password: te.encode('owner') }))).toEqual(PLAIN);
            expect(plainOf(pdf.read(write(c, { userPassword: '' }), { password: '' }))).toEqual(PLAIN);
            expect(readDocument(bytes, { password: 'user' }).pages).toHaveLength(1);
        }, 60000);   // R6: the key hardening of Algorithm 2.B is slow
    }

    test('a wrong password is a typed error', () => {
        let err;
        try { readDocument(write(CASES[0]), { password: 'nope' }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(EncryptionError);
        expect(err.code).toBe('pdf/document/bad-password');
    });

    test('without the option the read fails loud as before; a bad option is a contract error', () => {
        const bytes = write(CASES[2]);
        expect(() => readDocument(bytes)).toThrow(ParseError);
        let err;
        try { readDocument(bytes, { password: 42 }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ContractError);
        expect(err.code).toBe('pdf/document/bad-password-option');
    });

    test('an unencrypted document ignores the password; the password wins over allowEncrypted', () => {
        const clear = writeDocument({ indirects: graph(), root: { num: 1, gen: 0 }, info: { num: 5, gen: 0 } });
        const bytes = clear instanceof Uint8Array ? clear : clear.bytes;
        expect(plainOf(readDocument(bytes, { password: 'x' }))).toEqual(PLAIN);
        expect(plainOf(readDocument(write(CASES[0]), { password: 'user', allowEncrypted: true }))).toEqual(PLAIN);
    });

    test("a signature dictionary's /Contents is written clear and read as stored (A48)", () => {
        const bytes = write(CASES[0]);
        const stored = readDocument(bytes, { allowEncrypted: true })._raw.resolve(ref(7)).entries.Contents.value;
        expect([...stored]).toEqual([...SIG_CONTENTS]);
        const sig = readDocument(bytes, { password: 'user' })._raw.resolve(ref(7));
        expect([...sig.entries.Contents.value]).toEqual([...SIG_CONTENTS]);
        expect(text(sig.entries.Name)).toBe('the signer');
    });

    test('encryptMetadata false: the metadata stream is written clear and read clear', () => {
        for (const c of CASES.slice(0, 4)) {
            const bytes = write(c, { encryptMetadata: false });
            expect(td.decode(bytes)).toContain('clear metadata');
            const doc = readDocument(bytes, { password: 'user' });
            expect(td.decode(doc._raw.resolve(ref(6)).raw)).toBe(XMP);
            expect(plainOf(doc)).toEqual(PLAIN);
        }
        // Encrypted metadata by default.
        expect(td.decode(write(CASES[0]))).not.toContain('clear metadata');
    }, 60000);

    test('typeEncryptDict accepts the typed dictionary the reader yields', () => {
        const doc = readDocument(write(CASES[0]), { allowEncrypted: true });
        const node = doc._raw.resolve({ type: 'ref', ...doc.trailer.encrypt });
        const typed = security.typeEncryptDict(node);
        expect([typed.V, typed.R, typed.Length, typed.EncryptMetadata, typeof typed.P]).toEqual([4, 4, 128, true, 'number']);
        expect(typed.O).toBeInstanceOf(Uint8Array);
        expect(security.selectHandler(typed, { v4: rt.resolve('pdfStandardV4') }).method).toBe('AESV2');
    });
});

// A16b — object streams of an encrypted document. No writer encrypts an
// object stream, so the file is assembled here: AESV2 (its /Encrypt and
// file key from writeEncryptedDocument), the catalog, page tree and page
// inside an encrypted /Type /ObjStm, the content stream encrypted as a
// regular stream, an unfiltered /Type /XRef stream.
function encryptedObjStmFile() {
    const base = writeEncryptedDocument({
        indirects: graph(), root: { num: 1, gen: 0 },
        encrypt: { version: 4, revision: 4, method: 'AESV2', ownerPassword: 'owner', userPassword: 'user', permissions: -4, randomBytes: rand(11) }
    });
    const baseText = td.decode(base.bytes);
    const start = baseText.indexOf(`\n${base.encryptObjNum} 0 obj`) + `\n${base.encryptObjNum} 0 obj`.length;
    const encDict = baseText.slice(start, baseText.indexOf('endobj', start)).trim();
    const v4 = rt.resolve('pdfStandardV4');
    const enc = (num, plain) => v4.encryptStream({ method: 'AESV2' }, base.fek, num, 0, plain, rand(num * 31)(16));
    const members = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /MediaBox [0 0 612 792] /PieceInfo << /Note (inside the object stream) >> >>'
    ];
    let body = '', head = '';
    members.forEach((m, i) => { head += `${i + 1} ${body.length} `; body += m + '\n'; });
    const objStmPlain = te.encode(head + body);
    const parts = [];
    const offsets = {};
    let at = 0;
    const push = (u8) => { parts.push(u8); at += u8.length; };
    const pushText = (s) => push(Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));
    pushText('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    const stream = (num, dict, raw) => {
        offsets[num] = at;
        pushText(`${num} 0 obj\n<< ${dict} /Length ${raw.length} >>\nstream\n`);
        push(raw);
        pushText('\nendstream\nendobj\n');
    };
    stream(4, '', enc(4, te.encode(CONTENT)));
    stream(5, `/Type /ObjStm /N 3 /First ${head.length}`, enc(5, objStmPlain));
    offsets[6] = at;
    pushText(`6 0 obj\n${encDict}\nendobj\n`);
    const row = (t, f2, f3) => [t, (f2 >>> 24) & 255, (f2 >>> 16) & 255, (f2 >>> 8) & 255, f2 & 255, (f3 >>> 8) & 255, f3 & 255];
    const xrefData = Uint8Array.from([
        ...row(0, 0, 65535), ...row(2, 5, 0), ...row(2, 5, 1), ...row(2, 5, 2),
        ...row(1, offsets[4], 0), ...row(1, offsets[5], 0), ...row(1, offsets[6], 0), ...row(1, at, 0)
    ]);
    const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    const xrefAt = at;
    stream(7, `/Type /XRef /Size 8 /W [1 4 2] /Root 1 0 R /Encrypt 6 0 R /ID [<${hex(base.id[0])}> <${hex(base.id[1])}>]`, xrefData);
    pushText(`startxref\n${xrefAt}\n%%EOF\n`);
    const out = new Uint8Array(at);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

describe('readDocument — opts.password reads an encrypted object stream (A16b)', () => {
    test('the members are read as stored, the content stream decrypted', () => {
        const doc = readDocument(encryptedObjStmFile(), { password: 'user' });
        expect(doc.pages).toHaveLength(1);
        expect(text(doc._raw.resolve(ref(3)).entries.PieceInfo.entries.Note)).toBe('inside the object stream');
        expect(td.decode(doc._raw.resolve(ref(4)).raw)).toBe(CONTENT);
    });

    test('allowEncrypted still refuses the object stream', () => {
        let err;
        try { readDocument(encryptedObjStmFile(), { allowEncrypted: true }); } catch (e) { err = e; }
        expect(err && err.code).toBe('pdf/document/objstm-encrypted');
    });
});
