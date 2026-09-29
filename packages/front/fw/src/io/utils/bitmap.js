// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Bitmap helpers module factory.
 * Converts between Uint8Array and bit arrays (0/1).
 *
 * @example
 * const api = bitmap.factory();
 * const bits = api.bytesToBits(new Uint8Array([3])); // [1,1,0,0,0,0,0,0]
 * api.padBitsToByte(bits);
 * const bytes = api.bitsToBytes(bits); // Uint8Array([3])
 */

/**
 * Bitmap conversion helper surface returned by `factory()`.
 * @typedef {object} BitmapAPI
 * @property {(ui8a: Uint8Array, ret?: number[]) => number[]} bytesToBits - Convert a Uint8Array to an array of bits (0/1), LSB-first per byte.
 * @property {(ba: number[], validateLength?: boolean) => Uint8Array} bitsToBytes - Convert an array of bits (0/1) to a Uint8Array, LSB-first per byte.
 * @property {(arr: number[], fill?: number) => number[]} padBitsToByte - Pad a bit array with `fill` so its length is a multiple of 8.
 */

export const bitmap = {
    name: 'bitmap',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /**
     * Create bitmap helper API.
     * @returns {BitmapAPI}
     */
    factory() {

        const map = [];
        for(let i = 0; i < 256; i++){
            map[i] = [];
            for(let j = 0; j < 8; j++) {
                map[i].push((i >> j) & 0x01);
            }
        }

        /**
         * Convert a Uint8Array to an array of bits (0/1), LSB-first per byte.
         * @param {Uint8Array} ui8a
         * @param {number[]} [ret]
         * @returns {number[]}
         */
        const bytesToBits = function(ui8a, ret = []){
            for(let i = 0; i < ui8a.length; i++){
                ret.push(...map[ui8a[i]]);
            }
            return ret;
        }

        /**
         * Convert an array of bits (0/1) to a Uint8Array, LSB-first per byte.
         * Input length should be a multiple of 8 (use padBitsToByte).
         * @param {number[]} ba
         * @param {boolean} [validateLength=false] Throw if length is not a multiple of 8.
         * @returns {Uint8Array}
         */
        const bitsToBytes = function(ba, validateLength = false){
            if (validateLength && (ba.length & 7) !== 0) {
                throw new Error('bitsToBytes expects a bit array length that is a multiple of 8');
            }
            const ret = new Uint8Array(ba.length >> 3);
            for(let i = 0; i < ba.length; i+=8){
                ret[i >> 3] = ba[i] + (ba[i+1] << 1) + (ba[i+2] << 2) + (ba[i+3] << 3) + (ba[i+4] << 4) + (ba[i+5] << 5) + (ba[i+6] << 6) + (ba[i+7] << 7);
            }
            return ret;
        }

        /**
         * Pad a bit array with `fill` so its length is a multiple of 8.
         * Uses `arr.length & 7` (equivalent to `arr.length % 8` for positive ints).
         * @param {number[]} arr
         * @param {number} [fill=0]
         * @returns {number[]}
         */
        const padBitsToByte = function(arr, fill = 0){
            const need = 8 - (arr.length & 7);
            if(need < 8) {
                for (let i = 0; i < need; i++) {
                    arr.push(fill);
                }
            }
            return arr;
        }

        return { bytesToBits, bitsToBytes, padBitsToByte };
    }
}
