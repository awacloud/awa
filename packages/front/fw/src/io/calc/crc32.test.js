// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { crc32 } from './crc32.js';

describe('crc32 module', () => {
	test('should have correct module metadata', () => {
		expect(crc32.name).toBe('crc32');
		expect(crc32.dependencies).toEqual([]);
		expect(typeof crc32.factory).toBe('function');
	});

	describe('factory', () => {
		let Crc32;

		beforeEach(() => {
			Crc32 = crc32.factory();
		});

		test('should return a constructor function', () => {
			expect(typeof Crc32).toBe('function');
		});

		test('should create CRC32 instances', () => {
			const instance = new Crc32();
			expect(instance).toBeDefined();
			expect(typeof instance.append).toBe('function');
			expect(typeof instance.get).toBe('function');
		});

		describe('CRC32 instance', () => {
			let crc;

			beforeEach(() => {
				crc = new Crc32();
			});

			test('should initialize with correct state', () => {
				expect(crc.crc).toBe(-1);
			});

			test('should calculate CRC32 for empty data', () => {
				crc.append(new Uint8Array([]));
				expect(crc.get()).toBe(0);
			});

			test('should calculate CRC32 for single byte', () => {
				crc.append(new Uint8Array([0]));
				const checksum = crc.get();
				expect(typeof checksum).toBe('number');
				expect(checksum).toBe(0xD202EF8D);
			});

			test('should calculate CRC32 for "Hello"', () => {
				const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
				crc.append(data);
				const checksum = crc.get();
				expect(checksum).toBe(0xF7D18982);
			});

			test('should calculate CRC32 for "Hello World"', () => {
				const data = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
				crc.append(data);
				const checksum = crc.get();
				expect(checksum).toBe(0x4A17B156);
			});

			test('should handle incremental append calls', () => {
				const part1 = new Uint8Array([72, 101, 108]); // "Hel"
				const part2 = new Uint8Array([108, 111]); // "lo"

				crc.append(part1);
				crc.append(part2);

				const checksum = crc.get();
				expect(checksum).toBe(0xF7D18982); // Same as "Hello" in one call
			});

			test('should match single append vs multiple appends', () => {
				const crc1 = new Crc32();
				const crc2 = new Crc32();

				const fullData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
				const part1 = new Uint8Array([1, 2, 3, 4, 5]);
				const part2 = new Uint8Array([6, 7, 8, 9, 10]);

				crc1.append(fullData);

				crc2.append(part1);
				crc2.append(part2);

				expect(crc1.get()).toBe(crc2.get());
			});

			test('should handle all zero bytes', () => {
				crc.append(new Uint8Array([0, 0, 0, 0]));
				const checksum = crc.get();
				expect(typeof checksum).toBe('number');
				expect(checksum).toBe(0x2144DF1C);
			});

			test('should handle all 0xFF bytes', () => {
				crc.append(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]));
				const checksum = crc.get();
				expect(typeof checksum).toBe('number');
				expect(checksum).toBe(0xFFFFFFFF);
			});

			test('should handle sequential byte values', () => {
				const data = new Uint8Array(256);
				for (let i = 0; i < 256; i++) {
					data[i] = i;
				}
				crc.append(data);
				const checksum = crc.get();
				expect(typeof checksum).toBe('number');
				expect(checksum).toBe(0x29058C73);
			});

			test('should work with regular arrays', () => {
				crc.append([72, 101, 108, 108, 111]);
				const checksum = crc.get();
				expect(checksum).toBe(0xF7D18982);
			});

			test('should return unsigned 32-bit integer', () => {
				crc.append(new Uint8Array([1, 2, 3]));
				const checksum = crc.get();
				expect(checksum).toBeGreaterThanOrEqual(0);
				expect(checksum).toBeLessThanOrEqual(0xFFFFFFFF);
			});

			test('should handle large data', () => {
				const largeData = new Uint8Array(10000);
				for (let i = 0; i < 10000; i++) {
					largeData[i] = i % 256;
				}
				crc.append(largeData);
				const checksum = crc.get();
				expect(typeof checksum).toBe('number');
			});

			test('should produce different checksums for different data', () => {
				const crc1 = new Crc32();
				const crc2 = new Crc32();

				crc1.append(new Uint8Array([1, 2, 3]));
				crc2.append(new Uint8Array([3, 2, 1]));

				expect(crc1.get()).not.toBe(crc2.get());
			});

			test('should handle single byte difference', () => {
				const crc1 = new Crc32();
				const crc2 = new Crc32();

				crc1.append(new Uint8Array([1, 2, 3, 4, 5]));
				crc2.append(new Uint8Array([1, 2, 3, 4, 6]));

				expect(crc1.get()).not.toBe(crc2.get());
			});

			test('should be callable multiple times after get()', () => {
				crc.append(new Uint8Array([1, 2, 3]));
				const checksum1 = crc.get();
				const checksum2 = crc.get();
				expect(checksum1).toBe(checksum2);
			});

			test('should continue working after get()', () => {
				crc.append(new Uint8Array([1, 2]));
				const partial = crc.get();

				crc.append(new Uint8Array([3]));
				const full = crc.get();

				expect(full).not.toBe(partial);

				const crcReference = new Crc32();
				crcReference.append(new Uint8Array([1, 2, 3]));
				expect(full).toBe(crcReference.get());
			});
		});

		describe('multiple instances', () => {
			test('should maintain independent state', () => {
				const crc1 = new Crc32();
				const crc2 = new Crc32();

				crc1.append(new Uint8Array([1, 2, 3]));
				crc2.append(new Uint8Array([4, 5, 6]));

				expect(crc1.get()).not.toBe(crc2.get());
			});

			test('should not share state between instances', () => {
				const crc1 = new Crc32();
				const crc2 = new Crc32();

				crc1.append(new Uint8Array([1, 2, 3]));

				expect(crc1.crc).not.toBe(crc2.crc);
				expect(crc2.crc).toBe(-1);
			});
		});

		describe('edge cases', () => {
			test('should handle data with length as power of 2', () => {
				const crc1 = new Crc32();
				crc1.append(new Uint8Array(256).fill(0xAA));
				expect(typeof crc1.get()).toBe('number');
			});

			test('should handle repeated patterns', () => {
				const pattern = new Uint8Array([0xAA, 0x55, 0xAA, 0x55]);
				const crc1 = new Crc32();
				crc1.append(pattern);
				expect(typeof crc1.get()).toBe('number');
			});
		});

		describe('factory isolation', () => {
			test('multiple factory calls should return independent constructors', () => {
				const Crc32_1 = crc32.factory();
				const Crc32_2 = crc32.factory();

				const instance1 = new Crc32_1();
				const instance2 = new Crc32_2();

				instance1.append(new Uint8Array([1, 2, 3]));
				instance2.append(new Uint8Array([1, 2, 3]));

				expect(instance1.get()).toBe(instance2.get());
			});
		});
	});
});
