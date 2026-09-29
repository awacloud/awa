// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Tests for the X-Wing hybrid KEM (`hybridKem` / `xwing`).
 *
 * Correctness oracle = the OFFICIAL IETF X-Wing KAT (tv0..tv2, draft
 * `draft-connolly-cfrg-xwing-kem` Appendix C), as committed in the in-repo
 * libsodium reference `references/CRYPTO-SRC/libsodium/test/default/kem_xwing.c`.
 * The primary claim is the FULL 32-byte shared-secret byte-match — a
 * self-consistent round-trip is NOT sufficient. Both surfaces are exercised:
 * the descriptor factory (manually wired) and the direct-ESM `xwing` singleton.
 *
 * The underlying ML-KEM-768 is already ACVP-green (src/crypto/pkc/ml_kem.acvp.md);
 * this file validates ONLY the hybrid composition, not the PQ primitive.
 */

import { describe, test, expect } from 'bun:test';
import { hybridKem, xwing as xwingDefault } from './hybridKem.js';
import { x25519 } from './x25519.js';
import { ml_kem } from './ml_kem.js';
import { sha3 } from '../hash/sha3.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { sha256 } from '../hash/sha256.js';
import { aes } from '../cipher/aes.js';
import { random } from '../utils/random.js';
import { XWING_KAT } from './__fixtures__/xwing-ietf-kat.js';

// --- Manually-wired descriptor surface -----------------------------------
const _bitArray = bitArray.factory();
const _utf8 = utf8.factory(_bitArray);
const _sha3 = sha3.factory(_bitArray, _utf8);
const _sha256 = sha256.factory(_bitArray, _utf8);
const _aes = aes.factory();
const _random = random.factory(_bitArray, _aes, _sha256);
const _x25519 = x25519.factory();
const _ml_kem = ml_kem.factory(_sha3, _bitArray, _random);

const xwing = hybridKem.factory(_x25519, _ml_kem, _sha3).xwing;

const fromHex = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const toHex = (u) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');

// Official IETF X-Wing KAT vectors (draft rev -06 Appendix C, tv0..tv2) now live
// in the co-located production fixture `./__fixtures__/xwing-ietf-kat.js`
// (relocated from the retired W0 spike). The regeneration proof lives in
// `hybrid-kat-regen.test.js`.

describe('hybridKem module', () => {
    test('should have correct module metadata', () => {
        expect(hybridKem.name).toBe('hybridKem');
        expect(hybridKem.type).toBe('fw.crypto.pkc');
        expect(hybridKem.dependencies).toEqual(['x25519', 'ml_kem', 'sha3']);
        expect(typeof hybridKem.factory).toBe('function');
    });

    describe('factory', () => {
        test('should expose the xwing API', () => {
            expect(typeof xwing.keygen).toBe('function');
            expect(typeof xwing.encapsulate).toBe('function');
            expect(typeof xwing.decapsulate).toBe('function');
            expect(xwing.lengths).toBeDefined();
        });
    });

    // Both surfaces share one implementation; parametrize the behavioural suites.
    const surfaces = [
        ['descriptor factory', xwing],
        ['direct-ESM singleton', xwingDefault]
    ];

    describe('lengths', () => {
        for (const [label, api] of surfaces) {
            test(`${label}: X-Wing draft constants`, () => {
                expect(api.lengths).toEqual({ pk: 1216, sk: 32, ct: 1120, ss: 32 });
            });
        }
    });

    describe('official IETF X-Wing KAT (tv0..tv2)', () => {
        for (const [label, api] of surfaces) {
            for (const v of XWING_KAT) {
                test(`${label} ${v.name}: full 32-byte shared-secret byte-match`, () => {
                    const kp = api.keygen(fromHex(v.seed));
                    expect(kp).not.toBe(false);
                    expect(kp.publicKey.length).toBe(1216);
                    expect(kp.secretKey.length).toBe(32);
                    // Public-key (ek) prefix — first 32 bytes.
                    expect(toHex(kp.publicKey.subarray(0, 32))).toBe(v.ekPrefix);

                    // Deterministic encapsulation with the published randomness.
                    const enc = api.encapsulate(kp.publicKey, fromHex(v.randomness));
                    expect(enc).not.toBe(false);
                    expect(enc.cipherText.length).toBe(1120);
                    expect(toHex(enc.cipherText.subarray(0, 26))).toBe(v.ctPrefix);
                    // PRIMARY claim: the full 32-byte shared secret.
                    expect(toHex(enc.sharedSecret)).toBe(v.ss);

                    // Decapsulation recovers the same shared secret.
                    const ss2 = api.decapsulate(enc.cipherText, kp.secretKey);
                    expect(ss2).not.toBe(false);
                    expect(toHex(ss2)).toBe(v.ss);
                });
            }
        }
    });

    describe('round-trip', () => {
        for (const [label, api] of surfaces) {
            test(`${label}: keygen → encaps → decaps shared secrets match`, () => {
                const kp = api.keygen();
                expect(kp).not.toBe(false);
                expect(kp.publicKey.length).toBe(1216);
                expect(kp.secretKey.length).toBe(32);
                const enc = api.encapsulate(kp.publicKey);
                expect(enc).not.toBe(false);
                expect(enc.cipherText.length).toBe(1120);
                expect(enc.sharedSecret.length).toBe(32);
                const ss2 = api.decapsulate(enc.cipherText, kp.secretKey);
                expect(ss2).not.toBe(false);
                expect(toHex(ss2)).toBe(toHex(enc.sharedSecret));
            });
        }
    });

    describe('tamper / implicit-reject', () => {
        test('flipping a ciphertext byte ⇒ different shared secret', () => {
            const kp = xwing.keygen();
            const enc = xwing.encapsulate(kp.publicKey);
            const bad = new Uint8Array(enc.cipherText);
            bad[0] ^= 0xff;                       // flip a byte in ct_ML-KEM
            const ss2 = xwing.decapsulate(bad, kp.secretKey);
            expect(ss2).not.toBe(false);          // ML-KEM FO implicit-reject
            expect(toHex(ss2)).not.toBe(toHex(enc.sharedSecret));
        });
    });

    describe('invalid input → false', () => {
        test('keygen: wrong-length seed', () => {
            expect(xwing.keygen(new Uint8Array(31))).toBe(false);
            expect(xwing.keygen(new Uint8Array(33))).toBe(false);
        });
        test('keygen: non-Uint8Array seed', () => {
            expect(xwing.keygen('nope')).toBe(false);
        });
        test('encapsulate: wrong-length public key', () => {
            expect(xwing.encapsulate(new Uint8Array(1215))).toBe(false);
            expect(xwing.encapsulate(new Uint8Array(1217))).toBe(false);
        });
        test('encapsulate: wrong-length randomness', () => {
            const kp = xwing.keygen();
            expect(xwing.encapsulate(kp.publicKey, new Uint8Array(63))).toBe(false);
        });
        test('decapsulate: wrong-length ciphertext', () => {
            const sk = new Uint8Array(32);
            expect(xwing.decapsulate(new Uint8Array(1119), sk)).toBe(false);
            expect(xwing.decapsulate(new Uint8Array(1121), sk)).toBe(false);
        });
        test('decapsulate: wrong-length secret key', () => {
            expect(xwing.decapsulate(new Uint8Array(1120), new Uint8Array(31))).toBe(false);
        });
    });
});
