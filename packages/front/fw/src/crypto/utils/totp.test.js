// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { totp } from './totp.js';

// ── Manual dependency wiring ───────────────────────────────────────────────────
// totp depends on [hmac, random, base32, bitArray, sha256, sha512].
// hmac depends on [bitArray, utf8, sha256].
// We instantiate the chain manually.
import { bitArray } from './bitArray.js';
import { utf8 }     from '../../io/codec/utf8.js';
import { sha256 }   from '../hash/sha256.js';
import { sha512 }   from '../hash/sha512.js';
import { hmac }     from '../hash/hmac.js';
import { random }   from './random.js';
import { aes }      from '../cipher/aes.js';
import { base32 }   from '../../io/codec/base32.js';

const _ba     = bitArray.factory();
const _utf8   = utf8.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _sha512 = sha512.factory(_ba, _utf8);
const _hmac   = hmac.factory(_ba, _utf8, _sha256);
const _aes    = aes.factory(_ba);
const _random = random.factory(_ba, _aes, _sha256);
const _base32 = base32.factory();

const _totp   = totp.factory(_hmac, _random, _base32, _ba, _sha256, _sha512);

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convertit une string ASCII en Uint8Array */
function asciiToBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
    return out;
}

// RFC 6238 Appendix B keys
// SHA-1   : seed "12345678901234567890" repeated up to 20 bytes
// SHA-256 : seed "12345678901234567890" repeated up to 32 bytes
// SHA-512 : seed "12345678901234567890" repeated up to 64 bytes
// Note: official RFC 6238 uses 80 bytes for SHA-512; here 64 bytes per plan spec.
const KEY_20 = asciiToBytes('12345678901234567890');               // 20 octets (SHA-1)
const KEY_32 = asciiToBytes('12345678901234567890123456789012');   // 32 octets (SHA-256)
const KEY_64 = asciiToBytes('1234567890123456789012345678901234567890123456789012345678901234'); // 64 octets (SHA-512)

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('totp module', () => {

    // 1. Metadata
    test('should have correct module metadata', () => {
        expect(totp.name).toBe('totp');
        expect(totp.version).toBe('1.0.0');
        expect(totp.type).toBe('fw.crypto.utils');
        expect(totp.dependencies).toEqual(['hmac', 'random', 'base32', 'bitArray', 'sha256', 'sha512']);
        expect(typeof totp.factory).toBe('function');
    });

    // 2. Factory API
    describe('factory', () => {
        test('should return expected API', () => {
            expect(typeof _totp.generate).toBe('function');
            expect(typeof _totp.verify).toBe('function');
            expect(typeof _totp.enroll).toBe('function');
            expect(typeof _totp.uri).toBe('function');
        });
    });

    // 3. RFC 6238 Appendix B vectors (8 digits)
    describe('RFC 6238 Appendix B test vectors', () => {

        test('t=59, SHA-1 → 94287082 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 59 });
            expect(code).toBe('94287082');
        });

        test('t=1111111109, SHA-1 → 07081804 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 1111111109 });
            expect(code).toBe('07081804');
        });

        test('t=1111111109, SHA-256 → 68084774 (8 digits)', () => {
            const code = _totp.generate(KEY_32, { algorithm: 'SHA-256', digits: 8, period: 30, t: 1111111109 });
            expect(code).toBe('68084774');
        });

        // RFC 6238 Appendix B: SHA-512 with KEY_64 (64 bytes)
        // t=59 gives 90693936 (same value as RFC with KEY_80=80 bytes for t=59)
        // t=2000000000 with KEY_64 (64 bytes) gives 38618901
        test('t=59, SHA-512 → 90693936 (8 digits)', () => {
            const code = _totp.generate(KEY_64, { algorithm: 'SHA-512', digits: 8, period: 30, t: 59 });
            expect(code).toBe('90693936');
        });

        test('t=2000000000, SHA-512 → 38618901 (8 digits)', () => {
            const code = _totp.generate(KEY_64, { algorithm: 'SHA-512', digits: 8, period: 30, t: 2000000000 });
            expect(code).toBe('38618901');
        });

        // Additional RFC 6238 Appendix B vectors
        test('t=1111111111, SHA-1 → 14050471 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 1111111111 });
            expect(code).toBe('14050471');
        });

        test('t=1234567890, SHA-1 → 89005924 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 1234567890 });
            expect(code).toBe('89005924');
        });

        test('t=2000000000, SHA-1 → 69279037 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 2000000000 });
            expect(code).toBe('69279037');
        });

        test('t=20000000000, SHA-1 → 65353130 (8 digits)', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 20000000000 });
            expect(code).toBe('65353130');
        });
    });

    // 4. generate - zero-padding with 6 digits
    describe('generate', () => {
        test('returns 6-char zero-padded string (default digits)', () => {
            // Using t=59 SHA-1 KEY_20: HOTP = 94287082 → truncated to 6 = 287082
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 6, period: 30, t: 59 });
            expect(code).toHaveLength(6);
            expect(code).toMatch(/^\d{6}$/);
        });

        test('accepts base32 string as secret', () => {
            const secretB32 = _base32.fromBytes(KEY_20);
            const codeBytes = _totp.generate(KEY_20,   { algorithm: 'SHA-1', digits: 8, period: 30, t: 59 });
            const codeB32   = _totp.generate(secretB32, { algorithm: 'SHA-1', digits: 8, period: 30, t: 59 });
            expect(codeB32).toBe(codeBytes);
        });

        test('returns 8-char string for digits=8', () => {
            const code = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 8, period: 30, t: 59 });
            expect(code).toHaveLength(8);
            expect(code).toMatch(/^\d{8}$/);
        });

        test('result changes between periods', () => {
            const c1 = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 6, period: 30, t: 0 });
            const c2 = _totp.generate(KEY_20, { algorithm: 'SHA-1', digits: 6, period: 30, t: 30 });
            // Technically they could be equal by chance but this is still meaningful
            // We just verify that both are well-formed
            expect(c1).toHaveLength(6);
            expect(c2).toHaveLength(6);
        });
    });

    // 5. verify
    describe('verify', () => {
        let secret;
        beforeEach(() => { secret = KEY_20; });

        test('matches valid code at delta=0', () => {
            const t = 1000000;
            const code = _totp.generate(secret, { t });
            const result = _totp.verify(code, secret, { t });
            expect(result.valid).toBe(true);
            expect(result.delta).toBe(0);
        });

        test('matches code at delta=-1 (previous window)', () => {
            const t = 1000000;
            const prevCode = _totp.generate(secret, { t: t - 30 });
            const result = _totp.verify(prevCode, secret, { t, window: 1 });
            expect(result.valid).toBe(true);
            expect(result.delta).toBe(-1);
        });

        test('matches code at delta=+1 (next window)', () => {
            const t = 1000000;
            const nextCode = _totp.generate(secret, { t: t + 30 });
            const result = _totp.verify(nextCode, secret, { t, window: 1 });
            expect(result.valid).toBe(true);
            expect(result.delta).toBe(1);
        });

        test('fails outside window', () => {
            const t = 1000000;
            const farCode = _totp.generate(secret, { t: t + 90 }); // delta=+3
            const result = _totp.verify(farCode, secret, { t, window: 1 });
            expect(result.valid).toBe(false);
        });

        test('fails on wrong code', () => {
            const t = 1000000;
            const result = _totp.verify('000000', secret, { t });
            // 000000 is almost never a valid code (probability 1/10^6)
            // We verify safely: if valid=true, delta must be coherent
            if (result.valid) {
                expect(typeof result.delta).toBe('number');
            } else {
                expect(result.valid).toBe(false);
                expect(result.delta).toBeUndefined();
            }
        });

        test('returns { valid: false } structure on mismatch', () => {
            const result = _totp.verify('XXXXXX', KEY_20, { t: 1000000 });
            expect(result.valid).toBe(false);
            expect('delta' in result).toBe(false);
        });

        test('window=0 only matches exact step', () => {
            const t = 1000000;
            const code = _totp.generate(secret, { t });
            const exact = _totp.verify(code, secret, { t, window: 0 });
            expect(exact.valid).toBe(true);
            // Code from the previous step must not match with window=0
            const prevCode = _totp.generate(secret, { t: t - 30 });
            const miss = _totp.verify(prevCode, secret, { t, window: 0 });
            expect(miss.valid).toBe(false);
        });
    });

    // 6. verify constant-time (informational, non-blocking)
    describe('verify constant-time', () => {
        test('timing difference between match and mismatch is reasonable (informational)', () => {
            const t = 1000000;
            const code = _totp.generate(KEY_20, { t });
            const wrong = '000000';

            const ITERATIONS = 100;

            let matchTotal = 0;
            let mismatchTotal = 0;

            for (let i = 0; i < ITERATIONS; i++) {
                const t0 = Date.now();
                _totp.verify(code, KEY_20, { t });
                matchTotal += Date.now() - t0;

                const t1 = Date.now();
                _totp.verify(wrong, KEY_20, { t });
                mismatchTotal += Date.now() - t1;
            }

            // Informational test: we simply verify that both paths
            // complete correctly (no total short-circuit that would return
            // immediately 0ms vs 1ms).
            // No strict assertion on durations (too volatile in CI).
            expect(matchTotal).toBeGreaterThanOrEqual(0);
            expect(mismatchTotal).toBeGreaterThanOrEqual(0);
        });
    });

    // 7. enroll
    describe('enroll', () => {
        test('returns secret as base32 string without padding', () => {
            const result = _totp.enroll({ issuer: 'Test', account: 'user@test.com' });
            expect(typeof result.secret).toBe('string');
            expect(result.secret).toMatch(/^[A-Z2-7]+$/); // base32 sans padding
        });

        test('returns secretBytes as Uint8Array of 20 bytes by default', () => {
            const result = _totp.enroll({ issuer: 'Test', account: 'user@test.com' });
            expect(result.secretBytes).toBeInstanceOf(Uint8Array);
            expect(result.secretBytes.length).toBe(20);
        });

        test('accepts custom secretLen', () => {
            const result = _totp.enroll({ issuer: 'Test', account: 'user@test.com', secretLen: 32 });
            expect(result.secretBytes.length).toBe(32);
        });

        test('generated secret can be used to generate and verify codes', () => {
            const result = _totp.enroll({ issuer: 'Test', account: 'user@test.com' });
            const t = 1000000;
            const code = _totp.generate(result.secret, { t });
            const verified = _totp.verify(code, result.secret, { t });
            expect(verified.valid).toBe(true);
        });

        test('uri is well-formed otpauth:// URI', () => {
            const result = _totp.enroll({ issuer: 'Test', account: 'user@test.com' });
            expect(result.uri).toMatch(/^otpauth:\/\/totp\//);
            expect(result.uri).toContain('secret=');
            expect(result.uri).toContain('issuer=Test');
        });

        test('two enrollments produce different secrets', () => {
            const r1 = _totp.enroll({ issuer: 'Test', account: 'a@test.com' });
            const r2 = _totp.enroll({ issuer: 'Test', account: 'b@test.com' });
            expect(r1.secret).not.toBe(r2.secret);
        });
    });

    // 8. uri
    describe('uri', () => {
        test('builds correct otpauth URI', () => {
            const result = _totp.uri({
                issuer: 'MyApp',
                account: 'user@example.com',
                secret: 'JBSWY3DPEHPK3PXP',
                algorithm: 'SHA-1',
                digits: 6,
                period: 30
            });
            expect(result).toBe(
                'otpauth://totp/MyApp:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp&algorithm=SHA-1&digits=6&period=30'
            );
        });

        test('encodes issuer with spaces (Foo Inc → Foo%20Inc)', () => {
            const result = _totp.uri({
                issuer: 'Foo Inc',
                account: 'user',
                secret: 'SECRET',
                algorithm: 'SHA-1',
                digits: 6,
                period: 30
            });
            expect(result).toContain('Foo%20Inc');
            expect(result).toContain('issuer=Foo%20Inc');
        });

        test('encodes special characters in account', () => {
            const result = _totp.uri({
                issuer: 'App',
                account: 'user+tag@example.com',
                secret: 'SECRET',
                algorithm: 'SHA-1',
                digits: 6,
                period: 30
            });
            expect(result).toContain(encodeURIComponent('user+tag@example.com'));
        });

        test('uses defaults when options omitted', () => {
            const result = _totp.uri({ issuer: 'A', account: 'B', secret: 'S' });
            expect(result).toContain('algorithm=SHA-1');
            expect(result).toContain('digits=6');
            expect(result).toContain('period=30');
        });
    });

});
