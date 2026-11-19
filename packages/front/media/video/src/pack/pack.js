// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `video.pack` — the geometry of a frame and its packet of
 * separable units.
 *
 * **Geometry.** Which pixels a frame updates is a mask. It is written in
 * the shorter of two forms, chosen frame by frame:
 *
 *   - a bitmask, one bit a pixel (the later experiments of the owner);
 *   - run lengths, alternately of pixels left and pixels updated,
 *     starting with pixels left (the original design), each as a
 *     variable-length integer.
 *
 * A few moving objects make long runs; a noisy or busy frame makes short
 * ones and the bitmask wins. The first byte says which form follows.
 *
 * **Units.** A packet is a sequence of units, each with a type and a
 * length: the base (geometry and luma), the colour, then one unit per
 * detail level. No unit needs another one but the base. A sender, a
 * relay or a receiver may drop any of them: the picture loses colour
 * updates or definition, never the stream. With end-to-end encryption
 * each unit is what gets encrypted on its own.
 */

/**
 * @typedef {object} PackApi
 * @property {{ BASE: number, COLOUR: number, DETAIL: number }} types Unit types; a detail unit of level k has the type `DETAIL + k`.
 * @property {(mask: Uint8Array, form?: 'auto'|'bits'|'runs') => Uint8Array} encodeMask
 * @property {(bytes: Uint8Array, at: number, count: number) => { mask: Uint8Array, selected: number, end: number }} decodeMask
 * @property {(units: { type: number, bytes: Uint8Array }[]) => Uint8Array} writeUnits
 * @property {(packet: Uint8Array) => { type: number, bytes: Uint8Array }[]} readUnits
 */

export const packModule = {
    name: 'video.pack',
    version: '0.1.1',
    type: 'lib.media.video',
    dependencies: [],
    deps: [],

    /** @returns {PackApi} */
    factory() {
        const TYPES = { BASE: 0, COLOUR: 1, DETAIL: 2 };
        const MALFORMED = 'video.pack: malformed packet';

        /** Appends an unsigned integer, 7 bits a byte, low group first. */
        function putVarint(bytes, value) {
            let v = value;
            while (v > 0x7f) {
                bytes.push((v & 0x7f) | 0x80);
                v = Math.floor(v / 128);
            }
            bytes.push(v);
        }

        /**
         * @param {Uint8Array} bytes
         * @param {number} at
         * @returns {[number, number]} The value and the offset after it.
         * @throws {RangeError} When the bytes run out.
         */
        function getVarint(bytes, at) {
            let value = 0;
            let scale = 1;
            for (;;) {
                if (at >= bytes.length || scale > 2 ** 35) throw new RangeError(MALFORMED);
                const byte = bytes[at++];
                value += (byte & 0x7f) * scale;
                if (byte < 0x80) return [value, at];
                scale *= 128;
            }
        }

        /**
         * @param {Uint8Array} mask One byte a pixel, 0 or 1.
         * @param {'auto'|'bits'|'runs'} [form='auto'] `auto`: the shorter of the two.
         * @returns {Uint8Array} A form byte, then the geometry.
         * @throws {RangeError} On an unknown form.
         */
        function encodeMask(mask, form = 'auto') {
            if (form !== 'auto' && form !== 'bits' && form !== 'runs') throw new RangeError(`video.pack: form ${form}`);
            const n = mask.length;
            const bitLength = 1 + ((n + 7) >> 3);
            let runs = null;
            if (form !== 'bits') {
                runs = [1];
                let current = 0;
                let length = 0;
                for (let i = 0; i < n; i++) {
                    if ((mask[i] ? 1 : 0) === current) length++;      // any byte not 0 is set, as in the bits form
                    else {
                        putVarint(runs, length);
                        current ^= 1;
                        length = 1;
                    }
                    // No use finishing a list already longer than the bitmask.
                    if (form === 'auto' && runs.length > bitLength) { runs = null; break; }
                }
                if (runs) putVarint(runs, length);
            }
            if (runs && (form === 'runs' || runs.length <= bitLength)) return Uint8Array.from(runs);
            const bits = new Uint8Array(bitLength);
            for (let i = 0; i < n; i++) if (mask[i]) bits[1 + (i >> 3)] |= 1 << (i & 7);
            return bits;
        }

        /**
         * @param {Uint8Array} bytes
         * @param {number} at Offset of the form byte.
         * @param {number} count Pixels in the mask.
         * @returns {{ mask: Uint8Array, selected: number, end: number }}
         * @throws {RangeError} On a malformed geometry.
         */
        function decodeMask(bytes, at, count) {
            const mask = new Uint8Array(count);
            let selected = 0;
            const form = bytes[at++];
            if (form === 0) {
                const length = (count + 7) >> 3;
                if (at + length > bytes.length) throw new RangeError(MALFORMED);
                for (let i = 0; i < count; i++) {
                    if ((bytes[at + (i >> 3)] >> (i & 7)) & 1) { mask[i] = 1; selected++; }
                }
                return { mask, selected, end: at + length };
            }
            if (form !== 1) throw new RangeError(MALFORMED);
            let position = 0;
            let current = 0;
            while (position < count) {
                let length;
                [length, at] = getVarint(bytes, at);
                if (position + length > count) throw new RangeError(MALFORMED);
                if (current) { mask.fill(1, position, position + length); selected += length; }
                position += length;
                current ^= 1;
            }
            return { mask, selected, end: at };
        }

        /**
         * @param {{ type: number, bytes: Uint8Array }[]} units
         * @returns {Uint8Array} Each unit as its type, its length, its bytes.
         */
        function writeUnits(units) {
            const heads = units.map((unit) => {
                if (!Number.isInteger(unit.type) || unit.type < 0 || unit.type > 255) throw new RangeError(`video.pack: unit type ${unit.type}, 0 to 255`);
                const head = [unit.type];
                putVarint(head, unit.bytes.length);
                return head;
            });
            const packet = new Uint8Array(units.reduce((sum, unit, k) => sum + heads[k].length + unit.bytes.length, 0));
            let at = 0;
            units.forEach((unit, k) => {
                packet.set(heads[k], at);
                at += heads[k].length;
                packet.set(unit.bytes, at);
                at += unit.bytes.length;
            });
            return packet;
        }

        /**
         * @param {Uint8Array} packet
         * @returns {{ type: number, bytes: Uint8Array }[]} Views on the packet.
         * @throws {RangeError} When a unit is cut short.
         */
        function readUnits(packet) {
            const units = [];
            let at = 0;
            while (at < packet.length) {
                const type = packet[at++];
                let length;
                [length, at] = getVarint(packet, at);
                if (at + length > packet.length) throw new RangeError(MALFORMED);
                units.push({ type, bytes: packet.subarray(at, at + length) });
                at += length;
            }
            return units;
        }

        return { types: TYPES, encodeMask, decodeMask, writeUnits, readUnits };
    },
};
