// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * CRC32 checksum calculation for data integrity verification.
 * Implements the CRC-32 algorithm using the polynomial 0xEDB88320 (reversed IEEE 802.3).
 *
 * @example
 * const Crc32 = registry.resolve('crc32');
 * const crc = new Crc32();
 * crc.append(new Uint8Array([72, 101, 108, 108, 111]));
 * const checksum = crc.get(); // Returns CRC32 checksum as unsigned 32-bit integer
 */

/**
 * @typedef {object} Crc32Instance
 * @property {(data: Uint8Array|Array<number>) => void} append - Append data to the running CRC32 calculation.
 * @property {() => number} get - Return the final CRC32 checksum as an unsigned 32-bit integer.
 */
/** @typedef {new () => Crc32Instance} Crc32Ctor */

export const crc32 = {
	name: 'crc32',
	version: '1.0.0',
	type: 'fw.io.calc',
	dependencies: [],

	/**
	 * Factory function that returns the CRC32 constructor.
	 * Creates a lookup table for efficient CRC32 calculation.
	 *
	 * @returns {Crc32Ctor} CRC32 constructor function
	 *
	 * @example
	 * const Crc32 = crc32.factory();
	 * const instance = new Crc32();
	 * instance.append(data);
	 * const checksum = instance.get();
	 */
	factory() {
		// Build CRC32 lookup table using polynomial 0xEDB88320
		const table = new Uint32Array(256);

		for (let i = 0; i < 256; i++) {
			let t = i;
			for (let j = 0; j < 8; j++) {
				if (t & 1) {
					t = (t >>> 1) ^ 0xEDB88320;
				} else {
					t = t >>> 1;
				}
			}
			table[i] = t;
		}

		// Slicing-by-16: slice k (entries 256k .. 256k + 255) holds the CRC of
		// byte i followed by k zero bytes, so sixteen input bytes fold into
		// the state with sixteen independent lookups instead of sixteen
		// dependent ones. One flat table (16 KiB), read through a local.
		const slices = new Uint32Array(16 * 256);
		slices.set(table);
		for (let k = 256; k < 16 * 256; k++) {
			const prev = slices[k - 256];
			slices[k] = (prev >>> 8) ^ table[prev & 0xFF];
		}

		/**
		 * CRC32 constructor - Creates a new CRC32 instance for calculating checksums.
		 * Each instance maintains its own CRC state and can process data incrementally.
		 *
		 * @constructor
		 * @returns {Object} CRC32 instance with append() and get() methods
		 *
		 * @example
		 * const crc = new Crc32();
		 * crc.append(new Uint8Array([1, 2, 3]));
		 * crc.append(new Uint8Array([4, 5, 6]));
		 * const checksum = crc.get();
		 */
		function Crc32() {
			/**
			 * Internal CRC state (initialized to -1 / 0xFFFFFFFF)
			 * @private
			 * @type {number}
			 */
   // @ts-ignore - crc is a private field; accessed from subclass-like context, safe at runtime
			this.crc = -1;
		}

		/**
		 * Appends data to the CRC32 calculation.
		 * Can be called multiple times to process data incrementally.
		 *
		 * @param {Uint8Array|Array<number>} data - Byte array to process
		 * @returns {void}
		 */
		Crc32.prototype.append = function(data) {
   // @ts-ignore - crc is a private field; accessed from subclass-like context, safe at runtime
			let crc = this.crc | 0;
			const length = data.length | 0;
			let offset = 0;
			if (data instanceof Uint8Array) {
				// Sixteen bytes a step; an array of numbers (whose elements the
				// byte loop masks to 8 bits) and the last 0-15 bytes take the
				// byte loop.
				const t = slices;
				for (const end = length - 15; offset < end; offset += 16) {
					const a = crc ^ (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24));
					crc = t[3840 + (a & 0xFF)] ^ t[3584 + ((a >>> 8) & 0xFF)] ^ t[3328 + ((a >>> 16) & 0xFF)] ^ t[3072 + (a >>> 24)] ^
						t[2816 + data[offset + 4]] ^ t[2560 + data[offset + 5]] ^ t[2304 + data[offset + 6]] ^ t[2048 + data[offset + 7]] ^
						t[1792 + data[offset + 8]] ^ t[1536 + data[offset + 9]] ^ t[1280 + data[offset + 10]] ^ t[1024 + data[offset + 11]] ^
						t[768 + data[offset + 12]] ^ t[512 + data[offset + 13]] ^ t[256 + data[offset + 14]] ^ t[data[offset + 15]];
				}
			}
			for (; offset < length; offset++) {
				crc = (crc >>> 8) ^ table[(crc ^ data[offset]) & 0xFF];
			}
   // @ts-ignore - crc is a private field; accessed from subclass-like context, safe at runtime
			this.crc = crc;
		};

		/**
		 * Returns the final CRC32 checksum value.
		 * The checksum is returned as an unsigned 32-bit integer.
		 *
		 * @returns {number} CRC32 checksum (unsigned 32-bit integer)
		 */
		Crc32.prototype.get = function() {
   // @ts-ignore - crc is a private field; accessed from subclass-like context, safe at runtime
			return (~this.crc) >>> 0;
		};

		return Crc32;
	}
};