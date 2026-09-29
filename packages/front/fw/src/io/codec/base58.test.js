// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { base58 } from './base58.js';

describe('base58 module', () => {
    test('should have correct module metadata', () => {
        expect(base58.name).toBe('base58');
        expect(base58.dependencies).toEqual([]);
        expect(typeof base58.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        test('should create codec instance', () => {
            codec = base58.factory();
            expect(codec).toBeDefined();
            expect(typeof codec.fromBytes).toBe('function');
            expect(typeof codec.toBytes).toBe('function');
            expect(typeof codec.test).toBe('function');
        });

        describe('fromBytes', () => {
            beforeEach(() => {
                codec = base58.factory();
            });

            test('should encode empty array to empty string', () => {
                expect(codec.fromBytes(new Uint8Array([]))).toBe('');
            });

            test('should encode single zero byte as "1"', () => {
                expect(codec.fromBytes(new Uint8Array([0]))).toBe('1');
            });

            test('should encode multiple leading zeros as leading 1s', () => {
                expect(codec.fromBytes(new Uint8Array([0, 0, 0]))).toBe('111');
                expect(codec.fromBytes(new Uint8Array([0, 0, 0, 0, 1]))).toBe('11112');
            });

            test('should encode single byte 0x61 ("a") as "2g"', () => {
                expect(codec.fromBytes(new Uint8Array([0x61]))).toBe('2g');
            });

            test('should encode "bbb" as "a3gV"', () => {
                expect(codec.fromBytes(new Uint8Array([0x62, 0x62, 0x62]))).toBe('a3gV');
            });

            test('should encode "ccc" as "aPEr"', () => {
                expect(codec.fromBytes(new Uint8Array([0x63, 0x63, 0x63]))).toBe('aPEr');
            });

            test('should encode "Hello World!" (known Bitcoin test vector)', () => {
                const bytes = new Uint8Array([
                    0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20,
                    0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21
                ]);
                expect(codec.fromBytes(bytes)).toBe('2NEpo7TZRRrLZSi2U');
            });

            test('should encode a long sentence (known Bitcoin test vector)', () => {
                const text = 'The quick brown fox jumps over the lazy dog.';
                const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                expect(codec.fromBytes(bytes)).toBe(
                    'USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z'
                );
            });

            test('should handle regular arrays', () => {
                expect(codec.fromBytes([0x61])).toBe('2g');
            });

            test('should preserve leading zeros with payload', () => {
                // [0, 0, 0x61] → "112g"
                expect(codec.fromBytes(new Uint8Array([0, 0, 0x61]))).toBe('112g');
            });
        });

        describe('toBytes', () => {
            beforeEach(() => {
                codec = base58.factory();
            });

            test('should decode empty string to empty array', () => {
                const result = codec.toBytes('');
                expect(result).toBeInstanceOf(Uint8Array);
                expect(result.length).toBe(0);
            });

            test('should decode "1" to single zero byte', () => {
                expect(codec.toBytes('1')).toEqual(new Uint8Array([0]));
            });

            test('should decode "111" to three zero bytes', () => {
                expect(codec.toBytes('111')).toEqual(new Uint8Array([0, 0, 0]));
            });

            test('should decode "11112" correctly', () => {
                expect(codec.toBytes('11112')).toEqual(new Uint8Array([0, 0, 0, 0, 1]));
            });

            test('should decode "2g" to 0x61', () => {
                expect(codec.toBytes('2g')).toEqual(new Uint8Array([0x61]));
            });

            test('should decode "a3gV" to "bbb"', () => {
                expect(codec.toBytes('a3gV')).toEqual(new Uint8Array([0x62, 0x62, 0x62]));
            });

            test('should decode "aPEr" to "ccc"', () => {
                expect(codec.toBytes('aPEr')).toEqual(new Uint8Array([0x63, 0x63, 0x63]));
            });

            test('should decode "2NEpo7TZRRrLZSi2U" to "Hello World!"', () => {
                const expected = new Uint8Array([
                    0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20,
                    0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21
                ]);
                expect(codec.toBytes('2NEpo7TZRRrLZSi2U')).toEqual(expected);
            });

            test('should decode long sentence', () => {
                const text = 'The quick brown fox jumps over the lazy dog.';
                const expected = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                expect(codec.toBytes('USm3fpXnKG5EUBx2ndxBDMPVciP5hGey2Jh4NDv6gmeo1LkMeiKrLJUUBk6Z'))
                    .toEqual(expected);
            });

            test('should throw on invalid characters', () => {
                expect(() => codec.toBytes('Hello0')).toThrow();  // '0' not in alphabet
                expect(() => codec.toBytes('HelloO')).toThrow();  // 'O' not in alphabet
                expect(() => codec.toBytes('HelloI')).toThrow();  // 'I' not in alphabet
                expect(() => codec.toBytes('Hellol')).toThrow();  // 'l' not in alphabet
                expect(() => codec.toBytes('Hello!')).toThrow();
            });
        });

        describe('roundtrip encoding/decoding', () => {
            beforeEach(() => {
                codec = base58.factory();
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
                const original = new Uint8Array(100);
                for (let i = 0; i < 100; i++) {
                    original[i] = Math.floor(Math.random() * 256);
                }
                const encoded = codec.fromBytes(original);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(original);
            });

            test('should preserve leading zero bytes through roundtrip', () => {
                const cases = [
                    new Uint8Array([0, 0x61]),
                    new Uint8Array([0, 0, 0x61, 0x62, 0x63]),
                    new Uint8Array([0, 0, 0, 0, 0, 0, 0xff]),
                    new Uint8Array([0, 0, 0, 0]),
                ];
                cases.forEach(original => {
                    const encoded = codec.fromBytes(original);
                    const decoded = codec.toBytes(encoded);
                    expect(decoded).toEqual(original);
                });
            });

            test('should roundtrip Bitcoin-like address payloads (20 bytes + checksum)', () => {
                // Simulate a Bitcoin-style address payload: 1 version + 20 hash + 4 checksum
                const payload = new Uint8Array(25);
                payload[0] = 0x00; // leading zero (mainnet prefix)
                for (let i = 1; i < 25; i++) payload[i] = (i * 7) & 0xff;
                const encoded = codec.fromBytes(payload);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(payload);
                expect(encoded[0]).toBe('1'); // version byte 0x00 => leading '1'
            });
        });

        describe('test', () => {
            beforeEach(() => {
                codec = base58.factory();
            });

            test('should validate correct Base58 strings', () => {
                expect(codec.test('')).toBe(true);
                expect(codec.test('1')).toBe(true);
                expect(codec.test('2g')).toBe(true);
                expect(codec.test('2NEpo7TZRRrLZSi2U')).toBe(true);
                expect(codec.test('abcdefghijkmnopqrstuvwxyz')).toBe(true);
                expect(codec.test('ABCDEFGHJKLMNPQRSTUVWXYZ')).toBe(true);
                expect(codec.test('123456789')).toBe(true);
            });

            test('should reject excluded characters', () => {
                expect(codec.test('0')).toBe(false);   // zero excluded
                expect(codec.test('O')).toBe(false);   // uppercase O excluded
                expect(codec.test('I')).toBe(false);   // uppercase I excluded
                expect(codec.test('l')).toBe(false);   // lowercase l excluded
                expect(codec.test('a0')).toBe(false);
                expect(codec.test('aO')).toBe(false);
                expect(codec.test('aI')).toBe(false);
                expect(codec.test('al')).toBe(false);
            });

            test('should reject non-alphabet characters', () => {
                expect(codec.test('Hello!')).toBe(false);
                expect(codec.test('abc def')).toBe(false);
                expect(codec.test('abc-def')).toBe(false);
                expect(codec.test('abc+def')).toBe(false);
            });
        });

        describe('edge cases', () => {
            beforeEach(() => {
                codec = base58.factory();
            });

            test('should handle large data', () => {
                const large = new Uint8Array(500);
                for (let i = 0; i < 500; i++) large[i] = i % 256;
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

            test('should handle all-zero bytes', () => {
                const zeros = new Uint8Array(10);
                const encoded = codec.fromBytes(zeros);
                expect(encoded).toBe('1111111111');
                expect(codec.toBytes(encoded)).toEqual(zeros);
            });

            test('should handle all-0xff bytes', () => {
                const all = new Uint8Array(10).fill(0xff);
                const encoded = codec.fromBytes(all);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(all);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls should return independent instances', () => {
                const codec1 = base58.factory();
                const codec2 = base58.factory();

                expect(codec1).not.toBe(codec2);
                expect(codec1.fromBytes).toBeDefined();
                expect(codec2.fromBytes).toBeDefined();

                const bytes = new Uint8Array([0x61, 0x62, 0x63]);
                expect(codec1.fromBytes(bytes)).toBe(codec2.fromBytes(bytes));
            });
        });
    });
});
