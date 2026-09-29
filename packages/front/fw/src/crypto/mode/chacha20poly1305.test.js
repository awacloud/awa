// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { chacha20 } from '../cipher/chacha20.js';
import { poly1305 } from '../hash/poly1305.js';
import { chacha20poly1305 } from './chacha20poly1305.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const _cc = chacha20.factory();
const _poly = poly1305.factory();
const _aead = chacha20poly1305.factory(_cc, _poly);

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('nonceTracker (iteration G2)', () => {
    const key = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
    const nonce = fromHex('070000004041424344454647');
    const pt = new TextEncoder().encode('hello');

    test('first encrypt with a nonce succeeds', () => {
        const t = _aead.nonceTracker(key);
        const r = t.encrypt(nonce, pt);
        expect(r).toBeTruthy();
        expect(t.seenNonces.size).toBe(1);
    });

    test('reuse of same nonce is rejected with CORRUPT warn', () => {
        const t = _aead.nonceTracker(key);
        t.encrypt(nonce, pt);
        const calls = [];
        const orig = console.error; console.error = (m) => calls.push(m);
        let r;
        try { r = t.encrypt(nonce, pt); }
        finally { console.error = orig; }
        expect(r).toBe(false);
        expect(calls[0]).toContain('CORRUPT');
        expect(calls[0]).toContain('nonce reuse');
    });

    test('different nonces are accepted independently', () => {
        const t = _aead.nonceTracker(key);
        const n2 = fromHex('070000004041424344454648');
        expect(t.encrypt(nonce, pt)).toBeTruthy();
        expect(t.encrypt(n2, pt)).toBeTruthy();
        expect(t.seenNonces.size).toBe(2);
    });

    test('decrypt does not consume the nonce set', () => {
        const t = _aead.nonceTracker(key);
        const enc = t.encrypt(nonce, pt);
        const dec = t.decrypt(nonce, enc.ct, enc.tag);
        expect(new TextDecoder().decode(dec)).toBe('hello');
        expect(t.seenNonces.size).toBe(1);  // unchanged
    });

    test('per-tracker scope: two trackers don\'t share state', () => {
        const t1 = _aead.nonceTracker(key);
        const t2 = _aead.nonceTracker(key);
        expect(t1.encrypt(nonce, pt)).toBeTruthy();
        expect(t2.encrypt(nonce, pt)).toBeTruthy();
    });
});

describe('chacha20poly1305 AEAD (RFC 8439)', () => {

    test('module metadata', () => {
        expect(chacha20poly1305.name).toBe('chacha20poly1305');
        expect(chacha20poly1305.dependencies).toEqual(['chacha20', 'poly1305']);
    });

    // ========================================================================
    // RFC 8439 §2.6.2 - Poly1305 key generation example
    // (counter=0 of ChaCha20(key, nonce) → first 32 bytes are the Poly1305 r||s)
    // ========================================================================

    test('§2.6.2 polyKey derivation (counter=0 of ChaCha20)', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('000000000001020304050607');
        const block = _cc.xor(key, nonce, new Uint8Array(64), 0);
        // Per §2.6.2, the Poly1305 one-time key is the first 32 bytes:
        expect(toHex(block.subarray(0, 32))).toBe(
            '8ad5a08b905f81cc815040274ab29471a833b637e3fd0da508dbb8e2fdd1a646'
        );
    });

    // ========================================================================
    // RFC 8439 §2.8.2 - AEAD example (KAT byte-exact ct + tag)
    // ========================================================================

    test('§2.8.2 AEAD encrypt KAT', () => {
        const key = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const aad = fromHex('50515253c0c1c2c3c4c5c6c7');
        const plaintext = new TextEncoder().encode(
            "Ladies and Gentlemen of the class of '99: " +
            "If I could offer you only one tip for the future, sunscreen would be it."
        );
        const { ct, tag } = _aead.encrypt(key, nonce, plaintext, aad);
        expect(toHex(ct)).toBe(
            'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116'
        );
        expect(toHex(tag)).toBe('1ae10b594f09e26a7e902ecbd0600691');
    });

    test('§2.8.2 AEAD decrypt KAT', () => {
        const key = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const aad = fromHex('50515253c0c1c2c3c4c5c6c7');
        const ct = fromHex(
            'd31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116'
        );
        const tag = fromHex('1ae10b594f09e26a7e902ecbd0600691');
        const pt = _aead.decrypt(key, nonce, ct, tag, aad);
        expect(new TextDecoder().decode(pt)).toBe(
            "Ladies and Gentlemen of the class of '99: " +
            "If I could offer you only one tip for the future, sunscreen would be it."
        );
    });

    // ========================================================================
    // RFC 8439 §A.5 - AEAD decryption test vector (different KAT)
    // (ciphertext + tag provided; verifies decrypt → plaintext byte-exact)
    // ========================================================================

    test('§A.5 AEAD decrypt KAT (different fixture)', () => {
        const key   = fromHex('1c9240a5eb55d38af333888604f6b5f0473917c1402b80099dca5cbc207075c0');
        const nonce = fromHex('000000000102030405060708');
        const aad   = fromHex('f33388860000000000004e91');
        const ct    = fromHex(
            '64a0861575861af460f062c79be643bd5e805cfd345cf389f108670ac76c8cb24c6cfc18755d43eea09ee94e382d26b0bdb7b73c321b0100d4f03b7f355894cf332f830e710b97ce98c8a84abd0b948114ad176e008d33bd60f982b1ff37c8559797a06ef4f0ef61c186324e2b3506383606907b6a7c02b0f9f6157b53c867e4b9166c767b804d46a59b5216cde7a4e99040c5a40433225ee282a1b0a06c523eaf4534d7f83fa1155b0047718cbc546a0d072b04b3564eea1b422273f548271a0bb2316053fa76991955ebd63159434ecebb4e466dae5a1073a6727627097a1049e617d91d361094fa68f0ff77987130305beaba2eda04df997b714d6c6f2c29a6ad5cb4022b02709b'
        );
        const tag   = fromHex('eead9d67890cbb22392336fea1851f38');
        const pt = _aead.decrypt(key, nonce, ct, tag, aad);
        expect(pt).not.toBe(false);
        expect(new TextDecoder().decode(pt)).toBe(
            "Internet-Drafts are draft documents valid for a maximum of six months " +
            "and may be updated, replaced, or obsoleted by other documents at any time. " +
            "It is inappropriate to use Internet-Drafts as reference material or to cite them other than as /“work in progress./”"
        );
    });

    // ========================================================================
    // Round-trips with edge cases - empty pt, empty aad, both empty.
    // ========================================================================

    test('round-trip with empty plaintext + non-empty AAD', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const aad   = fromHex('50515253c0c1c2c3c4c5c6c7');
        const { ct, tag } = _aead.encrypt(key, nonce, new Uint8Array(0), aad);
        expect(ct.length).toBe(0);
        expect(tag.length).toBe(16);
        const pt = _aead.decrypt(key, nonce, ct, tag, aad);
        expect(pt.length).toBe(0);
    });

    test('round-trip with empty AAD + non-empty plaintext', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const pt    = new TextEncoder().encode('Hello chacha20poly1305');
        const { ct, tag } = _aead.encrypt(key, nonce, pt, new Uint8Array(0));
        expect(ct.length).toBe(pt.length);
        const back = _aead.decrypt(key, nonce, ct, tag, new Uint8Array(0));
        expect(toHex(back)).toBe(toHex(pt));
    });

    test('round-trip with both empty (tag is MAC of empty input)', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const { ct, tag } = _aead.encrypt(key, nonce, new Uint8Array(0), new Uint8Array(0));
        expect(ct.length).toBe(0);
        expect(tag.length).toBe(16);
        // The tag of (empty pt, empty aad) = Poly1305(polyKey, [0..0 length-encoding])
        // - non-zero because the lengths field is appended and MAC'd.
        const pt = _aead.decrypt(key, nonce, ct, tag, new Uint8Array(0));
        expect(pt.length).toBe(0);
    });

    // ========================================================================
    // Tampering - every category MUST be rejected with `false`.
    // ========================================================================

    const tamperFixture = () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const aad   = fromHex('50515253c0c1c2c3c4c5c6c7');
        const pt    = new TextEncoder().encode('chacha20poly1305 tamper test');
        const { ct, tag } = _aead.encrypt(key, nonce, pt, aad);
        return { key, nonce, aad, pt, ct, tag };
    };

    test('decrypt rejects tampered ciphertext (every byte position)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        for (let i = 0; i < ct.length; i++) {
            const bad = new Uint8Array(ct);
            bad[i] ^= 0x01;
            expect(_aead.decrypt(key, nonce, bad, tag, aad)).toBe(false);
        }
    });

    test('decrypt rejects tampered tag (every byte position)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        for (let i = 0; i < 16; i++) {
            const bad = new Uint8Array(tag);
            bad[i] ^= 0x01;
            expect(_aead.decrypt(key, nonce, ct, bad, aad)).toBe(false);
        }
    });

    test('decrypt rejects tampered AAD (every byte position)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        for (let i = 0; i < aad.length; i++) {
            const bad = new Uint8Array(aad);
            bad[i] ^= 0x01;
            expect(_aead.decrypt(key, nonce, ct, tag, bad)).toBe(false);
        }
    });

    test('decrypt rejects altered nonce (cross-key/nonce binding)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        const bad = new Uint8Array(nonce);
        bad[0] ^= 0x01;
        expect(_aead.decrypt(key, bad, ct, tag, aad)).toBe(false);
    });

    test('decrypt rejects truncated ciphertext (cross to AAD-len embedding)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        // Truncate by 1 byte → length-encoding in MAC input changes → MAC mismatch.
        const truncated = ct.subarray(0, ct.length - 1);
        expect(_aead.decrypt(key, nonce, truncated, tag, aad)).toBe(false);
    });

    test('decrypt rejects appended ciphertext (cross to AAD-len embedding)', () => {
        const { key, nonce, aad, ct, tag } = tamperFixture();
        const extended = new Uint8Array(ct.length + 1);
        extended.set(ct, 0);
        extended[ct.length] = 0x42;
        expect(_aead.decrypt(key, nonce, extended, tag, aad)).toBe(false);
    });

    // ========================================================================
    // Validation - bad parameter shapes
    // ========================================================================

    test('encrypt rejects non-32-byte key', () => {
        expect(_aead.encrypt(new Uint8Array(31), new Uint8Array(12), new Uint8Array(4))).toBe(false);
    });

    test('encrypt rejects non-12-byte nonce', () => {
        expect(_aead.encrypt(new Uint8Array(32), new Uint8Array(11), new Uint8Array(4))).toBe(false);
    });

    test('decrypt rejects bad-length tag', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const ct = new Uint8Array(4);
        // 15-byte tag must be rejected by the underlying poly1305.verify length check.
        expect(_aead.decrypt(key, nonce, ct, new Uint8Array(15), new Uint8Array(0))).toBe(false);
        expect(_aead.decrypt(key, nonce, ct, new Uint8Array(17), new Uint8Array(0))).toBe(false);
    });

    // ========================================================================
    // Counter binding - encrypt MUST start ChaCha20 stream at counter=1
    // (counter=0 is reserved for the Poly1305 key).
    // Cross-check: the keystream used for ct is _cc.xor(key, nonce, ., 1).
    // ========================================================================

    test('encrypt uses ChaCha20 counter=1 for keystream (counter=0 is polyKey)', () => {
        const key   = fromHex('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
        const nonce = fromHex('070000004041424344454647');
        const pt    = new Uint8Array(64); for (let i = 0; i < 64; i++) pt[i] = i;
        const { ct } = _aead.encrypt(key, nonce, pt, new Uint8Array(0));
        // Re-derive the keystream block at counter=1 directly:
        const ks = _cc.xor(key, nonce, new Uint8Array(64), 1);
        const expected = new Uint8Array(64);
        for (let i = 0; i < 64; i++) expected[i] = pt[i] ^ ks[i];
        expect(toHex(ct)).toBe(toHex(expected));
    });
});
