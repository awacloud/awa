// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { b64 } from './b64.js';

describe('b64 module', () => {
    test('should have correct module metadata', () => {
        expect(b64.name).toBe('b64');
        expect(b64.dependencies).toEqual([]);
        expect(typeof b64.factory).toBe('function');
    });

    describe('factory', () => {
        let codec;

        test('should create codec instance', () => {
            codec = b64.factory();
            expect(codec).toBeDefined();
            expect(typeof codec.fromBytes).toBe('function');
            expect(typeof codec.toBytes).toBe('function');
            expect(typeof codec.test).toBe('function');
        });

        describe('fromBytes', () => {
            beforeEach(() => {
                codec = b64.factory();
            });

            test('should encode empty array', () => {
                const result = codec.fromBytes(new Uint8Array([]));
                expect(result).toBe('');
            });

            test('should encode single byte with padding', () => {
                const result = codec.fromBytes(new Uint8Array([65]));
                expect(result).toBe('QQ==');
            });

            test('should encode two bytes with padding', () => {
                const result = codec.fromBytes(new Uint8Array([65, 66]));
                expect(result).toBe('QUI=');
            });

            test('should encode three bytes without padding', () => {
                const result = codec.fromBytes(new Uint8Array([65, 66, 67]));
                expect(result).toBe('QUJD');
            });

            test('should encode "Hello" correctly', () => {
                const bytes = new Uint8Array([72, 101, 108, 108, 111]);
                const result = codec.fromBytes(bytes);
                expect(result).toBe('SGVsbG8=');
            });

            test('should encode "Hello World" correctly', () => {
                const bytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
                const result = codec.fromBytes(bytes);
                expect(result).toBe('SGVsbG8gV29ybGQ=');
            });

            test('should encode binary data', () => {
                const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
                const result = codec.fromBytes(bytes);
                expect(result).toBe('AAECAwQF');
            });

            test('should encode all zero bytes', () => {
                const bytes = new Uint8Array([0, 0, 0]);
                const result = codec.fromBytes(bytes);
                expect(result).toBe('AAAA');
            });

            test('should encode all 255 bytes', () => {
                const bytes = new Uint8Array([255, 255, 255]);
                const result = codec.fromBytes(bytes);
                expect(result).toBe('////');
            });

            test('should handle regular arrays', () => {
                const result = codec.fromBytes([65, 66, 67]);
                expect(result).toBe('QUJD');
            });
        });

        describe('toBytes', () => {
            beforeEach(() => {
                codec = b64.factory();
            });

            test('should decode empty string', () => {
                const result = codec.toBytes('');
                expect(result).toBeInstanceOf(Uint8Array);
                expect(result.length).toBe(0);
            });

            test('should decode single byte with padding', () => {
                const result = codec.toBytes('QQ==');
                expect(result).toEqual(new Uint8Array([65]));
            });

            test('should decode two bytes with padding', () => {
                const result = codec.toBytes('QUI=');
                expect(result).toEqual(new Uint8Array([65, 66]));
            });

            test('should decode three bytes without padding', () => {
                const result = codec.toBytes('QUJD');
                expect(result).toEqual(new Uint8Array([65, 66, 67]));
            });

            test('should decode "SGVsbG8=" to "Hello"', () => {
                const result = codec.toBytes('SGVsbG8=');
                expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
            });

            test('should decode "SGVsbG8gV29ybGQ=" to "Hello World"', () => {
                const result = codec.toBytes('SGVsbG8gV29ybGQ=');
                expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]));
            });

            test('should decode binary data', () => {
                const result = codec.toBytes('AAECAwQF');
                expect(result).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5]));
            });

            test('should decode all zero bytes', () => {
                const result = codec.toBytes('AAAA');
                expect(result).toEqual(new Uint8Array([0, 0, 0]));
            });

            test('should decode all 255 bytes', () => {
                const result = codec.toBytes('////');
                expect(result).toEqual(new Uint8Array([255, 255, 255]));
            });
        });

        describe('roundtrip encoding/decoding', () => {
            beforeEach(() => {
                codec = b64.factory();
            });

            test('should correctly roundtrip various byte lengths', () => {
                for (let len = 0; len <= 10; len++) {
                    const original = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        original[i] = i;
                    }
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

            test('should correctly roundtrip text data', () => {
                const texts = [
                    'A',
                    'AB',
                    'ABC',
                    'ABCD',
                    'Hello',
                    'Hello World',
                    'The quick brown fox jumps over the lazy dog'
                ];

                texts.forEach(text => {
                    const original = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                    const encoded = codec.fromBytes(original);
                    const decoded = codec.toBytes(encoded);
                    expect(decoded).toEqual(original);
                });
            });
        });

        describe('test', () => {
            beforeEach(() => {
                codec = b64.factory();
            });

            test('should validate correct Base64 strings', () => {
                expect(codec.test('QUJD')).toBe(true);
                expect(codec.test('QUI=')).toBe(true);
                expect(codec.test('QQ==')).toBe(true);
                expect(codec.test('SGVsbG8=')).toBe(true);
                expect(codec.test('SGVsbG8gV29ybGQ=')).toBe(true);
                expect(codec.test('AAECAwQF')).toBe(true);
            });

            test('should validate empty string', () => {
                expect(codec.test('')).toBe(true);
            });

            test('should reject invalid characters', () => {
                expect(codec.test('Hello!')).toBe(false);
                expect(codec.test('SGVs bG8=')).toBe(false);
                expect(codec.test('SGVs@bG8=')).toBe(false);
            });

            test('should reject incorrect padding', () => {
                expect(codec.test('QQ=')).toBe(false);
                expect(codec.test('QQ===')).toBe(false);
                expect(codec.test('QUJD=')).toBe(false);
            });

            test('should reject incorrect length', () => {
                expect(codec.test('Q')).toBe(false);
                expect(codec.test('QU')).toBe(false);
                expect(codec.test('QUJ')).toBe(false);
                expect(codec.test('QUJDQ')).toBe(false);
            });

            test('should accept valid Base64 with special characters', () => {
                expect(codec.test('AB+/')).toBe(true);
                expect(codec.test('AB+/==')).toBe(false);
                expect(codec.test('AB+/AB+/')).toBe(true);
            });

            test('should reject padding in middle', () => {
                expect(codec.test('QQ==QUJD')).toBe(false);
                expect(codec.test('QUI=QUJD')).toBe(false);
            });
        });

        describe('edge cases', () => {
            beforeEach(() => {
                codec = b64.factory();
            });

            test('should handle large data', () => {
                const large = new Uint8Array(1000);
                for (let i = 0; i < 1000; i++) {
                    large[i] = i % 256;
                }
                const encoded = codec.fromBytes(large);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(large);
            });

            test('should handle all possible byte values', () => {
                const allBytes = new Uint8Array(256);
                for (let i = 0; i < 256; i++) {
                    allBytes[i] = i;
                }
                const encoded = codec.fromBytes(allBytes);
                const decoded = codec.toBytes(encoded);
                expect(decoded).toEqual(allBytes);
            });
        });

        describe('factory isolation', () => {
            test('multiple factory calls should return independent instances', () => {
                const codec1 = b64.factory();
                const codec2 = b64.factory();

                expect(codec1).not.toBe(codec2);
                expect(codec1.fromBytes).toBeDefined();
                expect(codec2.fromBytes).toBeDefined();

                const bytes = new Uint8Array([65, 66, 67]);
                expect(codec1.fromBytes(bytes)).toBe(codec2.fromBytes(bytes));
            });
        });
    });
});
