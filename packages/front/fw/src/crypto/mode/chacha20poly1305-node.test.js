// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// chacha20-poly1305 after the block on locals and poly1305 on 13-bit limbs:
// ciphertexts and tags equal node:crypto's (RFC 8439 AEAD) on random keys,
// nonces, AAD and messages of every length 0-300 and some large ones; node's
// output decrypts; a tampered tag is refused. And poly1305 carries no BigInt.

import { describe, test, expect } from 'bun:test';
import nodeCrypto from 'node:crypto';
import { chacha20poly1305 } from './chacha20poly1305.js';
import { chacha20 } from '../cipher/chacha20.js';
import { poly1305 } from '../hash/poly1305.js';

const aead = chacha20poly1305.factory(chacha20.factory(), poly1305.factory());

let x = 0x9E3779B9;
const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
const bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };

function nodeSeal(key, nonce, msg, aad) {
    const c = nodeCrypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    c.setAAD(aad, { plaintextLength: msg.length });
    const ct = Buffer.concat([c.update(msg), c.final()]);
    return { ct, tag: c.getAuthTag() };
}

describe('chacha20-poly1305 against node:crypto', () => {
    // Bun's node:crypto has no chacha20-poly1305: the oracle runs where it
    // exists (Node; the lane ran it there, 304 / 304 equal).
    const hasOracle = nodeCrypto.getCiphers().includes('chacha20-poly1305');
    test.if(hasOracle)('ciphertext and tag equal node\'s on lengths 0-300, 4096, 65549 and 1 MiB', () => {
        for (const n of [...Array(301).keys(), 4096, 65549, 1 << 20]) {
            const key = bytes(32), nonce = bytes(12), msg = bytes(n), aad = bytes(rnd() % 50);
            const ours = aead.encrypt(key, nonce, msg, aad);
            const want = nodeSeal(key, nonce, msg, aad);
            expect(Buffer.from(ours.ct).equals(want.ct)).toBe(true);
            expect(Buffer.from(ours.tag).equals(want.tag)).toBe(true);
            expect(Buffer.from(aead.decrypt(key, nonce, new Uint8Array(want.ct), new Uint8Array(want.tag), aad)).equals(Buffer.from(msg))).toBe(true);
            const bad = new Uint8Array(want.tag); bad[rnd() % 16] ^= 1 << (rnd() % 8);
            expect(aead.decrypt(key, nonce, new Uint8Array(want.ct), bad, aad)).toBe(false);
        }
    });
});

describe('poly1305', () => {
    const p = poly1305.factory();

    test('RFC 8439 §2.5.2 test vector', () => {
        const key = new Uint8Array(Buffer.from('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b', 'hex'));
        const msg = new TextEncoder().encode('Cryptographic Forum Research Group');
        expect(Buffer.from(p.mac(key, msg)).toString('hex')).toBe('a8061dc1305136c6c22b8baf0c0127a9');
    });

    test('edge keys: r and s all ones, all zeros; the h >= p reduction', () => {
        const ones = new Uint8Array(32).fill(0xff), zeros = new Uint8Array(32);
        const msg = new Uint8Array(64).fill(0xff);
        // RFC 8439 Appendix A.3 #5: r = 2, s = 0, message 0xff... → tag 03 00 ... 00
        const k5 = new Uint8Array(32); k5[0] = 2;
        expect(Buffer.from(p.mac(k5, new Uint8Array(16).fill(0xff))).toString('hex')).toBe('03000000000000000000000000000000');
        expect(p.mac(zeros, msg)).toEqual(new Uint8Array(16));
        expect(p.mac(ones, msg).length).toBe(16);
    });

    test('structure: no BigInt in the module', () => {
        const src = String(poly1305.factory);
        expect(src).not.toMatch(/BigInt|\d+n\b/);
    });
});
