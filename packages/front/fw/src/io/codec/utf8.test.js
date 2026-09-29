// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { utf8 } from './utf8.js';

describe('utf8 module', () => {
	test('should have correct module metadata', () => {
		expect(utf8.name).toBe('utf8');
		expect(utf8.dependencies).toEqual([]);
		expect(typeof utf8.factory).toBe('function');
	});

	describe('factory', () => {
		let codec;

		beforeEach(() => {
			codec = utf8.factory();
		});

		test('should create codec instance', () => {
			expect(codec).toBeDefined();
			expect(typeof codec.toBytes).toBe('function');
			expect(typeof codec.fromBytes).toBe('function');
		});

		describe('toBytes', () => {
			test('should encode empty string', () => {
				const result = codec.toBytes('');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBe(0);
			});

			test('should encode ASCII characters', () => {
				const result = codec.toBytes('Hello');
				expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
			});

			test('should encode "Hello World"', () => {
				const result = codec.toBytes('Hello World');
				expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]));
			});

			test('should encode single ASCII character', () => {
				const result = codec.toBytes('A');
				expect(result).toEqual(new Uint8Array([65]));
			});

			test('should encode numbers as string', () => {
				const result = codec.toBytes('123');
				expect(result).toEqual(new Uint8Array([49, 50, 51]));
			});

			test('should encode special characters', () => {
				const result = codec.toBytes('!@#');
				expect(result).toEqual(new Uint8Array([33, 64, 35]));
			});

			test('should encode multi-byte characters (é)', () => {
				const result = codec.toBytes('é');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBeGreaterThan(1);
			});

			test('should encode multi-byte characters (café)', () => {
				const result = codec.toBytes('café');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBeGreaterThan(4);
			});

			test('should encode emoji', () => {
				const result = codec.toBytes('😀');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBeGreaterThan(1);
			});

			test('should encode Chinese characters', () => {
				const result = codec.toBytes('世界');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBeGreaterThan(2);
			});

			test('should encode mixed ASCII and Unicode', () => {
				const result = codec.toBytes('Hello 世界');
				expect(result).toBeInstanceOf(Uint8Array);
				expect(result.length).toBeGreaterThan(8);
			});

			test('should encode newlines', () => {
				const result = codec.toBytes('Hello\nWorld');
				expect(result).toBeInstanceOf(Uint8Array);
			});

			test('should encode tabs', () => {
				const result = codec.toBytes('Hello\tWorld');
				expect(result).toBeInstanceOf(Uint8Array);
			});
		});

		describe('fromBytes', () => {
			test('should decode empty array', () => {
				const result = codec.fromBytes(new Uint8Array([]));
				expect(result).toBe('');
			});

			test('should decode ASCII characters', () => {
				const result = codec.fromBytes(new Uint8Array([72, 101, 108, 108, 111]));
				expect(result).toBe('Hello');
			});

			test('should decode "Hello World"', () => {
				const result = codec.fromBytes(new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]));
				expect(result).toBe('Hello World');
			});

			test('should decode single ASCII character', () => {
				const result = codec.fromBytes(new Uint8Array([65]));
				expect(result).toBe('A');
			});

			test('should decode numbers', () => {
				const result = codec.fromBytes(new Uint8Array([49, 50, 51]));
				expect(result).toBe('123');
			});

			test('should decode special characters', () => {
				const result = codec.fromBytes(new Uint8Array([33, 64, 35]));
				expect(result).toBe('!@#');
			});

			test('should decode two-byte UTF-8 sequence (é)', () => {
				const result = codec.fromBytes(new Uint8Array([195, 169]));
				expect(result).toBe('é');
			});

			test('should decode three-byte UTF-8 sequence', () => {
				const result = codec.fromBytes(new Uint8Array([228, 184, 150]));
				expect(result).toBe('世');
			});

			test('should decode regular arrays', () => {
				const result = codec.fromBytes([72, 101, 108, 108, 111]);
				expect(result).toBe('Hello');
			});

			test('should decode null byte', () => {
				const result = codec.fromBytes(new Uint8Array([0]));
				expect(result.length).toBe(1);
			});
		});

		describe('roundtrip encoding/decoding', () => {
			test('should correctly roundtrip empty string', () => {
				const original = '';
				const encoded = codec.toBytes(original);
				const decoded = codec.fromBytes(encoded);
				expect(decoded).toBe(original);
			});

			test('should correctly roundtrip ASCII text', () => {
				const texts = [
					'A',
					'Hello',
					'Hello World',
					'The quick brown fox jumps over the lazy dog',
					'1234567890',
					'!@#$%^&*()',
					'abc123XYZ'
				];

				texts.forEach(text => {
					const encoded = codec.toBytes(text);
					const decoded = codec.fromBytes(encoded);
					expect(decoded).toBe(text);
				});
			});

			test('should correctly roundtrip Unicode text', () => {
				const texts = [
					'café',
					'naïve',
					'Zürich',
					'москва',
					'日本',
					'世界',
					'Hello 世界',
					'Ñoño'
				];

				texts.forEach(text => {
					const encoded = codec.toBytes(text);
					const decoded = codec.fromBytes(encoded);
					expect(decoded).toBe(text);
				});
			});

			test('should correctly roundtrip mixed content', () => {
				const original = 'Hello 世界! 123 café';
				const encoded = codec.toBytes(original);
				const decoded = codec.fromBytes(encoded);
				expect(decoded).toBe(original);
			});

			test('should correctly roundtrip whitespace', () => {
				const texts = [
					' ',
					'  ',
					'\t',
					'\n',
					'\r\n',
					'Hello\nWorld',
					'Hello\tWorld'
				];

				texts.forEach(text => {
					const encoded = codec.toBytes(text);
					const decoded = codec.fromBytes(encoded);
					expect(decoded).toBe(text);
				});
			});

			test('should correctly roundtrip all printable ASCII', () => {
				let original = '';
				for (let i = 32; i <= 126; i++) {
					original += String.fromCharCode(i);
				}
				const encoded = codec.toBytes(original);
				const decoded = codec.fromBytes(encoded);
				expect(decoded).toBe(original);
			});
		});

		describe('edge cases', () => {
			test('should handle long strings', () => {
				const original = 'Hello World '.repeat(100);
				const encoded = codec.toBytes(original);
				const decoded = codec.fromBytes(encoded);
				expect(decoded).toBe(original);
			});

			test('should handle repeated Unicode characters', () => {
				const original = '世'.repeat(10);
				const encoded = codec.toBytes(original);
				const decoded = codec.fromBytes(encoded);
				expect(decoded).toBe(original);
			});

			test('should handle single byte values 0-127', () => {
				for (let i = 0; i < 128; i++) {
					const char = String.fromCharCode(i);
					if (i >= 32 && i <= 126) { // Printable ASCII
						const encoded = codec.toBytes(char);
						const decoded = codec.fromBytes(encoded);
						expect(decoded).toBe(char);
					}
				}
			});

			test('should encode result as Uint8Array', () => {
				const result = codec.toBytes('Hello');
				expect(result).toBeInstanceOf(Uint8Array);
			});

			test('should decode result as string', () => {
				const result = codec.fromBytes(new Uint8Array([72, 101, 108, 108, 111]));
				expect(typeof result).toBe('string');
			});
		});

		describe('UTF-8 encoding validation', () => {
			test('ASCII characters should encode to single bytes', () => {
				const result = codec.toBytes('ABC');
				expect(result.length).toBe(3);
			});

			test('two-byte UTF-8 characters should be encoded correctly', () => {
				const result = codec.toBytes('é');
				expect(result.length).toBe(2);
				expect(result[0]).toBeGreaterThanOrEqual(192);
				expect(result[0]).toBeLessThan(224);
			});

			test('three-byte UTF-8 characters should be encoded correctly', () => {
				const result = codec.toBytes('世');
				expect(result.length).toBe(3);
				expect(result[0]).toBeGreaterThanOrEqual(224);
			});
		});

		describe('factory isolation', () => {
			test('multiple factory calls should return independent instances', () => {
				const codec1 = utf8.factory();
				const codec2 = utf8.factory();

				expect(codec1).not.toBe(codec2);
				expect(codec1.toBytes).toBeDefined();
				expect(codec2.toBytes).toBeDefined();

				const text = 'Hello';
				const bytes1 = codec1.toBytes(text);
				const bytes2 = codec2.toBytes(text);
				expect(bytes1).toEqual(bytes2);
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Task 12 additions (BL-48 coverage restoration I).
//
// Every test above exercises the NATIVE TextEncoder/TextDecoder path
// (`hasTextEncoder`/`hasTextDecoder` are always true under Bun), leaving the
// hand-rolled `manualToBytes`/`manualFromBytes` fallback loop entirely
// unreached. `utf8.factory()` probes `typeof TextEncoder`/`typeof
// TextDecoder` at CALL time, so temporarily deleting both from `globalThis`
// before calling `factory()` forces the manual path for that instance only.
// ---------------------------------------------------------------------------

/**
 * Runs `body` with `TextEncoder`/`TextDecoder` temporarily removed from
 * `globalThis`, restoring them afterwards (even if `body` throws).
 * @param {function(): void} body
 */
function withoutNativeCodec(body) {
	const savedEncoder = globalThis.TextEncoder;
	const savedDecoder = globalThis.TextDecoder;
	delete globalThis.TextEncoder;
	delete globalThis.TextDecoder;
	try {
		body();
	} finally {
		globalThis.TextEncoder = savedEncoder;
		globalThis.TextDecoder = savedDecoder;
	}
}

describe('utf8 module - manual fallback (no TextEncoder/TextDecoder)', () => {
	test('factory() still produces a working codec when TextEncoder/TextDecoder are absent', () => {
		withoutNativeCodec(() => {
			const codec = utf8.factory();
			expect(typeof codec.toBytes).toBe('function');
			expect(typeof codec.fromBytes).toBe('function');
		});
	});

	describe('manual roundtrips', () => {
		test('roundtrips ASCII text', () => {
			withoutNativeCodec(() => {
				const codec = utf8.factory();
				const text = 'Hello World 123 !@#';
				expect(codec.fromBytes(codec.toBytes(text))).toBe(text);
			});
		});

		test('roundtrips BMP Unicode text', () => {
			withoutNativeCodec(() => {
				const codec = utf8.factory();
				const text = 'café Zürich москва 世界';
				expect(codec.fromBytes(codec.toBytes(text))).toBe(text);
			});
		});

		test('roundtrips astral (surrogate-pair) text', () => {
			withoutNativeCodec(() => {
				const codec = utf8.factory();
				const text = '😀🚀 astral';
				expect(codec.fromBytes(codec.toBytes(text))).toBe(text);
			});
		});

		test('roundtrips the BOM character (U+FEFF)', () => {
			withoutNativeCodec(() => {
				const codec = utf8.factory();
				const text = '\uFEFFHello';
				const bytes = codec.toBytes(text);
				expect(Array.from(bytes.slice(0, 3))).toEqual([0xEF, 0xBB, 0xBF]);
				expect(codec.fromBytes(bytes)).toBe(text);
			});
		});
	});

	test('manual toBytes matches native TextEncoder byte-for-byte (independent oracle, astral text)', () => {
		const text = '😀🚀𝔘𝔫𝔦𝔠𝔬𝔡𝔢 café 世界';
		const nativeBytes = new TextEncoder().encode(text);
		let manualBytes;
		withoutNativeCodec(() => {
			manualBytes = utf8.factory().toBytes(text);
		});
		expect(Array.from(manualBytes)).toEqual(Array.from(nativeBytes));
	});

	describe('manual encode: surrogate handling', () => {
		test('encodes a valid surrogate pair as a 4-byte sequence (😀 = U+1F600)', () => {
			withoutNativeCodec(() => {
				const bytes = utf8.factory().toBytes('😀');
				expect(Array.from(bytes)).toEqual([0xF0, 0x9F, 0x98, 0x80]);
			});
		});

		test('replaces a lone low surrogate with U+FFFD', () => {
			withoutNativeCodec(() => {
				const bytes = utf8.factory().toBytes('\uDC00');
				expect(Array.from(bytes)).toEqual([0xEF, 0xBF, 0xBD]);
			});
		});

		test('replaces a high surrogate followed by a non-surrogate with U+FFFD, keeping the next char', () => {
			withoutNativeCodec(() => {
				const bytes = utf8.factory().toBytes('\uD800X');
				expect(Array.from(bytes)).toEqual([0xEF, 0xBF, 0xBD, 0x58]);
			});
		});

		test('an unpaired high surrogate at the very end of the string passes through unreplaced', () => {
			withoutNativeCodec(() => {
				const bytes = utf8.factory().toBytes('\uD800');
				// At the string's end there is no next code unit to inspect, so
				// neither the pairing branch nor the lone-low-surrogate `else if`
				// applies: the raw (unpaired) surrogate value is 3-byte-encoded
				// as-is. This differs from the lone-low-surrogate case above,
				// whose `else if` has no such position dependency.
				expect(Array.from(bytes)).toEqual([0xED, 0xA0, 0x80]);
			});
		});
	});

	describe('manual decode: malformed / truncated sequences', () => {
		test('a stray continuation byte decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0x80]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('an invalid lead byte (>= 0xF8) decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xF8]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 2-byte sequence (no continuation byte) decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xC2]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 3-byte sequence with zero continuation bytes decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xE4]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 3-byte sequence with one continuation byte decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xE4, 0xB8]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 4-byte sequence with zero continuation bytes decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xF0]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 4-byte sequence with one continuation byte decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xF0, 0x9F]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a truncated 4-byte sequence with two continuation bytes decodes to U+FFFD', () => {
			withoutNativeCodec(() => {
				const decoded = utf8.factory().fromBytes(new Uint8Array([0xF0, 0x9F, 0x98]));
				expect(decoded).toBe('\uFFFD');
			});
		});

		test('a valid char followed by a truncated sequence decodes the valid part then stops at U+FFFD', () => {
			withoutNativeCodec(() => {
				// 'A' (0x41) followed by a 3-byte lead with no continuation bytes;
				// the loop pushes U+FFFD then `break`s, discarding nothing further
				// since there IS nothing further in this fixture.
				const decoded = utf8.factory().fromBytes(new Uint8Array([0x41, 0xE4]));
				expect(decoded).toBe('A\uFFFD');
			});
		});
	});
});

describe('utf8 module - null/undefined edge cases', () => {
	let codec;
	beforeEach(() => {
		codec = utf8.factory();
	});

	test('toBytes(null) returns an empty Uint8Array', () => {
		const result = codec.toBytes(null);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBe(0);
	});

	test('toBytes(undefined) returns an empty Uint8Array', () => {
		const result = codec.toBytes(undefined);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBe(0);
	});

	test('fromBytes(null) returns an empty string', () => {
		expect(codec.fromBytes(null)).toBe('');
	});

	test('fromBytes(undefined) returns an empty string', () => {
		expect(codec.fromBytes(undefined)).toBe('');
	});
});
