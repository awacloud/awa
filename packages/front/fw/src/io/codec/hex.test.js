// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { hex } from './hex.js';

describe('hex module', () => {
	test('should have correct module metadata', () => {
		expect(hex.name).toBe('hex');
		expect(hex.dependencies).toEqual([]);
		expect(typeof hex.factory).toBe('function');
	});

	describe('factory', () => {
		let codec;

		beforeEach(() => {
			codec = hex.factory();
		});

		test('should create codec instance', () => {
			expect(codec).toBeDefined();
			expect(typeof codec.fromBytes).toBe('function');
			expect(typeof codec.toBytes).toBe('function');
		});

		describe('fromBytes', () => {
			test('should encode empty array', () => {
				const result = codec.fromBytes(new Uint8Array([]));
				expect(result).toBe('');
			});

			test('should encode single byte', () => {
				const result = codec.fromBytes(new Uint8Array([0]));
				expect(result).toBe('00');
			});

			test('should encode single byte (0xFF)', () => {
				const result = codec.fromBytes(new Uint8Array([255]));
				expect(result).toBe('ff');
			});

			test('should encode "Hello" to hex', () => {
				const bytes = new Uint8Array([72, 101, 108, 108, 111]);
				const result = codec.fromBytes(bytes);
				expect(result).toBe('48656c6c6f');
			});

			test('should encode "Hello World" to hex', () => {
				const bytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
				const result = codec.fromBytes(bytes);
				expect(result).toBe('48656c6c6f20576f726c64');
			});

			test('should use lowercase hex characters', () => {
				const bytes = new Uint8Array([0xAB, 0xCD, 0xEF]);
				const result = codec.fromBytes(bytes);
				expect(result).toBe('abcdef');
			});

			test('should encode all byte values 0-255', () => {
				const bytes = new Uint8Array(256);
				for (let i = 0; i < 256; i++) {
					bytes[i] = i;
				}
				const result = codec.fromBytes(bytes);
				expect(result.length).toBe(512);
				expect(result.substring(0, 2)).toBe('00');
				expect(result.substring(510, 512)).toBe('ff');
			});

			test('should encode binary data', () => {
				const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
				const result = codec.fromBytes(bytes);
				expect(result).toBe('000102030405');
			});

			test('should pad single digit hex values', () => {
				const bytes = new Uint8Array([0, 1, 15, 16]);
				const result = codec.fromBytes(bytes);
				expect(result).toBe('00010f10');
			});

			test('should handle regular arrays', () => {
				const result = codec.fromBytes([65, 66, 67]);
				expect(result).toBe('414243');
			});
		});

		describe('toBytes', () => {
			test('should decode empty string', () => {
				const result = codec.toBytes('');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBe(0);
			});

			test('should decode single byte', () => {
				const result = codec.toBytes('00');
				expect(result).toEqual(new Uint8Array([0]));
			});

			test('should decode single byte (0xFF)', () => {
				const result = codec.toBytes('ff');
				expect(result).toEqual(new Uint8Array([255]));
			});

			test('should decode uppercase hex', () => {
				const result = codec.toBytes('FF');
				expect(result).toEqual(new Uint8Array([255]));
			});

			test('should decode mixed case hex', () => {
				const result = codec.toBytes('FfAa');
				expect(result).toEqual(new Uint8Array([255, 170]));
			});

			test('should decode "48656c6c6f" to "Hello"', () => {
				const result = codec.toBytes('48656c6c6f');
				expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
			});

			test('should decode "48656c6c6f20576f726c64" to "Hello World"', () => {
				const result = codec.toBytes('48656c6c6f20576f726c64');
				expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]));
			});

			test('should decode binary data', () => {
				const result = codec.toBytes('000102030405');
				expect(result).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5]));
			});

			test('should decode all hex pairs', () => {
				const result = codec.toBytes('00010f10ff');
				expect(result).toEqual(new Uint8Array([0, 1, 15, 16, 255]));
			});
		});

		describe('roundtrip encoding/decoding', () => {
			test('should correctly roundtrip empty array', () => {
				const original = new Uint8Array([]);
				const encoded = codec.fromBytes(original);
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(original);
			});

			test('should correctly roundtrip single byte', () => {
				const original = new Uint8Array([42]);
				const encoded = codec.fromBytes(original);
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(original);
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

			test('should correctly roundtrip all possible byte values', () => {
				const original = new Uint8Array(256);
				for (let i = 0; i < 256; i++) {
					original[i] = i;
				}
				const encoded = codec.fromBytes(original);
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(original);
			});
		});

		describe('edge cases', () => {
			test('should handle large data', () => {
				const large = new Uint8Array(1000);
				for (let i = 0; i < 1000; i++) {
					large[i] = i % 256;
				}
				const encoded = codec.fromBytes(large);
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(large);
			});

			test('should produce correct length for encoded string', () => {
				const bytes = new Uint8Array([1, 2, 3, 4, 5]);
				const encoded = codec.fromBytes(bytes);
				expect(encoded.length).toBe(10); // 2 hex chars per byte
			});

			test('should handle even-length hex strings', () => {
				const result = codec.toBytes('0011223344');
				expect(result.length).toBe(5);
			});

			test('should handle consecutive zeros', () => {
				const bytes = new Uint8Array([0, 0, 0, 0]);
				const encoded = codec.fromBytes(bytes);
				expect(encoded).toBe('00000000');
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(bytes);
			});

			test('should handle consecutive 0xFF', () => {
				const bytes = new Uint8Array([255, 255, 255, 255]);
				const encoded = codec.fromBytes(bytes);
				expect(encoded).toBe('ffffffff');
				const decoded = codec.toBytes(encoded);
				expect(decoded).toEqual(bytes);
			});
		});

		describe('factory isolation', () => {
			test('multiple factory calls should return independent instances', () => {
				const codec1 = hex.factory();
				const codec2 = hex.factory();

				expect(codec1).not.toBe(codec2);
				expect(codec1.fromBytes).toBeDefined();
				expect(codec2.fromBytes).toBeDefined();

				const bytes = new Uint8Array([65, 66, 67]);
				expect(codec1.fromBytes(bytes)).toBe(codec2.fromBytes(bytes));
			});
		});

		describe('format validation', () => {
			test('fromBytes should always produce even-length strings', () => {
				for (let i = 0; i < 10; i++) {
					const bytes = new Uint8Array(i);
					const encoded = codec.fromBytes(bytes);
					expect(encoded.length % 2).toBe(0);
				}
			});

			test('fromBytes output should only contain valid hex characters', () => {
				const bytes = new Uint8Array([0, 15, 16, 255]);
				const encoded = codec.fromBytes(bytes);
				expect(/^[0-9a-f]*$/.test(encoded)).toBe(true);
			});
		});
	});
});
