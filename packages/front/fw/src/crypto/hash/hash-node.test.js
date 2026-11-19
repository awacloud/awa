// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The rewritten compressions against node:crypto: sha256 / sha512 (one-shot
// and streamed in random chunks, bytes and bitArrays), sha3-256 / sha3-512,
// blake2b-512, HMAC-SHA-256, and PBKDF2-HMAC-SHA-256 (the fast path), on
// every length 0-300 and some large inputs.

import { describe, test, expect } from 'bun:test';
import nodeCrypto from 'node:crypto';
import { ModuleRuntime } from '../../core/runtime.js';
import modules from '../../core/modules.js';

const rt = new ModuleRuntime();
rt.registerAll(modules);
const ba = rt.resolve('bitArray');

let x = 0x9E3779B9;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };
const LENS = [...Array(301).keys(), 1000, 4096, 65549, 1 << 20];
const hex = (u8) => Buffer.from(u8).toString('hex');
const node = (alg, m) => nodeCrypto.createHash(alg).update(m).digest('hex');

describe('hashes against node:crypto', () => {
    for (const [name, alg] of [['sha256', 'sha256'], ['sha512', 'sha512'], ['sha384', 'sha384']]) {
        test(`${name}: one-shot, streamed bytes, streamed bitArray`, () => {
            const H = rt.resolve(name);
            for (const n of LENS) {
                const m = bytes(n), want = node(alg, m);
                expect(hex(ba.ba_to_ui8(H.hash(m)))).toBe(want);
                const s = new H.fn();
                for (let o = 0; o < n;) { const k = 1 + (rnd() % 300); s.update(m.subarray(o, o + k)); o += k; }
                expect(hex(ba.ba_to_ui8(s.finalize()))).toBe(want);
                if (n % 4 === 0 && n <= 4096) expect(hex(ba.ba_to_ui8(H.hash(ba.ui8_to_ba(m))))).toBe(want);
            }
        });
    }

    test('sha3-256 / sha3-512', () => {
        const S = rt.resolve('sha3');
        for (const n of LENS) {
            const m = bytes(n);
            expect(hex(ba.ba_to_ui8(S.sha3_256(m)))).toBe(node('sha3-256', m));
            expect(hex(ba.ba_to_ui8(S.sha3_512(m)))).toBe(node('sha3-512', m));
        }
    });

    test('blake2b-512, one-shot and streamed', () => {
        const B = rt.resolve('blake2b');
        for (const n of LENS) {
            const m = bytes(n), want = node('blake2b512', m);
            expect(hex(B.hash(m))).toBe(want);
            const c = B.create(64);
            for (let o = 0; o < n;) { const k = 1 + (rnd() % 300); c.update(m.subarray(o, o + k)); o += k; }
            expect(hex(c.digest())).toBe(want);
        }
    });

    test('HMAC-SHA-256 with keys shorter and longer than a block', () => {
        const H = rt.resolve('hmac');
        for (const n of LENS.slice(0, 200)) {
            const key = bytes(1 + (rnd() % 100)), m = bytes(n);
            const ours = new H.fn(ba.ui8_to_ba(key)).mac(m);
            expect(hex(ba.ba_to_ui8(ours))).toBe(nodeCrypto.createHmac('sha256', key).update(m).digest('hex'));
        }
    });

    test('HMAC-SHA-256 with a Uint8Array key (read as its bytes)', () => {
        const H = rt.resolve('hmac');
        for (let i = 0; i < 100; i++) {
            const key = bytes(1 + (rnd() % 100)), m = bytes(rnd() % 300);
            const want = nodeCrypto.createHmac('sha256', key).update(m).digest('hex');
            expect(hex(ba.ba_to_ui8(new H.fn(key).mac(m)))).toBe(want);
            expect(H.verify(key, m, ba.ui8_to_ba(Buffer.from(want, 'hex')))).toBe(true);
        }
    });

    test('PBKDF2-HMAC-SHA-256 (the two-compression fast path)', () => {
        const P = rt.resolve('pbkdf2');
        const warn = console.warn; console.warn = () => {};
        try {
            for (let i = 0; i < 25; i++) {
                const pw = bytes(1 + (rnd() % 90)), salt = bytes(rnd() % 30), it = 1 + (rnd() % 2000), len = 1 + (rnd() % 80);
                const ours = ba.ba_to_ui8(P.derive(ba.ui8_to_ba(pw), ba.ui8_to_ba(salt), it, len * 8));
                expect(hex(ours)).toBe(nodeCrypto.pbkdf2Sync(pw, salt, it, len, 'sha256').toString('hex'));
            }
        } finally { console.warn = warn; }
    });
});
