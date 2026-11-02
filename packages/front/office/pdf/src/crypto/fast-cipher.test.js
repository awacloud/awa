// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// The opt-in fast cipher of the decrypting read: the Standard handlers built
// here with an instrumented `aes` (counting the constant-time `fn` and the
// T-table `ttable.fn` key schedules), and `readDocument`'s `fastCipher`.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../main.js';
import { pdfStandardV4 } from './standardV4.js';
import { pdfStandardV5 } from './standardV5.js';
import { pdfStandardV6 } from './standardV6.js';

const rt = new ModuleRuntime();
rt.registerAll([...fw_require, ...modules]);
const errors = rt.resolve('pdfErrors');
const aes = rt.resolve('aes');
const [cbc, sha256, sha384, sha512, bitArray, gcm] = ['cbc', 'sha256', 'sha384', 'sha512', 'bitArray', 'pdfAesGcm'].map((n) => rt.resolve(n));
const { readDocument } = rt.resolve('pdfDocument');
const security = rt.resolve('pdfSecurity');
const { writeEncryptedDocument } = rt.resolve('pdfEncryptedWriter');
const { ContractError } = errors;

const te = new TextEncoder();
const td = new TextDecoder('latin1');
const name = (value) => ({ type: 'name', value });
const int = (value) => ({ type: 'int', value });
const ref = (num) => ({ type: 'ref', num, gen: 0 });
const CONTENT = 'BT /F1 12 Tf 72 720 Td (Hello, fast cipher) Tj ET';

function rand(seed) {
    let n = seed | 0;
    return (len) => {
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) { n = (n * 1103515245 + 12345) & 0x7fffffff; out[i] = n & 0xff; }
        return out;
    };
}

function write(encrypt) {
    const indirects = [
        { num: 1, gen: 0, value: { type: 'dict', entries: { Type: name('Catalog'), Pages: ref(2) } } },
        { num: 2, gen: 0, value: { type: 'dict', entries: { Type: name('Pages'), Kids: { type: 'array', items: [ref(3)] }, Count: int(1) } } },
        { num: 3, gen: 0, value: { type: 'dict', entries: { Type: name('Page'), Parent: ref(2), Contents: ref(4),
            MediaBox: { type: 'array', items: [int(0), int(0), int(612), int(792)] } } } },
        { num: 4, gen: 0, value: { type: 'stream', dict: { type: 'dict', entries: { Length: int(CONTENT.length) } }, raw: te.encode(CONTENT) } },
        { num: 5, gen: 0, value: { type: 'dict', entries: { Title: { type: 'string', value: te.encode('A fast title'), syntax: 'lit' } } } }
    ];
    return writeEncryptedDocument({ indirects, root: { num: 1, gen: 0 }, info: { num: 5, gen: 0 },
        encrypt: { ...encrypt, ownerPassword: 'owner', userPassword: 'user', permissions: -4, randomBytes: rand(11) } }).bytes;
}

/** An `aes` whose two key schedulers count their calls. */
function countingAes() {
    const counts = { fn: 0, ttable: 0 };
    return {
        counts,
        aes: {
            fn: (k, d) => { counts.fn++; return aes.fn(k, d); },
            ttable: { fn: (k, d) => { counts.ttable++; return aes.ttable.fn(k, d); } }
        }
    };
}

const HANDLERS = [
    { label: 'V4 AESV2', encrypt: { version: 4, revision: 4, method: 'AESV2' }, make: (a) => pdfStandardV4.factory(errors, a, cbc, bitArray) },
    { label: 'V5 R5', encrypt: { version: 5, revision: 5 }, make: (a) => pdfStandardV5.factory(errors, a, cbc, sha256, bitArray, gcm) },
    { label: 'V5 R6 AESV3', encrypt: { version: 5, revision: 6 }, make: (a) => pdfStandardV6.factory(errors, a, cbc, sha256, sha384, sha512, bitArray, gcm) }
];

describe('the Standard handlers: opts.fastCipher selects aes.ttable on the read', () => {
    for (const h of HANDLERS) {
        test(`${h.label}: the key check and the decryption through ttable.fn, the same results`, () => {
            const bytes = write(h.encrypt);
            const doc = readDocument(bytes, { allowEncrypted: true });
            const enc = doc.trailer.encrypt;
            const typed = security.typeEncryptDict(enc.type === 'dict' ? enc : doc._raw.resolve({ type: 'ref', num: enc.num, gen: enc.gen }));
            typed.idFirst = doc.trailer.id ? doc.trailer.id[0] : undefined;
            const title = doc._raw.resolve(ref(5)).entries.Title.value;
            const content = doc._raw.resolve(ref(4)).raw;
            const view = { method: h.encrypt.method || 'AESV3' };

            const slow = countingAes();
            const hs = h.make(slow.aes);
            const fekSlow = hs.tryPassword(typed, 'user', false).fileEncryptionKey;
            const titleSlow = hs.decryptString(view, fekSlow, 5, 0, title);
            const contentSlow = hs.decryptStream(view, fekSlow, 4, 0, content);
            expect(slow.counts.ttable).toBe(0);
            expect(slow.counts.fn).toBeGreaterThan(0);

            const fast = countingAes();
            const hf = h.make(fast.aes);
            const opts = { fastCipher: true };
            const fekFast = hf.tryPassword(typed, 'user', false, opts).fileEncryptionKey;
            const titleFast = hf.decryptString(view, fekFast, 5, 0, title, opts);
            const contentFast = hf.decryptStream(view, fekFast, 4, 0, content, opts);
            expect(fast.counts.fn).toBe(0);
            expect(fast.counts.ttable).toBeGreaterThan(0);

            expect(Array.from(fekFast)).toEqual(Array.from(fekSlow));
            expect(td.decode(titleFast)).toBe('A fast title');
            expect(td.decode(titleSlow)).toBe('A fast title');
            expect(td.decode(contentFast)).toBe(CONTENT);
            expect(td.decode(contentSlow)).toBe(CONTENT);
        }, 60000);
    }

    test('dispatchDecryptStream forwards opts', () => {
        const calls = [];
        const handler = { decryptStream: (...args) => { calls.push(args[5]); return new Uint8Array(0); } };
        const selection = { handler, method: 'AESV2', effMethod: 'AESV2' };
        security.dispatchDecryptStream(selection, { type: 'stream', dict: { type: 'dict', entries: {} } }, new Uint8Array(16), 4, 0, new Uint8Array(32), { fastCipher: true });
        security.dispatchDecryptStream(selection, { type: 'stream', dict: { type: 'dict', entries: {} } }, new Uint8Array(16), 4, 0, new Uint8Array(32));
        expect(calls).toEqual([{ fastCipher: true }, undefined]);
    });
});

describe('readDocument — opts.fastCipher', () => {
    const plain = (doc) => [td.decode(doc._raw.resolve(ref(4)).raw), td.decode(doc._raw.resolve(ref(5)).entries.Title.value)];

    for (const h of [...HANDLERS, { label: 'V5 R6 AESV4', encrypt: { version: 5, revision: 6, method: 'AESV4' } }]) {
        test(`${h.label}: the same objects with the fast cipher`, () => {
            const bytes = write(h.encrypt);
            expect(plain(readDocument(bytes, { password: 'user', fastCipher: true }))).toEqual([CONTENT, 'A fast title']);
            expect(plain(readDocument(bytes, { password: 'owner', fastCipher: true }))).toEqual([CONTENT, 'A fast title']);
            expect(plain(readDocument(bytes, { password: 'user', fastCipher: false }))).toEqual([CONTENT, 'A fast title']);
        }, 60000);
    }

    test('a bad value is a contract error; an unencrypted document is unchanged', () => {
        const bytes = write(HANDLERS[0].encrypt);
        for (const bad of ['yes', 1, null, {}]) {
            let err;
            try { readDocument(bytes, { password: 'user', fastCipher: bad }); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(ContractError);
            expect(err.code).toBe('pdf/document/bad-fast-cipher-option');
        }
    });
});
