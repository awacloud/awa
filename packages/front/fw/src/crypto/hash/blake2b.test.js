// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { blake2b } from './blake2b.js';
import { hex } from '../../io/codec/hex.js';

const _hex = hex.factory();
const B = blake2b.factory();

describe('blake2b module (RFC 7693)', () => {

    test('module metadata', () => {
        expect(blake2b.name).toBe('blake2b');
    });

    // ========================================================================
    // RFC 7693 §A - BLAKE2b-512("abc")
    // ========================================================================

    test('§A: hash of "abc" (BLAKE2b-512)', () => {
        const out = B.hash(new TextEncoder().encode('abc'));
        expect(_hex.fromBytes(out)).toBe(
            'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d1' +
            '7d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923'
        );
    });

    // BLAKE2b-512 of empty input - well-known reference vector.
    test('hash of empty input (BLAKE2b-512)', () => {
        const out = B.hash(new Uint8Array(0));
        expect(_hex.fromBytes(out)).toBe(
            '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419' +
            'd25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce'
        );
    });

    // BLAKE2b-256 of empty input - reference value (matches blake2b CLI / openssl).
    test('hash of empty input at outLen=32 (BLAKE2b-256)', () => {
        const out = B.hash(new Uint8Array(0), 32);
        expect(_hex.fromBytes(out)).toBe(
            '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'
        );
    });

    // ========================================================================
    // RFC 7693 §E - Official BLAKE2b self-test
    // Hashes a matrix of (outLen, inputLen, key) combinations, accumulating each
    // result into a BLAKE2b-32 digest. Final digest MUST equal a published
    // constant. Validates: parameter block packing, keyed mode, output truncation,
    // streaming, multi-block compression, and counter handling - in one shot.
    // ========================================================================

    test('§E self-test - final hash matches RFC constant', () => {
        // selftest_seq(out, len, seed) - Fibonacci-like PRG from RFC 7693 §E.
        const selftestSeq = (len, seed) => {
            const out = new Uint8Array(len);
            // a = 0xDEAD4BAD * seed (mod 2^32), b = 1
            let a = (0xDEAD4BAD * seed) >>> 0;
            let b = 1;
            for (let i = 0; i < len; i++) {
                const t = (a + b) >>> 0;
                a = b;
                b = t;
                out[i] = (t >>> 24) & 0xFF;
            }
            return out;
        };

        // BLAKE2b reference selftest: MD_LEN = {20, 32, 48, 64}, IN_LEN = {0, 3, 128, 129, 255, 1024}
        const outLens = [20, 32, 48, 64];
        const inLens  = [0, 3, 128, 129, 255, 1024];

        const acc = B.create(32);
        expect(acc).not.toBe(false);

        for (let i = 0; i < outLens.length; i++) {
            const outlen = outLens[i];
            for (let j = 0; j < inLens.length; j++) {
                const inlen = inLens[j];
                // Unkeyed
                const msg = selftestSeq(inlen, inlen);
                const md1 = B.hash(msg, outlen);
                acc.update(md1);
                // Keyed
                const key = selftestSeq(outlen, outlen);
                const md2 = B.hash(msg, outlen, key);
                acc.update(md2);
            }
        }

        const finalHash = acc.digest();
        expect(_hex.fromBytes(finalHash)).toBe(
            'c23a7800d98123bd10f506c61e29da5603d763b8bbad2e737f5e765a7bccd475'
        );
    }, 30_000);

    // ========================================================================
    // Length and streaming behaviour
    // ========================================================================

    test('shorter outLen is BLAKE2b-parameterised (NOT a prefix of full)', () => {
        const full = B.hash(new TextEncoder().encode('abc'));
        const out32 = B.hash(new TextEncoder().encode('abc'), 32);
        expect(out32.length).toBe(32);
        const out32b = B.hash(new TextEncoder().encode('abc'), 32);
        expect(_hex.fromBytes(out32)).toBe(_hex.fromBytes(out32b));
        // Per RFC 7693 §3.3: outLen is bound into the parameter block, so
        // BLAKE2b-256 ≠ truncate(BLAKE2b-512). This is a security feature.
        expect(_hex.fromBytes(out32)).not.toBe(_hex.fromBytes(full).slice(0, 64));
    });

    test('streaming matches one-shot (3-chunk update)', () => {
        const data = new Uint8Array(300);
        for (let i = 0; i < 300; i++) data[i] = i & 0xff;
        const oneShot = B.hash(data);
        const ctx = B.create();
        ctx.update(data.subarray(0, 100));
        ctx.update(data.subarray(100, 250));
        ctx.update(data.subarray(250));
        const streamed = ctx.digest();
        expect(_hex.fromBytes(streamed)).toBe(_hex.fromBytes(oneShot));
    });

    test('streaming matches one-shot across exact 128-byte block boundary', () => {
        const data = new Uint8Array(384);  // 3 blocks
        for (let i = 0; i < 384; i++) data[i] = (i * 31 + 7) & 0xff;
        const oneShot = B.hash(data);
        const ctx = B.create();
        for (let i = 0; i < 384; i += 128) {
            ctx.update(data.subarray(i, i + 128));
        }
        expect(_hex.fromBytes(ctx.digest())).toBe(_hex.fromBytes(oneShot));
    });

    test('streaming matches one-shot with byte-by-byte updates', () => {
        const data = new TextEncoder().encode('streaming-byte-by-byte');
        const oneShot = B.hash(data);
        const ctx = B.create();
        for (let i = 0; i < data.length; i++) ctx.update(data.subarray(i, i + 1));
        expect(_hex.fromBytes(ctx.digest())).toBe(_hex.fromBytes(oneShot));
    });

    test('digest is idempotent - second call after finalisation rejected', () => {
        const ctx = B.create();
        ctx.update(new Uint8Array([1, 2, 3]));
        const d1 = ctx.digest();
        // After finalisation, further updates must fail (no second digest path).
        expect(ctx.update(new Uint8Array([4]))).toBe(false);
        expect(d1.length).toBe(64);
    });

    // ========================================================================
    // Keyed BLAKE2b (MAC mode)
    // ========================================================================

    test('keyed hash differs from unkeyed and is deterministic', () => {
        const msg = new Uint8Array(256); for (let i = 0; i < 256; i++) msg[i] = i;
        const key = new Uint8Array(64);  for (let i = 0; i < 64; i++)  key[i] = i;
        const a = B.hash(msg, 64);
        const b = B.hash(msg, 64, key);
        expect(_hex.fromBytes(a)).not.toBe(_hex.fromBytes(b));
        const b2 = B.hash(msg, 64, key);
        expect(_hex.fromBytes(b)).toBe(_hex.fromBytes(b2));
    });

    test('different keys produce different outputs (key binding)', () => {
        const msg = new TextEncoder().encode('keyed-binding-test');
        const k1 = new Uint8Array(32); k1[0] = 1;
        const k2 = new Uint8Array(32); k2[0] = 2;
        expect(_hex.fromBytes(B.hash(msg, 32, k1)))
            .not.toBe(_hex.fromBytes(B.hash(msg, 32, k2)));
    });

    test('keyed hash with empty msg is deterministic and well-defined', () => {
        const key = new Uint8Array(64); for (let i = 0; i < 64; i++) key[i] = i;
        const out = B.hash(new Uint8Array(0), 64, key);
        expect(out.length).toBe(64);
        const out2 = B.hash(new Uint8Array(0), 64, key);
        expect(_hex.fromBytes(out)).toBe(_hex.fromBytes(out2));
    });

    // ========================================================================
    // Salt + personalization (RFC 7693 §2.5/2.8 - parameter block fields)
    // ========================================================================

    test('salt parameter binds into output (different salt → different hash)', () => {
        const msg = new TextEncoder().encode('salt-binding-test');
        const s1 = new Uint8Array(16); s1[0] = 1;
        const s2 = new Uint8Array(16); s2[0] = 2;
        const a = B.create(64, null, s1); a.update(msg);
        const b = B.create(64, null, s2); b.update(msg);
        expect(_hex.fromBytes(a.digest())).not.toBe(_hex.fromBytes(b.digest()));
    });

    test('personalization parameter binds into output (different person → different hash)', () => {
        const msg = new TextEncoder().encode('person-binding-test');
        const p1 = new Uint8Array(16); p1[0] = 1;
        const p2 = new Uint8Array(16); p2[0] = 2;
        const a = B.create(64, null, null, p1); a.update(msg);
        const b = B.create(64, null, null, p2); b.update(msg);
        expect(_hex.fromBytes(a.digest())).not.toBe(_hex.fromBytes(b.digest()));
    });

    test('salt vs personalization are distinct domains (same bytes → different hash)', () => {
        const msg = new TextEncoder().encode('domain-separation');
        const x = new Uint8Array(16); x[0] = 0xab;
        const a = B.create(64, null, x, null); a.update(msg);
        const b = B.create(64, null, null, x); b.update(msg);
        expect(_hex.fromBytes(a.digest())).not.toBe(_hex.fromBytes(b.digest()));
    });

    // ========================================================================
    // Validation - bad parameter shapes
    // ========================================================================

    test('rejects outLen out of range', () => {
        expect(B.create(0)).toBe(false);
        expect(B.create(65)).toBe(false);
    });

    test('rejects key > 64 bytes', () => {
        const longKey = new Uint8Array(65);
        expect(B.create(64, longKey)).toBe(false);
    });

    test('rejects salt of wrong length', () => {
        expect(B.create(64, null, new Uint8Array(15))).toBe(false);
        expect(B.create(64, null, new Uint8Array(17))).toBe(false);
    });

    test('rejects personalization of wrong length', () => {
        expect(B.create(64, null, null, new Uint8Array(15))).toBe(false);
        expect(B.create(64, null, null, new Uint8Array(17))).toBe(false);
    });
});
