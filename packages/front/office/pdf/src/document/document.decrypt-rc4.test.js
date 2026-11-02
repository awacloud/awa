// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// `readDocument(bytes, { password, legacyRc4 })`: RC4 V=1 / V=2 through the
// opt-in `pdfLegacyRc4Read` extra. PDF 2.0 forbids RC4 on write, so the
// fixtures are assembled here, /O and /U by ISO 32000-1 § 7.6.3.4
// Algorithms 3-5 over the extra's own primitives.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../main.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules, ...extras, ...bundle]);
const { readDocument } = rt.resolve('pdfDocument');
const rc4x = rt.resolve('pdfLegacyRc4Read');
const { ContractError, EncryptionError } = rt.resolve('pdfErrors');

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const ID = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const CONTENT = 'BT /F1 12 Tf 72 720 Td (RC4 world) Tj ET';
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/** /O by Algorithm 3 (R2: 40-bit, one RC4; R3: 50 MD5 rounds, 20 RC4 passes). */
function computeO(owner, user, revision, n) {
    let h = rc4x.md5(rc4x.padPassword(owner));
    if (revision >= 3) for (let i = 0; i < 50; i++) h = rc4x.md5(h.subarray(0, n));
    const key = h.subarray(0, n);
    let o = rc4x.rc4(key, rc4x.padPassword(user));
    if (revision >= 3) {
        for (let i = 1; i <= 19; i++) o = rc4x.rc4(key.map((b) => b ^ i), o);
    }
    return o;
}

/** A classic-xref RC4 file: catalog, pages, a page with a string, a content stream, Info. */
function rc4File({ revision, user = 'user', owner = 'owner' }) {
    const V = revision === 2 ? 1 : 2;
    const bits = revision === 2 ? 40 : 128;
    const P = -44;
    const O = computeO(owner, user, revision, bits / 8);
    const params = { O, P, idFirst: ID, revision, keyLength: bits };
    const fileKey = rc4x.computeFileKey(user, params);
    const U = rc4x.computeU(fileKey, ID, revision);
    const encS = (num, s) => `<${hex(rc4x.decryptString(fileKey, num, 0, te.encode(s)))}>`;
    const objs = {
        1: '<< /Type /Catalog /Pages 2 0 R >>',
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: `<< /Type /Page /Parent 2 0 R /Contents 4 0 R /MediaBox [0 0 612 792] /PieceInfo << /Note ${encS(3, 'a page string')} >> >>`,
        4: null,
        5: `<< /Title ${encS(5, 'An RC4 title')} >>`,
        6: `<< /Filter /Standard /V ${V} /R ${revision}${V === 2 ? ` /Length ${bits}` : ''} /P ${P} /O <${hex(O)}> /U <${hex(U)}> >>`
    };
    const content = rc4x.decryptStream(fileKey, 4, 0, te.encode(CONTENT));
    const parts = [];
    const offsets = [];
    let at = 0;
    const push = (u8) => { parts.push(u8); at += u8.length; };
    const text = (s) => push(Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));
    text('%PDF-1.4\n');
    for (let n = 1; n <= 6; n++) {
        offsets[n] = at;
        if (n === 4) {
            text(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`);
            push(content);
            text('\nendstream\nendobj\n');
        } else {
            text(`${n} 0 obj\n${objs[n]}\nendobj\n`);
        }
    }
    const xrefAt = at;
    let x = 'xref\n0 7\n0000000000 65535 f \n';
    for (let n = 1; n <= 6; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    text(x + `trailer\n<< /Size 7 /Root 1 0 R /Info 5 0 R /Encrypt 6 0 R /ID [<${hex(ID)}> <${hex(ID)}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`);
    const out = new Uint8Array(at);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
}

const ref = (num) => ({ type: 'ref', num, gen: 0 });
function plainOf(doc) {
    const r = doc._raw.resolve;
    return {
        pages: doc.pages.length,
        content: td.decode(r(ref(4)).raw),
        title: td.decode(r(ref(5)).entries.Title.value),
        page: td.decode(r(ref(3)).entries.PieceInfo.entries.Note.value)
    };
}
const PLAIN = { pages: 1, content: CONTENT, title: 'An RC4 title', page: 'a page string' };
const codeOf = (fn) => { try { fn(); } catch (e) { return [e.constructor.name, e.code]; } return null; };

describe('readDocument — RC4 V=1 / V=2 through legacyRc4 (A16c)', () => {
    for (const revision of [2, 3]) {
        test(`R${revision}: the user, the owner and the empty user password open it`, () => {
            const bytes = rc4File({ revision });
            expect(plainOf(readDocument(bytes, { password: 'user', legacyRc4: rc4x }))).toEqual(PLAIN);
            expect(plainOf(readDocument(bytes, { password: 'owner', legacyRc4: rc4x }))).toEqual(PLAIN);
            expect(plainOf(readDocument(rc4File({ revision, user: '' }), { password: '', legacyRc4: rc4x }))).toEqual(PLAIN);
        });
    }

    test('a wrong password; without legacyRc4 the handler stays unsupported; a bad option', () => {
        const bytes = rc4File({ revision: 3 });
        expect(codeOf(() => readDocument(bytes, { password: 'nope', legacyRc4: rc4x }))).toEqual(['EncryptionError', 'pdf/document/bad-password']);
        expect(codeOf(() => readDocument(bytes, { password: 'user' }))).toEqual(['EncryptionError', 'pdf/crypto/unsupported-version']);
        expect(codeOf(() => readDocument(bytes, { password: 'user', legacyRc4: {} }))).toEqual(['ContractError', 'pdf/document/bad-legacy-rc4-option']);
        expect(ContractError).toBeDefined();
        expect(EncryptionError).toBeDefined();
    });

    test('the pdf-legacy bundle passes its own extra under a password', () => {
        const api = rt.resolve('pdfLegacyBundle');
        expect(plainOf(api.read(rc4File({ revision: 2 }), { password: 'owner' }))).toEqual(PLAIN);
    });

    test('validateOwnerPassword recovers the user password from /O', () => {
        for (const revision of [2, 3]) {
            const bits = revision === 2 ? 40 : 128;
            const O = computeO('owner', 'user', revision, bits / 8);
            const params = { O, P: -44, idFirst: ID, revision, keyLength: bits };
            const fileKey = rc4x.computeFileKey('user', params);
            params.U = rc4x.computeU(fileKey, ID, revision);
            const r = rc4x.validateOwnerPassword('owner', params);
            expect(r.ok).toBe(true);
            expect([...r.fileKey]).toEqual([...fileKey]);
            expect(rc4x.validateOwnerPassword('user', params).ok).toBe(false);
        }
    });
});
