// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `readDocument` of an encrypted document read with no
 * password tries the empty one (T30 (c), D45): a file it opens reads,
 * one `pdf/document/opened-with-empty-password` loss recording it; a file
 * it does not open, and `emptyPassword: false`, throw
 * `pdf/document/encrypted` as 1.x did.
 */

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, pkg_require, modules } from '../main.js';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of pkg_require) rt.register(m);
for (const m of modules) rt.register(m);

const { readDocument } = rt.resolve('pdfDocument');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const obj = rt.resolve('pdfParser').obj;

/** One page, AES-128 (V4 AESV2), the given user password, owner `owner`, permissions -4. */
function aesFile(userPassword) {
    let n = 11;
    const randomBytes = (len) => {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) { n = (Math.imul(n, 1103515245) + 12345) >>> 0; out[i] = n >>> 24; }
        return out;
    };
    return writeEncryptedDocument({
        indirects: [
            { num: 1, gen: 0, value: obj.dict({ Type: obj.name('Catalog'), Pages: obj.ref(2, 0) }) },
            { num: 2, gen: 0, value: obj.dict({ Type: obj.name('Pages'), Kids: obj.array([obj.ref(3, 0)]), Count: obj.int(1) }) },
            { num: 3, gen: 0, value: obj.dict({ Type: obj.name('Page'), Parent: obj.ref(2, 0), MediaBox: obj.array([obj.int(0), obj.int(0), obj.int(10), obj.int(10)]) }) }
        ],
        root: { num: 1, gen: 0 },
        encrypt: { version: 4, revision: 4, method: 'AESV2', ownerPassword: 'owner', userPassword, permissions: -4, randomBytes }
    }).bytes;
}

const codeOf = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const opened = (doc) => doc.losses.filter((l) => l.code === 'pdf/document/opened-with-empty-password');

describe('readDocument — the empty password by default (T30 c)', () => {
    test('an empty user password: the read opens it and records it, with the permission bits', () => {
        const doc = readDocument(aesFile(''));
        expect(doc.pages.length).toBe(1);
        expect(opened(doc)).toHaveLength(1);
        expect(opened(doc)[0].context.permissions).toBe(-4);
    });

    test('emptyPassword: false keeps the 1.x refusal', () => {
        expect(codeOf(() => readDocument(aesFile(''), { emptyPassword: false }))).toBe('pdf/document/encrypted');
    });

    test('a real user password: still pdf/document/encrypted, not bad-password', () => {
        expect(codeOf(() => readDocument(aesFile('user')))).toBe('pdf/document/encrypted');
        expect(readDocument(aesFile('user'), { password: 'user' }).pages.length).toBe(1);
        expect(codeOf(() => readDocument(aesFile('user'), { password: 'nope' }))).toBe('pdf/document/bad-password');
    });

    test('a password given, or allowEncrypted, is read as before: no record', () => {
        expect(opened(readDocument(aesFile(''), { password: '' }))).toEqual([]);
        const raw = readDocument(aesFile(''), { allowEncrypted: true });
        expect(opened(raw)).toEqual([]);
    });
});
