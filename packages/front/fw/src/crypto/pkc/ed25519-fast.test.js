// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// ed25519 after the unrolled field and the base table: keys and signatures
// equal node:crypto's byte for byte (Ed25519 is deterministic), verify agrees
// with node on valid and tampered input, the constant-time table path equals
// the public window path on every digit pattern, and the base multiplication
// reads its table by mask only (no secret-dependent index).

import { describe, test, expect } from 'bun:test';
import nodeCrypto from 'node:crypto';
import { ed25519 } from './ed25519.js';
import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';
import { INTERNAL } from '../../core/internal.js';

const ba = bitArray.factory();
const ed = ed25519.factory(sha512.factory(ba), ba);

let x = 0x9E3779B9;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };

const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const nodePriv = (seed) => nodeCrypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
const nodePub = (pk) => nodeCrypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pk)]), format: 'der', type: 'spki' });

describe('ed25519 against node:crypto', () => {
    test('public keys and signatures equal node\'s for 150 random seeds and messages', () => {
        for (let i = 0; i < 150; i++) {
            const seed = bytes(32), msg = bytes(rnd() % 300);
            const kp = ed.keyPair(seed);
            const want = nodeCrypto.createPublicKey(nodePriv(seed)).export({ format: 'der', type: 'spki' }).subarray(12);
            expect(Buffer.from(kp.publicKey).equals(want)).toBe(true);
            const sig = ed.sign(kp.privateKey, msg);
            expect(Buffer.from(sig).equals(nodeCrypto.sign(null, Buffer.from(msg), nodePriv(seed)))).toBe(true);
        }
    });

    test('verify agrees with node on valid, tampered and random signatures', () => {
        for (let i = 0; i < 100; i++) {
            const seed = bytes(32), msg = bytes(1 + (rnd() % 100));
            const kp = ed.keyPair(seed);
            const good = new Uint8Array(nodeCrypto.sign(null, Buffer.from(msg), nodePriv(seed)));
            const bad = good.slice(); bad[rnd() % 64] ^= 1 << (rnd() % 8);
            const junk = bytes(64);
            for (const sig of [good, bad, junk]) {
                expect(ed.verify(kp.publicKey, sig, msg)).toBe(nodeCrypto.verify(null, Buffer.from(msg), nodePub(kp.publicKey), Buffer.from(sig)));
            }
        }
    });
});

describe('ed25519 base multiplication', () => {
    test('the table path equals the window path on random and extreme scalars', () => {
        const scalars = [new Uint8Array(32), new Uint8Array(32).fill(0xff), new Uint8Array(32).fill(0x88), new Uint8Array(32).fill(0x77),
            Uint8Array.from({ length: 32 }, (_, i) => (i & 1 ? 0x80 : 0x08)), Uint8Array.from({ length: 32 }, (_, i) => i)];
        scalars[1][31] = 0x7f;     // below 2^255, as every caller's scalar
        scalars[2][31] = 0x78;
        for (let i = 0; i < 200; i++) { const s = bytes(32); s[31] &= 0x7f; scalars.push(s); }
        for (const s of scalars) {
            const { table, window } = ed[INTERNAL].baseMulBoth(s);
            expect(Buffer.from(table).toString('hex')).toBe(Buffer.from(window).toString('hex'));
        }
    });

    test('structure: the table is read by a full scan and masks, never at a digit-derived index', () => {
        const src = ed[INTERNAL].baseMulSource();
        expect(src).toMatch(/for\s*\(let j = 1;\s*j <= 8;\s*j\+\+\)/);   // every entry of the row is read
        expect(src).toContain('_cmov(');                          // merged by mask
        expect(src).not.toMatch(/row\[\s*(abs|digit|e\[)/);       // no digit-indexed entry
        expect(src).not.toMatch(/_baseTable\[\s*(abs|digit|e\[)/);
        expect(src).not.toMatch(/if\s*\(\s*(abs|digit|neg|e\[)/); // no branch on a digit
    });
});
