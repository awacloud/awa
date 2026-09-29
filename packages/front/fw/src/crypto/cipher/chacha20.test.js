// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { chacha20 } from './chacha20.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _cc = chacha20.factory();

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('chacha20 (RFC 8439)', () => {

    test('module metadata', () => {
        expect(chacha20.name).toBe('chacha20');
        expect(chacha20.dependencies).toEqual([]);
    });

    // ========================================================================
    // RFC 8439 §2.3.2 - Block function test vector
    // ========================================================================

    test('§2.3.2 block keystream (counter=1)', () => {
        const key = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
        const nonce = fromHex('000000090000004a00000000');
        const zero = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 1);
        expect(toHex(ks)).toBe(
            '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4ed2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e'
        );
    });

    // ========================================================================
    // RFC 8439 §2.4.2 - Encryption of "Sunscreen" plaintext (KAT byte-exact)
    // ========================================================================

    test('§2.4.2 encrypt "Ladies and Gentlemen..." (counter=1)', () => {
        const key = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
        const nonce = fromHex('000000000000004a00000000');
        const plaintext = new TextEncoder().encode(
            "Ladies and Gentlemen of the class of '99: " +
            "If I could offer you only one tip for the future, sunscreen would be it."
        );
        const ct = _cc.xor(key, nonce, plaintext, 1);
        expect(toHex(ct)).toBe(
            '6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0bf91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d807ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab77937365af90bbf74a35be6b40b8eedf2785e42874d'
        );
        // Round-trip
        const pt = _cc.xor(key, nonce, ct, 1);
        expect(new TextDecoder().decode(pt)).toBe(
            "Ladies and Gentlemen of the class of '99: " +
            "If I could offer you only one tip for the future, sunscreen would be it."
        );
    });

    // ========================================================================
    // RFC 8439 §A.1 - Block function test vectors (4 cases)
    // ========================================================================

    test('§A.1.1 zero key, zero nonce, counter=0', () => {
        const key   = new Uint8Array(32);
        const nonce = new Uint8Array(12);
        const zero  = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 0);
        expect(toHex(ks)).toBe(
            '76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586'
        );
    });

    test('§A.1.2 zero key, zero nonce, counter=1', () => {
        const key   = new Uint8Array(32);
        const nonce = new Uint8Array(12);
        const zero  = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 1);
        expect(toHex(ks)).toBe(
            '9f07e7be5551387a98ba977c732d080dcb0f29a048e3656912c6533e32ee7aed29b721769ce64e43d57133b074d839d531ed1f28510afb45ace10a1f4b794d6f'
        );
    });

    test('§A.1.3 key=0..00 01, zero nonce, counter=1', () => {
        const key   = new Uint8Array(32); key[31] = 0x01;
        const nonce = new Uint8Array(12);
        const zero  = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 1);
        expect(toHex(ks)).toBe(
            '3aeb5224ecf849929b9d828db1ced4dd832025e8018b8160b82284f3c949aa5a8eca00bbb4a73bdad192b5c42f73f2fd4e273644c8b36125a64addeb006c13a0'
        );
    });

    test('§A.1.4 key=00ff..00, zero nonce, counter=2', () => {
        const key   = new Uint8Array(32); key[1] = 0xff;
        const nonce = new Uint8Array(12);
        const zero  = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 2);
        expect(toHex(ks)).toBe(
            '72d54dfbf12ec44b362692df94137f328fea8da73990265ec1bbbea1ae9af0ca13b25aa26cb4a648cb9b9d1be65b2c0924a66c54d545ec1b7374f4872e99f096'
        );
    });

    test('§A.1.5 zero key, nonce=0..02, counter=0', () => {
        const key   = new Uint8Array(32);
        const nonce = new Uint8Array(12); nonce[11] = 0x02;
        const zero  = new Uint8Array(64);
        const ks = _cc.xor(key, nonce, zero, 0);
        expect(toHex(ks)).toBe(
            'c2c64d378cd536374ae204b9ef933fcd1a8b2288b3dfa49672ab765b54ee27c78a970e0e955c14f3a88e741b97c286f75f8fc299e8148362fa198a39531bed6d'
        );
    });

    // ========================================================================
    // RFC 8439 §A.2 - Encryption test vectors (3 cases)
    // ========================================================================

    test('§A.2.1 encrypt 64 zero bytes - zero key/nonce, counter=0', () => {
        const key   = new Uint8Array(32);
        const nonce = new Uint8Array(12);
        const pt    = new Uint8Array(64);
        const ct = _cc.xor(key, nonce, pt, 0);
        expect(toHex(ct)).toBe(
            '76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586'
        );
    });

    test('§A.2.2 encrypt "Any submission..." - key=0..01, nonce=0..02, counter=1', () => {
        const key   = new Uint8Array(32); key[31] = 0x01;
        const nonce = new Uint8Array(12); nonce[11] = 0x02;
        const pt = new TextEncoder().encode(
            "Any submission to the IETF intended by the Contributor for publication " +
            "as all or part of an IETF Internet-Draft or RFC and any statement made " +
            "within the context of an IETF activity is considered an \"IETF Contribution\". " +
            "Such statements include oral statements in IETF sessions, as well as written " +
            "and electronic communications made at any time or place, which are addressed to"
        );
        const ct = _cc.xor(key, nonce, pt, 1);
        expect(toHex(ct)).toBe(
            'a3fbf07df3fa2fde4f376ca23e82737041605d9f4f4f57bd8cff2c1d4b7955ec2a97948bd3722915c8f3d337f7d370050e9e96d647b7c39f56e031ca5eb6250d4042e02785ececfa4b4bb5e8ead0440e20b6e8db09d881a7c6132f420e527950' +
            '42bdfa7773d8a9051447b3291ce1411c680465552aa6c405b7764d5e87bea85ad00f8449ed8f72d0d662ab052691ca66424bc86d2df80ea41f43abf937d3259dc4b2d0dfb48a6c9139ddd7f76966e928e635553ba76c5c879d7b35d49eb2e62b' +
            '0871cdac638939e25e8a1e0ef9d5280fa8ca328b351c3c765989cbcf3daa8b6ccc3aaf9f3979c92b3720fc88dc95ed84a1be059c6499b9fda236e7e818b04b0bc39c1e876b193bfe5569753f88128cc08aaa9b63d1a16f80ef2554d7189c411f' +
            '5869ca52c5b83fa36ff216b9c1d30062bebcfd2dc5bce0911934fda79a86f6e698ced759c3ff9b6477338f3da4f9cd8514ea9982ccafb341b2384dd902f3d1ab7ac61dd29c6f21ba5b862f3730e37cfdc4fd806c22f221'
        );
    });

    test('§A.2.3 encrypt long para - key=1c.., nonce=0..02, counter=42', () => {
        const key   = fromHex('1c9240a5eb55d38af333888604f6b5f0473917c1402b80099dca5cbc207075c0');
        const nonce = new Uint8Array(12); nonce[11] = 0x02;
        const pt = new TextEncoder().encode(
            "'Twas brillig, and the slithy toves\n" +
            "Did gyre and gimble in the wabe:\n" +
            "All mimsy were the borogoves,\n" +
            "And the mome raths outgrabe."
        );
        const ct = _cc.xor(key, nonce, pt, 42);
        expect(toHex(ct)).toBe(
            '62e6347f95ed87a45ffae7426f27a1df5fb69110044c0d73118effa95b01e5cf166d3df2d721caf9b21e5fb14c616871fd84c54f9d65b283196c7fe4f60553ebf39c6402c42234e32a356b3e764312a61a5532055716ead6962568f87d3f3f7704c6a8d1bcd1bf4d50d6154b6da731b187b58dfd728afa36757a797ac188d1'
        );
    });

    // ========================================================================
    // Counter-wraparound and offset behaviour
    // ========================================================================

    test('multi-block encryption equals concatenation of single blocks', () => {
        const key   = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
        const nonce = fromHex('000000090000004a00000000');
        const pt    = new Uint8Array(192);
        for (let i = 0; i < 192; i++) pt[i] = (i * 13 + 7) & 0xff;
        // Encrypt as a single 192-byte stream starting at counter=0
        const ctAll = _cc.xor(key, nonce, pt, 0);
        // Encrypt block-by-block with counter advancing
        const out = new Uint8Array(192);
        for (let i = 0; i < 3; i++) {
            const block = _cc.xor(key, nonce, pt.subarray(i * 64, (i + 1) * 64), i);
            out.set(block, i * 64);
        }
        expect(toHex(ctAll)).toBe(toHex(out));
    });

    test('keystream is involution (xor(xor(pt))=pt)', () => {
        const key   = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
        const nonce = fromHex('000000090000004a00000000');
        const pt    = new Uint8Array(513);
        for (let i = 0; i < 513; i++) pt[i] = i & 0xff;
        const ct = _cc.xor(key, nonce, pt, 1);
        const back = _cc.xor(key, nonce, ct, 1);
        expect(toHex(back)).toBe(toHex(pt));
    });

    // ========================================================================
    // Validation negatifs
    // ========================================================================

    test('rejects non-32-byte key', () => {
        expect(_cc.xor(new Uint8Array(31), new Uint8Array(12), new Uint8Array(4))).toBe(false);
    });

    test('rejects non-12-byte nonce', () => {
        expect(_cc.xor(new Uint8Array(32), new Uint8Array(11), new Uint8Array(4))).toBe(false);
    });

    test('accepts empty plaintext', () => {
        const out = _cc.xor(new Uint8Array(32), new Uint8Array(12), new Uint8Array(0));
        expect(out.length).toBe(0);
    });

    // ── Iteration G3 - Counter overflow + XChaCha20 reject ────────────────
    describe('counter overflow guard (iteration G3)', () => {
        const key = new Uint8Array(32);
        const nonce = new Uint8Array(12);

        test('rejects when initialCounter would overflow on multi-block call', () => {
            // Need 2 blocks (65 bytes) starting at counter 0xFFFFFFFF
            // → would use counters {0xFFFFFFFF, 0x100000000} = overflow.
            const data = new Uint8Array(65);
            const calls = [];
            const orig = console.warn; console.warn = (m) => calls.push(m);
            let r;
            try { r = _cc.xor(key, nonce, data, 0xFFFFFFFF); }
            finally { console.warn = orig; }
            expect(r).toBe(false);
            expect(calls[0]).toContain('LIMIT-EXCEEDED');
            expect(calls[0]).toContain('counter overflow');
        });

        test('accepts last legal counter value with single block', () => {
            // counter = 0xFFFFFFFF, exactly 1 block needed → no overflow.
            const data = new Uint8Array(64);
            const out = _cc.xor(key, nonce, data, 0xFFFFFFFF);
            expect(out).toBeInstanceOf(Uint8Array);
            expect(out.length).toBe(64);
        });

        test('accepts default counter=0 with normal payload', () => {
            const out = _cc.xor(key, nonce, new Uint8Array(128));
            expect(out.length).toBe(128);
        });
    });

    describe('xchacha20 explicit reject (iteration G3)', () => {
        test('xchacha20() returns false + warns NOT-IMPLEMENTED', () => {
            const calls = [];
            const orig = console.warn; console.warn = (m) => calls.push(m);
            let r;
            try { r = _cc.xchacha20(); }
            finally { console.warn = orig; }
            expect(r).toBe(false);
            expect(calls[0]).toContain('NOT-IMPLEMENTED');
            expect(calls[0]).toContain('XChaCha20');
        });
    });
});
