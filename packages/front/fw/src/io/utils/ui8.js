// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Uint8Array helpers module factory.
 * Exposes `equal`, `join` and `concat` helpers.
 *
 * @example
 * const api = ui8.factory();
 * const a = new Uint8Array([1, 2]);
 * const b = new Uint8Array([3]);
 * const joined = api.join(a, b); // [1,2,3]
 */

/**
 * Uint8Array helper surface returned by `factory()`.
 * @typedef {object} Ui8API
 * @property {(a: Uint8Array, b: Uint8Array) => boolean} equal - Compare two Uint8Array for byte equality.
 * @property {(ui8a_1: Uint8Array, ui8a_2: Uint8Array) => Uint8Array} join - Join two Uint8Array instances into a new one.
 * @property {(arr: Uint8Array[]) => Uint8Array} concat - Concatenate an array of Uint8Array into a new one.
 */

export const ui8 = {
    name: 'ui8',
    version: '1.0.0',
    type: 'fw.io.utils',
    dependencies: [],

    /**
     * Create Uint8Array helper API.
     * @returns {Ui8API}
     */
    factory() {

        /**
         * Join two Uint8Array instances into a new one.
         * @param {Uint8Array} ui8a_1
         * @param {Uint8Array} ui8a_2
         * @returns {Uint8Array}
         */
        const join = function ui8a_join(ui8a_1, ui8a_2) {
            let ret = new Uint8Array(ui8a_1.length + ui8a_2.length);
            ret.set(ui8a_1, 0);
            ret.set(ui8a_2, ui8a_1.length);
            return ret;
        }

        /**
         * Concatenate arrays into a pre-sized Uint8Array.
         * @param {number} len Total length of the output.
         * @param {Uint8Array[]} arr
         * @returns {Uint8Array}
         */
        function uint_concat(len, arr) {
            let out = new Uint8Array(len);
            let offset = 0;
            for (let i = 0; i < arr.length; i++) {
                out.set(arr[i], offset);
                offset += arr[i].length;
            }
            return out;
        }

        /**
         * Concatenate an array of Uint8Array into a new one.
         * @param {Uint8Array[]} arr
         * @returns {Uint8Array}
         */
        const concat = function ui8a_concat(arr) {
            let len = 0;
            for (let i = 0; i < arr.length; i++) {
                len += arr[i].length;
            }
            return uint_concat(len, arr);
        }

        /**
         * Compare two Uint8Array for byte equality.
         * @param {Uint8Array} a
         * @param {Uint8Array} b
         * @returns {boolean}
         */
        const equal = function equal(a, b) {
            if (a.length === b.length) {
                for (let i = 0; i < a.length; i++) {
                    if (a[i] !== b[i]) {
                        return false;
                    }
                }
                return true;
            } else {
                return false;
            }
        }

        return { equal, join, concat };
    }
}
