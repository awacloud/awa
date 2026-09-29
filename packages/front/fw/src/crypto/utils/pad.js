// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview PKCS#7 padding helpers for AES (16-byte block).
 *
 * Two flavours are exposed:
 * - default: validates input element-by-element (safer for caller-supplied data).
 * - `fast`: skips validation and uses `Uint8Array.set` (use only with trusted input).
 *
 * Both functions are idempotent on already-padded data: if the trailing bytes
 * already form a valid PKCS#7 pad, the data is returned as-is. NOTE: this is
 * a deviation from a strict reading of the PKCS#7 spec, which always appends
 * a full pad block; callers who require strict spec-compliant padding should
 * ensure their input is never already-padded before calling `pad()`.
 *
 * **Security note (CBC padding oracle)**: although `strip` validates the pad
 * bytes in constant time relative to the claimed padding length, callers
 * decrypting CBC ciphertext MUST authenticate the ciphertext first
 * (encrypt-then-MAC, or use an AEAD like AES-GCM). Returning `false` on
 * invalid padding is still observable through timing on the caller side.
 *
 */

/**
 * A single PKCS#7 pad/strip pair.
 * @typedef {object} PadFns
 * @property {(data: Uint8Array | number[]) => (Uint8Array | false)} pad Apply PKCS#7 padding; `false` on invalid input.
 * @property {(data: Uint8Array | number[]) => (Uint8Array | false)} strip Strip PKCS#7 padding; `false` on invalid input/padding.
 */

/**
 * Public shape returned by `pad.factory()`.
 * @typedef {object} PadAPI
 * @property {(data: Uint8Array | number[]) => (Uint8Array | false)} pad Apply PKCS#7 padding (validated path).
 * @property {(data: Uint8Array | number[]) => (Uint8Array | false)} strip Strip PKCS#7 padding (validated path).
 * @property {PadFns} fast Unvalidated fast path over `Uint8Array` (trusted input only).
 */

export const pad = {
    name: 'pad',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: [],

    /** @returns {PadAPI} */
    factory() {

        const _BLOCK = 16;

        const _isByte = function (v) {
            return Number.isInteger(v) && v >= 0 && v <= 255;
        };

        const _isByteArray = function (arr) {
            if (!Number.isInteger(arr.length)) {
                return false;
            }
            for (let i = 0; i < arr.length; i++) {
                if (!_isByte(arr[i])) {
                    return false;
                }
            }
            return true;
        };

        const _coerce = function (data, copy) {
            if (data instanceof Uint8Array) {
                return copy ? data.slice() : data;
            }
            if (Array.isArray(data)) {
                if (!_isByteArray(data)) {
                    console.warn('[crypto] INVALID: pad: array contains non-byte value');
                    return false;
                }
                return new Uint8Array(data);
            }
            if (data && _isByteArray(data)) {
                return new Uint8Array(data);
            }
            console.warn('[crypto] INVALID: pad: unsupported array-like object');
            return false;
        };

        const _writePad = function (val, target, source, useSet) {
            if (useSet) {
                target.set(source, 0);
            } else {
                for (let i = 0; i < source.length; i++) {
                    target[i] = source[i];
                }
            }
            for (let i = source.length; i < target.length; i++) {
                target[i] = val;
            }
            return target;
        };

        const _pkcs7pad = function (data, useSet) {
            const bytes = useSet ? data.slice() : _coerce(data, true);
            if (bytes === false) {
                return false;
            }
            const remainder = bytes.length % _BLOCK;
            if (remainder > 0) {
                const padLen = _BLOCK - remainder;
                return _writePad(padLen, new Uint8Array(bytes.length + padLen), bytes, useSet);
            }
            const last = bytes[bytes.length - 1];
            if (last > 0 && last < _BLOCK + 1) {
                if (last === 1) {
                    return _writePad(_BLOCK, new Uint8Array(bytes.length + _BLOCK), bytes, useSet);
                }
                for (let i = 0; i < last - 1; i++) {
                    if (bytes[bytes.length - last + i] !== last) {
                        return bytes;
                    }
                }
                return _writePad(_BLOCK, new Uint8Array(bytes.length + _BLOCK), bytes, useSet);
            }
            return bytes;
        };

        const _pkcs7strip = function (data, useSet) {
            const bytes = useSet ? data.slice() : _coerce(data, true);
            if (bytes === false) {
                return false;
            }
            if (bytes.length === 0 || bytes.length % _BLOCK !== 0) {
                console.warn('[crypto] INVALID: pad.strip: input length must be a non-zero multiple of 16');
                return false;
            }
            const padLen = bytes[bytes.length - 1];
            if (padLen === 0 || padLen > _BLOCK) {
                console.warn('[crypto] INVALID: pad.strip: invalid padding byte');
                return false;
            }
            // Constant-time padding check: walk the full last block and OR
            // mismatches into a single accumulator. Bytes outside the claimed
            // pad region (i >= _BLOCK - padLen) must equal padLen.
            let bad = 0;
            const last = bytes.length - _BLOCK;
            for (let i = 0; i < _BLOCK; i++) {
                // mask = 0xff for the bytes that should be the pad, else 0
                const inPad = (i >= _BLOCK - padLen) ? 1 : 0;
                bad |= ((bytes[last + i] ^ padLen) & -inPad) & 0xff;
            }
            if (bad !== 0) {
                console.warn('[crypto] INVALID: pad.strip: padding bytes do not match length');
                return false;
            }
            const len = bytes.length - padLen;
            if (useSet) {
                return bytes.slice(0, len);
            }
            const out = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                out[i] = bytes[i];
            }
            return out;
        };

        return {
            /**
             * Apply PKCS#7 padding to a byte-like input (validated path).
             * @param {Uint8Array|number[]} data - Plaintext bytes.
             * @returns {Uint8Array|false} Padded bytes, or `false` on invalid input.
             */
            pad: function (data) { return _pkcs7pad(data, false); },
            /**
             * Strip PKCS#7 padding from a byte-like input (validated path).
             * Returns `false` (and logs a warning) when the input is empty,
             * not a multiple of 16, or when the trailing bytes are not a
             * valid PKCS#7 pad.
             * @param {Uint8Array|number[]} data - Padded plaintext bytes.
             * @returns {Uint8Array|false}
             */
            strip: function (data) { return _pkcs7strip(data, false); },
            fast: {
                /**
                 * Apply PKCS#7 padding to a `Uint8Array` without validating
                 * input element-by-element. Use only with trusted input.
                 * @param {Uint8Array} data
                 * @returns {Uint8Array|false}
                 */
                pad: function (data) { return _pkcs7pad(data, true); },
                /**
                 * Strip PKCS#7 padding from a `Uint8Array` without input
                 * validation; same return-on-invalid behaviour as `strip`.
                 * @param {Uint8Array} data
                 * @returns {Uint8Array|false}
                 */
                strip: function (data) { return _pkcs7strip(data, true); }
            }
        };
    }
};
