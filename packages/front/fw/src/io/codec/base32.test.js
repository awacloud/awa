// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { base32 } from './base32.js';

describe('base32 module', () => {
    test('should have correct module metadata', () => {
        expect(base32.name).toBe('base32');
        expect(base32.dependencies).toEqual([]);
        expect(typeof base32.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        test('should create codec instance', () => {
            codec = base32.factory();
            expect(codec).toBeDefined();
            expect(typeof codec.fromBytes).toBe('function');
            expect(typeof codec.toBytes).toBe('function');
            expect(typeof codec.test).toBe('function');
        });

        describe('fromBytes', () => {
            beforeEach(() => {
                codec = base32.factory();
            });

            test('should encode empty array', () => {
                const result = codec.fromBytes(new Uint8Array([]));
                expect(result).toBe('');
            });

            test('should encode single byte with padding', () => {
                // 1 byte -> 2 chars + 6 '=' = 8 chars
                const result = codec.fromBytes(new Uint8Array([0x66]));
                expect(result).toBe('MY======');
            });

            test('should encode two bytes with padding', () => {
                // 2 bytes -> 4 chars + 4 '=' = 8 chars
                const result = codec.fromBytes(new Uint8Array([0x66, 0x6f]));
                expect(result).toBe('MZXQ====');
            });

            test('should encode three bytes with padding', () => {
                // 3 bytes -> 5 chars + 3 '=' = 8 chars
                const result = codec.fromBytes(new Uint8Array([0x66, 0x6f, 0x6f]));
                expect(result).toBe('MZXW6===');
            });

            test('should encode four bytes with padding', () => {
                // 4 bytes -> 7 chars + 1 '=' = 8 chars
                const result = codec.fromBytes(new Uint8Array([0x66, 0x6f, 0x6f, 0x62]));
                expect(result).toBe('MZXW6YQ=');
            });

            test('should encode five bytes without padding', () => {
                // 5 bytes -> 8 chars, no padding
                const result = codec.fromBytes(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61]));
                expect(result).toBe('MZXW6YTB');
            });

            test('should encode "Hello" correctly (RFC 4648 test vector)', () => {
                // 'Hello' = [72, 101, 108, 108, 111] -> "JBSWY3DPEB======" ? no, 5 bytes = 'JBSWY3DP'
                const bytes = new Uint8Array([72, 101, 108, 108, 111]);
                expect(codec.fromBytes(bytes)).toBe('JBSWY3DP');
            });

            test('should encode "foo" correctly (RFC 4648 test vector)', () => {
                const bytes = new Uint8Array([0x66, 0x6f, 0x6f]);
                expect(codec.fromBytes(bytes)).toBe('MZXW6===');
            });

            test('should encode "foobar" correctly (RFC 4648 test vector)', () => {
                const bytes = new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
                expect(codec.fromBytes(bytes)).toBe('MZXW6YTBOI======');
            });

            test('should encode all zero bytes', () => {
                const result = codec.fromBytes(new Uint8Array([0, 0, 0, 0, 0]));
                expect(result).toBe('AAAAAAAA');
            });

            test('should encode all 255 bytes', () => {
                const result = codec.fromBytes(new Uint8Array([255, 255, 255, 255, 255]));
                expect(result).toBe('77777777');
            });

            test('should handle regular arrays', () => {
                const result = codec.fromBytes([0x66, 0x6f, 0x6f]);
                expect(result).toBe('MZXW6===');
            });

            test('output length should always be multiple of 8', () => {
                for (let n = 0; n <= 20; n++) {
                    const bytes = new Uint8Array(n);
                    for (let i = 0; i < n; i++) bytes[i] = i & 0xff;
                    const result = codec.fromBytes(bytes);
                    expect(result.length % 8).toBe(0);
                }
            });
        });

        describe('toBytes', () => {
            beforeEach(() => {
                codec = base32.factory();
            });

            test('should decode empty string', () => {
                const result = codec.toBytes('');
                expect(result).toBeInstanceOf(Uint8Array);
                expect(result.length).toBe(0);
            });

            test('should decode 8 chars (5 bytes, no padding)', () => {
                const result = codec.toBytes('MZXW6YTB');
                expect(result).toEqual(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61]));
            });

            test('should decode "JBSWY3DP" to "Hello"', () => {
                const result = codec.toBytes('JBSWY3DP');
                expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
            });

            test('should decode "MZXW6===" to "foo"', () => {
                const result = codec.toBytes('MZXW6===');
                expect(result).toEqual(new Uint8Array([0x66, 0x6f, 0x6f]));
            });

            test('should decode "MZXW6YTBOI======" to "foobar"', () => {
                const result = codec.toBytes('MZXW6YTBOI======');
                expect(result).toEqual(new Uint8Array([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]));
            });

            test('should decode padded single byte', () => {
                const result = codec.toBytes('MY======');
                expect(result).toEqual(new Uint8Array([0x66]));
            });

            test('should decode without padding', () => {
                const result = codec.toBytes('MZXW6');
                expect(result).toEqual(new Uint8Array([0x66, 0x6f, 0x6f]));
            });

            test('should accept lowercase input', () => {
                const result = codec.toBytes('mzxw6===');
                expect(result).toEqual(new Uint8Array([0x66, 0x6f, 0x6f]));
            });

            test('should decode all zero bytes', () => {
                const result = codec.toBytes('AAAAAAAA');
                expect(result).toEqual(new Uint8Array([0, 0, 0, 0, 0]));
            });

            test('should decode all 255 bytes', () => {
                const result = codec.toBytes('77777777');
                expect(result).toEqual(new Uint8Array([255, 255, 255, 255, 255]));
            });
        });

        describe('roundtrip encoding/decoding', () => {
            beforeEach(() => {
                codec = base32.factory();
            });

            test('should correctly roundtrip various byte lengths', () => {
                for (let len = 0; len <= 20; len++) {
                    const original = new Uint8Array(len);
                    for (let i = 0; i < len; i++) original[i] = i;
                    const encoded = codec.fromBytes(original);
                    const decoded = codec.toBytes(encoded);
                    expect(decoded).toEqual(original);
                }
            });

            test('should correctly roundtrip random data', () => {
                const original = new Uint8Array(200);
                for (let i = 0; i < 200; i++) {
                    original[i] = Math.floor(Math.random() * 256);
                }
                const encoded = codec.fromBytes(original);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(original);
            });

            test('should correctly roundtrip RFC 4648 test vectors', () => {
                const vectors = [
                    ['',       ''],
                    ['f',      'MY======'],
                    ['fo',     'MZXQ===='],
                    ['foo',    'MZXW6==='],
                    ['foob',   'MZXW6YQ='],
                    ['fooba',  'MZXW6YTB'],
                    ['foobar', 'MZXW6YTBOI======']
                ];
                vectors.forEach(([text, b32]) => {
                    const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                    expect(codec.fromBytes(bytes)).toBe(b32);
                    expect(codec.toBytes(b32)).toEqual(bytes);
                });
            });
        });

        describe('test', () => {
            beforeEach(() => {
                codec = base32.factory();
            });

            test('should validate correct Base32 strings', () => {
                expect(codec.test('')).toBe(true);
                expect(codec.test('MZXW6YTB')).toBe(true);
                expect(codec.test('JBSWY3DP')).toBe(true);
                expect(codec.test('MY======')).toBe(true);
                expect(codec.test('MZXQ====')).toBe(true);
                expect(codec.test('MZXW6===')).toBe(true);
                expect(codec.test('MZXW6YQ=')).toBe(true);
                expect(codec.test('MZXW6YTBOI======')).toBe(true);
            });

            test('should reject lowercase', () => {
                expect(codec.test('mzxw6===')).toBe(false);
                expect(codec.test('jbswy3dp')).toBe(false);
            });

            test('should reject invalid characters', () => {
                expect(codec.test('MZXW0===')).toBe(false); // '0' not in alphabet
                expect(codec.test('MZXW1===')).toBe(false); // '1' not in alphabet
                expect(codec.test('MZXW8===')).toBe(false); // '8' not in alphabet
                expect(codec.test('MZXW9===')).toBe(false); // '9' not in alphabet
                expect(codec.test('Hello!')).toBe(false);
                expect(codec.test('MZXW 6===')).toBe(false);
            });

            test('should reject invalid length (not multiple of 8)', () => {
                expect(codec.test('M')).toBe(false);
                expect(codec.test('MZ')).toBe(false);
                expect(codec.test('MZX')).toBe(false);
                expect(codec.test('MZXW')).toBe(false);
                expect(codec.test('MZXW6')).toBe(false);
                expect(codec.test('MZXW6YT')).toBe(false);
            });

            test('should reject invalid padding counts', () => {
                // Valid padding counts: 0, 1, 3, 4, 6 - reject 2, 5, 7
                expect(codec.test('MZXWYZ==')).toBe(false);  // 2 '='
                expect(codec.test('MZX=====')).toBe(false);  // 5 '='
                expect(codec.test('M=======')).toBe(false);  // 7 '='
            });

            test('should reject padding in middle', () => {
                expect(codec.test('MY======MZXW6===')).toBe(false);
                expect(codec.test('MZ=W6===')).toBe(false);
            });
        });

        describe('edge cases', () => {
            beforeEach(() => {
                codec = base32.factory();
            });

            test('should handle large data', () => {
                const large = new Uint8Array(1000);
                for (let i = 0; i < 1000; i++) large[i] = i % 256;
                const encoded = codec.fromBytes(large);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(large);
            });

            test('should handle all possible byte values', () => {
                const allBytes = new Uint8Array(256);
                for (let i = 0; i < 256; i++) allBytes[i] = i;
                const encoded = codec.fromBytes(allBytes);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(allBytes);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls should return independent instances', () => {
                const codec1 = base32.factory();
                const codec2 = base32.factory();

                expect(codec1).not.toBe(codec2);
                expect(codec1.fromBytes).toBeDefined();
                expect(codec2.fromBytes).toBeDefined();

                const bytes = new Uint8Array([0x66, 0x6f, 0x6f]);
                expect(codec1.fromBytes(bytes)).toBe(codec2.fromBytes(bytes));
            });
        });
    });
});
