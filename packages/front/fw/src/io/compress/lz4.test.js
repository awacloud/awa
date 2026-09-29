// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lz4 } from './lz4.js';

describe('lz4 module', () => {
	test('should have correct module metadata', () => {
		expect(lz4.name).toBe('lz4');
		expect(lz4.dependencies).toEqual([]);
		expect(typeof lz4.factory).toBe('function');
	});

	describe('factory', () => {
		let codec;

		beforeEach(() => {
			codec = lz4.factory();
		});

		test('should create codec instance', () => {
			expect(codec).toBeDefined();
			expect(typeof codec.compress).toBe('function');
			expect(typeof codec.decompress).toBe('function');
		});

		describe('compress', () => {
			test('should compress empty data', () => {
				const input = new Uint8Array([]);
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBeDefined();
				expect(data).toBeInstanceOf(Uint8Array);
			});

			test('should compress small data', () => {
				const input = new Uint8Array([72, 101, 108, 108, 111]);
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBeGreaterThanOrEqual(0);
				expect(data).toBeInstanceOf(Uint8Array);
			});

			test('should compress "Hello World"', () => {
				const input = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBeGreaterThanOrEqual(0);
				expect(data).toBeInstanceOf(Uint8Array);
			});

			test('should compress data with repetitions', () => {
				const input = new Uint8Array(100).fill(65); // 100 'A's
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBeGreaterThan(0);
				expect(data).toBeInstanceOf(Uint8Array);
				// Compressed size should be much smaller than original
				expect(size).toBeLessThan(input.length);
			});

			test('should handle incompressible data', () => {
				const input = new Uint8Array(100);
				for (let i = 0; i < 100; i++) {
					input[i] = i;
				}
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBeGreaterThanOrEqual(0);
				expect(data).toBeInstanceOf(Uint8Array);
				// size can be 0 (incompressible) or > 0 (compressed)
			});

			test('should return -1 for oversized data', () => {
				const maxSize = 0x3F000000; // ~1GB
				const input = new Uint8Array(maxSize + 1000); // Slightly over max
				const [size, data] = codec.compress(input, input.length);
				expect(size).toBe(-1);
				expect(data).toBe(input);
			});

			test('should return 0 for incompressible data', () => {
				// Very small data that cannot be compressed efficiently
				const input = new Uint8Array([1, 2, 3]);
				const [size, data] = codec.compress(input, input.length);
				// Either compressed (size > 0) or incompressible (size === 0)
				expect(size).toBeGreaterThanOrEqual(0);
				if (size === 0) {
					expect(data).toEqual(input);
				}
			});

			test('should return array with size and data', () => {
				const input = new Uint8Array([1, 2, 3, 4, 5]);
				const result = codec.compress(input, input.length);
				expect(Array.isArray(result)).toBe(true);
				expect(result.length).toBe(2);
				expect(typeof result[0]).toBe('number');
				expect(result[1]).toBeInstanceOf(Uint8Array);
			});
		});

		describe('decompress', () => {
			test('should decompress compressed data', () => {
				const input = new Uint8Array([72, 101, 108, 108, 111]);
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBeGreaterThan(0);
					expect(decompData).toBeInstanceOf(Uint8Array);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				}
			});

			test('should handle empty compressed data', () => {
				const input = new Uint8Array([]);
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize >= 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBeGreaterThanOrEqual(0);
					expect(decompData).toBeInstanceOf(Uint8Array);
				}
			});

			test('should handle dynamic buffer growth', () => {
				// Test with data that will require buffer expansion
				const input = new Uint8Array(100000).fill(42); // Large repetitive data
				const [compSize, compData] = codec.compress(input, input.length);

				expect(compSize).toBeGreaterThan(0); // Should compress well

				const [decompSize, decompData] = codec.decompress(compData);
				expect(decompSize).toBe(input.length);
				expect(decompData).toBeInstanceOf(Uint8Array);
				expect(decompData).toEqual(input);
			});

			test('should return -1 for invalid compressed data', () => {
				const invalidData = new Uint8Array([255, 255, 255, 255]);
				const [size, data] = codec.decompress(invalidData);
				expect(size).toBe(-1);
				expect(data).toBe(invalidData);
			});

			test('should return array with size and data', () => {
				const input = new Uint8Array(100).fill(42);
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const result = codec.decompress(compData);
					expect(Array.isArray(result)).toBe(true);
					expect(result.length).toBe(2);
					expect(typeof result[0]).toBe('number');
					expect(result[1]).toBeInstanceOf(Uint8Array);
				}
			});
		});

		describe('roundtrip compression/decompression', () => {
			test('should correctly roundtrip small text', () => {
				const texts = ['Hello', 'World', 'LZ4', 'Test'];

				texts.forEach(text => {
					const input = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
					const [compSize, compData] = codec.compress(input, input.length);

					if (compSize > 0) {
						const [decompSize, decompData] = codec.decompress(compData);
						expect(decompSize).toBeGreaterThan(0);
						expect(decompData).toEqual(input);
					} else if (compSize === 0) {
						// Incompressible, data is original
						expect(compData).toEqual(input);
					}
				});
			});

			test('should correctly roundtrip "Hello World"', () => {
				const input = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});

			test('should correctly roundtrip repeated data', () => {
				const input = new Uint8Array(100).fill(65);
				const [compSize, compData] = codec.compress(input, input.length);

				expect(compSize).toBeGreaterThan(0); // Should compress well
				const [decompSize, decompData] = codec.decompress(compData);
				expect(decompSize).toBe(input.length);
				expect(decompData).toEqual(input);
			});

			test('should correctly roundtrip sequential data', () => {
				const input = new Uint8Array(256);
				for (let i = 0; i < 256; i++) {
					input[i] = i;
				}
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});

			test('should correctly roundtrip pattern data', () => {
				const input = new Uint8Array(100);
				for (let i = 0; i < 100; i++) {
					input[i] = i % 10;
				}
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});

			test('should correctly roundtrip random data', () => {
				const input = new Uint8Array(200);
				for (let i = 0; i < 200; i++) {
					input[i] = Math.floor(Math.random() * 256);
				}
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});

			test('should correctly roundtrip zeros', () => {
				const input = new Uint8Array(50).fill(0);
				const [compSize, compData] = codec.compress(input, input.length);

				expect(compSize).toBeGreaterThan(0); // Should compress well
				const [decompSize, decompData] = codec.decompress(compData);
				expect(decompSize).toBe(input.length);
				expect(decompData).toEqual(input);
			});

			test('should correctly roundtrip mixed content', () => {
				const input = new Uint8Array([0, 1, 1, 1, 2, 3, 3, 3, 3, 4, 5, 6, 6, 6]);
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});
		});

		describe('compression efficiency', () => {
			test('should compress highly repetitive data efficiently', () => {
				const input = new Uint8Array(1000).fill(42);
				const [size, data] = codec.compress(input, input.length);

				// Compressed size should be significantly smaller
				expect(size).toBeGreaterThan(0);
				expect(size).toBeLessThan(input.length / 5);
			});

			test('should handle alternating patterns', () => {
				const input = new Uint8Array(200);
				for (let i = 0; i < 200; i++) {
					input[i] = i % 2;
				}
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});

			test('should handle repeating sequences', () => {
				const input = new Uint8Array(100);
				const pattern = [1, 2, 3, 4, 5];
				for (let i = 0; i < 100; i++) {
					input[i] = pattern[i % pattern.length];
				}
				const [compSize, compData] = codec.compress(input, input.length);

				if (compSize > 0) {
					const [decompSize, decompData] = codec.decompress(compData);
					expect(decompSize).toBe(input.length);
					expect(decompData).toEqual(input);
				} else if (compSize === 0) {
					expect(compData).toEqual(input);
				}
			});
		});

		describe('edge cases', () => {
			test('should handle single byte', () => {
				const input = new Uint8Array([42]);
				const [size, data] = codec.compress(input, input.length);

				if (size > 0) {
					const [decompSize, decompData] = codec.decompress(data, data.length);
					expect(decompData).toEqual(input);
				} else if (size === 0) {
					expect(data).toEqual(input);
				}
			});

			test('should handle two bytes', () => {
				const input = new Uint8Array([1, 2]);
				const [size, data] = codec.compress(input, input.length);

				if (size > 0) {
					const [decompSize, decompData] = codec.decompress(data, data.length);
					expect(decompData).toEqual(input);
				} else if (size === 0) {
					expect(data).toEqual(input);
				}
			});

			test('should handle medium sized data', () => {
				const input = new Uint8Array(5000);
				for (let i = 0; i < 5000; i++) {
					input[i] = (i * 7) % 256;
				}
				const [size, data] = codec.compress(input, input.length);

				if (size > 0) {
					const [decompSize, decompData] = codec.decompress(data, data.length);
					expect(decompData).toEqual(input);
				} else if (size === 0) {
					expect(data).toEqual(input);
				}
			});

			test('should handle data with null bytes', () => {
				const input = new Uint8Array([0, 1, 0, 2, 0, 3]);
				const [size, data] = codec.compress(input, input.length);

				if (size > 0) {
					const [decompSize, decompData] = codec.decompress(data, data.length);
					expect(decompData).toEqual(input);
				} else if (size === 0) {
					expect(data).toEqual(input);
				}
			});

			test('should handle data with max byte values', () => {
				const input = new Uint8Array([255, 255, 255, 255]);
				const [size, data] = codec.compress(input, input.length);

				if (size > 0) {
					const [decompSize, decompData] = codec.decompress(data, data.length);
					expect(decompData).toEqual(input);
				} else if (size === 0) {
					expect(data).toEqual(input);
				}
			});
		});

		describe('factory isolation', () => {
			test('multiple factory calls should return independent instances', () => {
				const codec1 = lz4.factory();
				const codec2 = lz4.factory();

				expect(codec1).not.toBe(codec2);
				expect(codec1.compress).toBeDefined();
				expect(codec2.compress).toBeDefined();

				const input = new Uint8Array([1, 2, 3, 4, 5]);
				const [size1, data1] = codec1.compress(input, input.length);
				const [size2, data2] = codec2.compress(input, input.length);

				expect(size1).toBe(size2);
			});
		});

		describe('Lz4CompressStream / Lz4DecompressStream (streaming)', () => {
			test('returns expected stream constructors', () => {
				expect(typeof codec.Lz4CompressStream).toBe('function');
				expect(typeof codec.Lz4DecompressStream).toBe('function');
			});

			test('single-chunk compress round-trip', () => {
				const data = new Uint8Array(200).fill(42);
				let compressed = null;
				const cs = new codec.Lz4CompressStream((chunk) => { compressed = chunk; });
				cs.push(data, true);
				expect(compressed).not.toBeNull();

				let restored = null;
				const ds = new codec.Lz4DecompressStream((chunk) => { restored = chunk; });
				ds.push(compressed, true);
				expect(restored).toEqual(data);
			});

			test('multi-chunk compress round-trip', () => {
				const part1 = new Uint8Array(100).fill(1);
				const part2 = new Uint8Array(100).fill(2);

				const compressedChunks = [];
				const cs = new codec.Lz4CompressStream((chunk, final) => compressedChunks.push({ chunk, final }));
				cs.push(part1, false);
				cs.push(part2, true);

				expect(compressedChunks.length).toBe(2);
				expect(compressedChunks[0].final).toBe(false);
				expect(compressedChunks[1].final).toBe(true);

				// Each chunk decompresses independently
				let r1 = null, r2 = null;
				const ds1 = new codec.Lz4DecompressStream((chunk) => { r1 = chunk; });
				ds1.push(compressedChunks[0].chunk, true);
				const ds2 = new codec.Lz4DecompressStream((chunk) => { r2 = chunk; });
				ds2.push(compressedChunks[1].chunk, true);

				expect(r1).toEqual(part1);
				expect(r2).toEqual(part2);
			});

			test('isFinal flag is forwarded correctly', () => {
				const data = new Uint8Array(50).fill(7);
				const finals = [];
				const cs = new codec.Lz4CompressStream((chunk, final) => finals.push(final));
				cs.push(data, false);
				cs.push(data, true);
				expect(finals).toEqual([false, true]);
			});

			test('Lz4CompressStream with no ondata does not throw', () => {
				const cs = new codec.Lz4CompressStream(null);
				expect(() => cs.push(new Uint8Array([1, 2, 3]), true)).not.toThrow();
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Spec-derived coverage (LZ4 Block Format). Every byte vector below is
// assembled by hand from the format rules: token = literal nibble << 4 |
// (match length - 4) nibble, a nibble of 15 continues in bytes summed until
// one is below 255, offsets are 2-byte little-endian.
// ---------------------------------------------------------------------------

const MAX_OUTPUT = 0x3F000000;

/** Bytes of an ASCII string. */
function ascii(s) {
	return new Uint8Array([...s].map(c => c.charCodeAt(0)));
}

/** Concatenate byte arrays / arrays of numbers. */
function cat(...parts) {
	const arrays = parts.map(p => (p instanceof Uint8Array ? p : new Uint8Array(p)));
	const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
	let at = 0;
	for (const a of arrays) { out.set(a, at); at += a.length; }
	return out;
}

/** Deterministic xorshift32 generator. */
function xorshift32(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13; s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5; s >>>= 0;
		return s;
	};
}

/**
 * Test-side structural walker, written from the block-format rules only. It
 * parses every sequence, checks the constraints an encoder must honour, and
 * decodes the block independently of the module's decoder.
 *
 * @param {Uint8Array} block
 * @returns {Uint8Array} decoded bytes
 * @throws {Error} naming the first violated rule
 */
function walkBlock(block) {
	const n = block.length;
	const decoded = [];
	let ip = 0;
	let lastMatchStart = -1;
	let lastLiterals;
	const readLength = (nibble) => {
		let len = nibble;
		if (nibble === 15) {
			let b;
			do {
				if (ip >= n) throw new Error('length extension truncated');
				b = block[ip++];
				len += b;
			} while (b === 255);
		}
		return len;
	};
	while (true) {
		if (ip >= n) throw new Error('block ends without a literal-only final sequence');
		const token = block[ip++];
		const lit = readLength(token >> 4);
		if (ip + lit > n) throw new Error('literals truncated');
		for (let k = 0; k < lit; k++) decoded.push(block[ip++]);
		if (ip === n) { lastLiterals = lit; break; }
		if (ip + 2 > n) throw new Error('offset truncated');
		const offset = block[ip] | (block[ip + 1] << 8);
		ip += 2;
		if (offset < 1 || offset > Math.min(65535, decoded.length)) {
			throw new Error('offset ' + offset + ' outside 1..' + Math.min(65535, decoded.length));
		}
		const matchLen = readLength(token & 15) + 4;
		if (matchLen < 4) throw new Error('match shorter than 4');
		lastMatchStart = decoded.length;
		const from = decoded.length - offset;
		for (let k = 0; k < matchLen; k++) decoded.push(decoded[from + k]);
	}
	const total = decoded.length;
	if (lastMatchStart >= 0) {
		if (lastLiterals < 5) throw new Error('last 5 bytes are not literals (' + lastLiterals + ')');
		if (total < 13) throw new Error('a block shorter than 13 bytes carries a match');
		if (lastMatchStart > total - 12) throw new Error('last match starts ' + (total - lastMatchStart) + ' bytes before the end');
	}
	return new Uint8Array(decoded);
}

/** Expected worst-case compressed size for `n` input bytes. */
function bound(n) {
	return n + Math.floor(n / 255) + 16;
}

/**
 * Full encoder check for one input: shape of the result, the walker, the
 * size bound, the module's own round trip, and copy semantics for `[0, copy]`.
 */
function checkEncoder(codec, input, opts) {
	const [size, data] = opts === undefined
		? codec.compress(input, input.length)
		: codec.compress(input, input.length, opts);
	expect(data).toBeInstanceOf(Uint8Array);
	expect(data).not.toBe(input);
	if (size === 0) {
		expect(data.length).toBe(input.length);
		expect(data).toEqual(input);
		return { size, data };
	}
	expect(size).toBeGreaterThan(0);
	expect(data.length).toBe(size);
	expect(size).toBeLessThanOrEqual(bound(input.length));
	expect(walkBlock(data)).toEqual(input);
	const [dSize, decoded] = codec.decompress(data);
	expect(dSize).toBe(input.length);
	expect(decoded).toEqual(input);
	return { size, data };
}

describe('lz4 block format (spec vectors)', () => {
	let codec;

	beforeEach(() => {
		codec = lz4.factory();
	});

	describe('decode vectors', () => {
		test('literal-only block: 5 literals', () => {
			const [size, data] = codec.decompress(cat([0x50], ascii('Hello')));
			expect(size).toBe(5);
			expect(data).toEqual(ascii('Hello'));
		});

		test('4 literals, match of 8 at offset 4, 5 literals', () => {
			const block = new Uint8Array([0x44, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00, 0x50, 0x76, 0x77, 0x78, 0x79, 0x7A]);
			const [size, data] = codec.decompress(block);
			expect(size).toBe(17);
			expect(data).toEqual(ascii('abcdabcdabcdvwxyz'));
		});

		test('literal length extension: 15 + 5 = 20 literals', () => {
			const lits = new Uint8Array(20).map((_, i) => 0x41 + i);
			const [size, data] = codec.decompress(cat([0xF0, 0x05], lits));
			expect(size).toBe(20);
			expect(data).toEqual(lits);
		});

		test('literal length extension across a 255 byte: 15 + 255 + 0 = 270 literals', () => {
			const lits = new Uint8Array(270).map((_, i) => (i * 7) & 0xFF);
			const [size, data] = codec.decompress(cat([0xF0, 0xFF, 0x00], lits));
			expect(size).toBe(270);
			expect(data).toEqual(lits);
		});

		test('overlapping match (offset 1 < length 44) copies byte by byte', () => {
			const block = new Uint8Array([0x1F, 0x61, 0x01, 0x00, 0x19, 0x50, 0x61, 0x61, 0x61, 0x61, 0x61]);
			const [size, data] = codec.decompress(block);
			expect(size).toBe(50);
			expect(data).toEqual(new Uint8Array(50).fill(0x61));
		});

		test('decoded output is a fresh array of exactly `size` bytes', () => {
			const block = cat([0x50], ascii('Hello'));
			const [size, data] = codec.decompress(block);
			expect(data).not.toBe(block);
			expect(data.length).toBe(size);
			expect(data.buffer.byteLength).toBe(size);
		});
	});

	describe('malformed blocks', () => {
		test('offset 0 -> [-1, src] (same reference)', () => {
			const block = new Uint8Array([0x10, 0x61, 0x00, 0x00, 0x50, 0x61, 0x61, 0x61, 0x61, 0x61]);
			const [size, data] = codec.decompress(block);
			expect(size).toBe(-1);
			expect(data).toBe(block);
		});

		test('offset 5 after 1 decoded byte -> -1', () => {
			const block = new Uint8Array([0x10, 0x61, 0x05, 0x00, 0x50, 0x61, 0x61, 0x61, 0x61, 0x61]);
			const [size, data] = codec.decompress(block);
			expect(size).toBe(-1);
			expect(data).toBe(block);
		});

		test('literals truncated by the end of input -> -1', () => {
			const block = new Uint8Array([0x44, 0x61, 0x62]);
			expect(codec.decompress(block)[0]).toBe(-1);
		});

		test('truncated after the first offset byte -> -1', () => {
			const block = new Uint8Array([0x44, 0x61, 0x62, 0x63, 0x64, 0x04]);
			expect(codec.decompress(block)[0]).toBe(-1);
		});

		test('match-length extension truncated by the end of input -> -1', () => {
			const block = new Uint8Array([0x1F, 0x61, 0x01, 0x00, 0xFF]);
			expect(codec.decompress(block)[0]).toBe(-1);
		});

		test('literal-length extension truncated by the end of input -> -1', () => {
			expect(codec.decompress(new Uint8Array([0xF0, 0xFF]))[0]).toBe(-1);
		});

		test('empty input -> [0, Uint8Array(0)]', () => {
			const [size, data] = codec.decompress(new Uint8Array(0));
			expect(size).toBe(0);
			expect(data).toBeInstanceOf(Uint8Array);
			expect(data.length).toBe(0);
		});

		test('malformed input never throws', () => {
			const rnd = xorshift32(0xC0FFEE);
			for (let k = 0; k < 500; k++) {
				const block = new Uint8Array(1 + (rnd() % 40)).map(() => rnd() & 0xFF);
				expect(() => codec.decompress(block)).not.toThrow();
			}
		});
	});

	describe('size limit', () => {
		test('output past 0x3F000000 bytes throws before allocating it', () => {
			// 1 literal, then a match at offset 1 whose length extension sums
			// 4 200 000 x 255 = 1 071 000 000 bytes (> 0x3F000000).
			const ext = new Uint8Array(4200000).fill(0xFF);
			const block = cat([0x1F, 0x61, 0x01, 0x00], ext, [0x00]);
			expect(4200000 * 255).toBeGreaterThan(MAX_OUTPUT);
			const t0 = performance.now();
			expect(() => codec.decompress(block)).toThrow('Decompression exceeds maximum size limit');
			expect(performance.now() - t0).toBeLessThan(1000);
		});
	});

	describe('encoder validity (walker on every corpus)', () => {
		test('walker accepts the hand-assembled spec vector and rejects violations', () => {
			const good = new Uint8Array([0x44, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00, 0x50, 0x76, 0x77, 0x78, 0x79, 0x7A]);
			expect(walkBlock(good)).toEqual(ascii('abcdabcdabcdvwxyz'));
			// last sequence carries fewer than 5 literals
			expect(() => walkBlock(new Uint8Array([0x44, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00, 0x40, 0x76, 0x77, 0x78, 0x79]))).toThrow('last 5 bytes');
			// block ends on a match
			expect(() => walkBlock(new Uint8Array([0x44, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00]))).toThrow('literal-only');
			// last match starts fewer than 12 bytes before the end (4 literals,
			// match of 4 at offset 4 starting at byte 4 of 13, 5 literals)
			expect(() => walkBlock(new Uint8Array([0x40, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00, 0x50, 0x76, 0x77, 0x78, 0x79, 0x7A]))).toThrow('last match');
			// offset beyond the decoded bytes
			expect(() => walkBlock(new Uint8Array([0x10, 0x61, 0x05, 0x00, 0x50, 0x61, 0x61, 0x61, 0x61, 0x61]))).toThrow('offset');
		});

		test("'A' x 100000", () => {
			const { size } = checkEncoder(codec, new Uint8Array(100000).fill(0x41));
			expect(size).toBeGreaterThan(0);
			expect(size).toBeLessThan(1000);
		});

		test('256 KiB random: [0, copy] or a valid block', () => {
			const rnd = xorshift32(0x1234567);
			const input = new Uint8Array(256 * 1024).map(() => rnd() & 0xFF);
			checkEncoder(codec, input);
		});

		test('64 KiB periodic (period 97)', () => {
			const rnd = xorshift32(97);
			const period = new Uint8Array(97).map(() => rnd() & 0xFF);
			const input = new Uint8Array(64 * 1024).map((_, i) => period[i % 97]);
			const { size } = checkEncoder(codec, input);
			expect(size).toBeGreaterThan(0);
			expect(size).toBeLessThan(input.length / 20);
		});

		test('text fixture brotli_dict.bin', () => {
			const input = new Uint8Array(readFileSync(new URL('./brotli_dict.bin', import.meta.url)));
			expect(input.length).toBeGreaterThan(100000);
			const { size } = checkEncoder(codec, input);
			expect(size).toBeGreaterThan(0);
			expect(size).toBeLessThan(input.length);
		});

		test('70 000 mixed bytes (random runs, back-copies, byte runs)', () => {
			const rnd = xorshift32(70000);
			const input = new Uint8Array(70000);
			let at = 0;
			while (at < input.length) {
				const kind = rnd() % 3;
				const len = Math.min(input.length - at, 1 + (rnd() % 300));
				if (kind === 0 || at < 1000) {
					for (let k = 0; k < len; k++) input[at + k] = rnd() & 0xFF;
				} else if (kind === 1) {
					const from = rnd() % at;
					for (let k = 0; k < len; k++) input[at + k] = input[from + k];
				} else {
					input.fill(rnd() & 0xFF, at, at + len);
				}
				at += len;
			}
			const { size } = checkEncoder(codec, input);
			expect(size).toBeGreaterThan(0);
		});

		test('13-byte input can carry a match; 12-byte input is [0, copy]', () => {
			const thirteen = new Uint8Array(13).fill(0x61);
			const r13 = checkEncoder(codec, thirteen);
			expect(r13.size).toBeGreaterThan(0);

			const twelve = new Uint8Array(12).fill(0x61);
			const [size, data] = codec.compress(twelve, twelve.length);
			expect(size).toBe(0);
			expect(data).not.toBe(twelve);
			expect(data).toEqual(twelve);
		});

		test('inputs of 1..64 bytes', () => {
			for (let n = 1; n <= 64; n++) {
				const periodic = new Uint8Array(n).map((_, i) => i % 3);
				const r = checkEncoder(codec, periodic);
				if (n <= 12) expect(r.size).toBe(0);
				const distinct = new Uint8Array(n).map((_, i) => i);
				checkEncoder(codec, distinct);
			}
		});

		test('compress encodes src[0, len) only', () => {
			const src = new Uint8Array(200).fill(0x42);
			src.fill(0x43, 100);
			const [size, data] = codec.compress(src, 100);
			expect(size).toBeGreaterThan(0);
			expect(walkBlock(data)).toEqual(new Uint8Array(100).fill(0x42));
		});

		test('deterministic: two calls give identical bytes', () => {
			const input = new Uint8Array(readFileSync(new URL('./brotli_dict.bin', import.meta.url)));
			const [s1, d1] = codec.compress(input, input.length);
			const [s2, d2] = lz4.factory().compress(input, input.length);
			expect(s1).toBe(s2);
			expect(d1).toEqual(d2);
		});
	});

	describe('streams', () => {
		test('Lz4DecompressStream throws the verbatim message on a malformed block', () => {
			const ds = new codec.Lz4DecompressStream(() => {});
			const bad = new Uint8Array([0x10, 0x61, 0x00, 0x00, 0x50, 0x61, 0x61, 0x61, 0x61, 0x61]);
			expect(() => ds.push(bad, true)).toThrow('lz4 decompression error');
		});

		test('a 12-byte chunk is forwarded raw (same reference) by the compressor', () => {
			const chunk = new Uint8Array(12).fill(0x61);
			const seen = [];
			const cs = new codec.Lz4CompressStream((c, final) => seen.push({ c, final }));
			cs.push(chunk);
			expect(seen.length).toBe(1);
			expect(seen[0].c).toBe(chunk);
			expect(seen[0].final).toBe(false);
		});

		test('ondata is null when not a function', () => {
			expect(new codec.Lz4CompressStream(undefined).ondata).toBeNull();
			expect(new codec.Lz4DecompressStream('x').ondata).toBeNull();
		});
	});

	// The encoder extends a candidate byte by byte for its first bytes, then
	// in 4-byte words, then byte by byte again for the tail. Whatever the
	// split, the length must be the exact common prefix - the length a plain
	// byte loop finds - or the block changes. Each input below holds one
	// random run `head` twice, the second copy followed by a different byte,
	// so the only match the encoder can take is exactly `head.length` long.
	describe('match extension (byte run, then 4-byte words)', () => {
		/** First sequence of a block: literal count, offset, match length. */
		function firstSequence(block) {
			let ip = 0;
			const token = block[ip++];
			const readLength = (nibble) => {
				let len = nibble;
				if (nibble === 15) {
					let b;
					do { b = block[ip++]; len += b; } while (b === 255);
				}
				return len;
			};
			const literals = readLength(token >> 4);
			ip += literals;
			const offset = block[ip] | (block[ip + 1] << 8);
			ip += 2;
			return { literals, offset, matchLen: readLength(token & 15) + 4 };
		}

		// The extension code is shared by both modes; each test runs in both.
		for (const mode of ['speed', 'ratio']) {
			test(`${mode}: the match length is exact for every run length 7..96 (every residue mod 4 past the byte run)`, () => {
				// Below 7 bytes the one match does not pay for its token, offset
				// and length-extension bytes here, and the encoder returns [0, copy].
				const rnd = xorshift32(0x4C5A);
				for (let len = 7; len <= 96; len++) {
					const head = new Uint8Array(len).map(() => rnd() & 0xFF);
					const gap = new Uint8Array(8).map(() => rnd() & 0xFF);
					const tail = new Uint8Array(16).map(() => rnd() & 0xFF);
					const input = cat(head, [0x00], gap, head, [0x01], tail);
					const { size, data } = checkEncoder(codec, input, { mode });
					expect(size).toBeGreaterThan(0);
					expect(firstSequence(data)).toEqual({ literals: len + 9, offset: len + 9, matchLen: len });
				}
			});

			test(`${mode}: a run cut by the end-of-block rule stops at the limit, not on a word boundary`, () => {
				// `head` twice and nothing else: the second copy can only be
				// matched up to 5 bytes before the end (the last 5 are literals).
				const rnd = xorshift32(0x0E0B);
				for (let len = 30; len <= 45; len++) {
					const head = new Uint8Array(len).map(() => rnd() & 0xFF);
					const { size, data } = checkEncoder(codec, cat(head, head), { mode });
					expect(size).toBeGreaterThan(0);
					expect(firstSequence(data)).toEqual({ literals: len, offset: len, matchLen: len - 5 });
				}
			});
		}
	});

	// compress(src, len, { mode }) and Lz4CompressStream(ondata, { mode }):
	// 'speed' (the default) and 'ratio' run the same encoder with a shallow or
	// a deep search. Both must emit valid blocks the unchanged decoder reads;
	// 'ratio' must stay the encoder that shipped before the modes existed,
	// byte for byte (pinned below by sha256).
	describe('modes (speed default, ratio opt-in)', () => {
		/** The corpora of the validity suite above, rebuilt here. */
		function corpora() {
			const text = new Uint8Array(readFileSync(new URL('./brotli_dict.bin', import.meta.url)));
			let rnd = xorshift32(70000);
			const mixed = new Uint8Array(70000);
			let at = 0;
			while (at < mixed.length) {
				const kind = rnd() % 3;
				const len = Math.min(mixed.length - at, 1 + (rnd() % 300));
				if (kind === 0 || at < 1000) {
					for (let k = 0; k < len; k++) mixed[at + k] = rnd() & 0xFF;
				} else if (kind === 1) {
					const from = rnd() % at;
					for (let k = 0; k < len; k++) mixed[at + k] = mixed[from + k];
				} else {
					mixed.fill(rnd() & 0xFF, at, at + len);
				}
				at += len;
			}
			rnd = xorshift32(97);
			const period = new Uint8Array(97).map(() => rnd() & 0xFF);
			const periodic = new Uint8Array(64 * 1024).map((_, i) => period[i % 97]);
			rnd = xorshift32(0x1234567);
			const random = new Uint8Array(256 * 1024).map(() => rnd() & 0xFF);
			const runs = new Uint8Array(100000).fill(0x41);
			return { text, mixed, periodic, random, runs };
		}

		const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

		test("no opts, {}, { mode: undefined } and { mode: 'speed' } give the same block", () => {
			for (const input of Object.values(corpora())) {
				const [s1, d1] = codec.compress(input, input.length);
				const [s2, d2] = codec.compress(input, input.length, {});
				const [s3, d3] = codec.compress(input, input.length, { mode: 'speed' });
				const [s4, d4] = codec.compress(input, input.length, { mode: undefined });
				expect(s2).toBe(s1);
				expect(s3).toBe(s1);
				expect(s4).toBe(s1);
				expect(d2).toEqual(d1);
				expect(d3).toEqual(d1);
				expect(d4).toEqual(d1);
			}
		});

		test("'ratio' is byte-identical to the encoder that shipped before the modes (sha256 pins)", () => {
			// sha256 of the pre-modes encoder's output (fw/BATCH_34 task 05,
			// landed P2), taken before the modes were added.
			const { text, mixed, periodic } = corpora();
			const pins = [
				[text, 77053, '2c0628046e73e0ad20d2b461af0dbb76c44dbcde465b553bc0024d86d000569d'],
				[mixed, 23862, 'b065af4ce9d6dd13e5293e3fa0a69b3f7920b5a44b3097392aed40778a3d46de'],
				[periodic, 364, '23aa90f19bb085050e4c4494661fa47223dec1e411200904059ecb628a6b8b24'],
			];
			for (const [input, size, hash] of pins) {
				const [s, d] = codec.compress(input, input.length, { mode: 'ratio' });
				expect(s).toBe(size);
				expect(sha256(d)).toBe(hash);
			}
		});

		for (const mode of ['speed', 'ratio']) {
			test(`${mode}: valid blocks that round-trip on every corpus and on 1..64-byte inputs`, () => {
				for (const input of Object.values(corpora())) checkEncoder(codec, input, { mode });
				for (let n = 1; n <= 64; n++) {
					checkEncoder(codec, new Uint8Array(n).map((_, i) => i % 3), { mode });
					checkEncoder(codec, new Uint8Array(n).map((_, i) => i), { mode });
				}
			});
		}

		test("'ratio' is never larger than 'speed'; 'speed' stays within the pre-rewrite size on the text fixture", () => {
			const { text, mixed, periodic } = corpora();
			for (const input of [text, mixed, periodic]) {
				const [speed] = codec.compress(input, input.length, { mode: 'speed' });
				const [ratio] = codec.compress(input, input.length, { mode: 'ratio' });
				expect(ratio).toBeLessThanOrEqual(speed);
			}
			// 84076 B: the pre-rewrite encoder on brotli_dict.bin (codec-levels
			// bench, `text` corpus, BASELINE_SHA of fw/BATCH_34).
			expect(codec.compress(text, text.length)[0]).toBeLessThanOrEqual(84076);
		});

		test('an unknown mode throws a RangeError naming it, before any other check', () => {
			const input = new Uint8Array(100).fill(0x61);
			for (const mode of ['fast', 'SPEED', '', 0, null, false]) {
				expect(() => codec.compress(input, input.length, { mode })).toThrow(RangeError);
				expect(() => codec.compress(input, input.length, { mode })).toThrow("'" + String(mode) + "'");
			}
			// Even for inputs that would otherwise return [0, copy] or [-1, src].
			expect(() => codec.compress(new Uint8Array(3), 3, { mode: 'fast' })).toThrow(RangeError);
			expect(() => codec.compress(input, 0x3F000001, { mode: 'fast' })).toThrow(RangeError);
		});

		test('Lz4CompressStream honours opts.mode, defaults to speed, and rejects a bad mode at construction', () => {
			const { text } = corpora();
			for (const mode of [undefined, 'speed', 'ratio']) {
				const seen = [];
				const cs = mode === undefined
					? new codec.Lz4CompressStream((c) => seen.push(c))
					: new codec.Lz4CompressStream((c) => seen.push(c), { mode });
				cs.push(text, true);
				const expected = codec.compress(text, text.length, { mode: mode || 'speed' })[1];
				expect(seen.length).toBe(1);
				expect(seen[0]).toEqual(expected);
				const back = [];
				new codec.Lz4DecompressStream((c) => back.push(c)).push(seen[0], true);
				expect(back[0]).toEqual(text);
			}
			expect(() => new codec.Lz4CompressStream(() => {}, { mode: 'turbo' })).toThrow(RangeError);
			expect(() => new codec.Lz4CompressStream(() => {}, { mode: 'turbo' })).toThrow("'turbo'");
		});
	});
});
