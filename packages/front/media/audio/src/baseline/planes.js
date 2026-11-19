// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview `audio.planes` — samples as one to three byte planes.
 *
 * Each sample is taken as a 24-bit value and split into three bytes, most
 * significant first. A packet carries the first one, two or three planes:
 * the same frame at 8, 16 or 24 bits. The depth travels in the packet, so
 * it can change from one frame to the next without any signalling — the
 * quality switch of the owner's original chain.
 *
 * Packet layout: `[depth][plane 0][plane 1]…`, each plane one byte per
 * sample.
 *
 * Differences from the original (`audio_codec/audio.js`): the top byte is
 * offset by 128 after clamping, so negative full scale no longer clips
 * (finding a8), and the encoder rounds to the grid of the depth it sends
 * instead of truncating. Zero therefore stays exactly zero at every depth
 * — digital silence is kept — and the error is at most half a step. The
 * largest value a depth can carry is one step under +1.
 *
 * A packet cut down to fewer planes after encoding (by a relay) decodes
 * with a bias of half the dropped step: the rounding was made for the
 * depth the encoder chose.
 */

/**
 * @typedef {object} PlanesApi
 * @property {(frame: Float32Array, depth: number) => Uint8Array} pack
 * @property {(packet: Uint8Array) => Float32Array} unpack
 * @property {(packet: Uint8Array) => number} depthOf
 */

export const planesModule = {
    name: 'audio.planes',
    version: '0.1.0',
    type: 'lib.media.audio',
    dependencies: [],
    deps: [],

    /** @returns {PlanesApi} */
    factory() {
        const FULL = 8388608;      // 2^23
        const TOP = 16777215;      // 2^24 - 1

        /**
         * @param {Float32Array} frame Samples, clamped to [-1, 1).
         * @param {number} depth 1, 2 or 3 planes.
         * @returns {Uint8Array}
         * @throws {RangeError} When `depth` is not 1, 2 or 3.
         */
        function pack(frame, depth) {
            if (depth !== 1 && depth !== 2 && depth !== 3) throw new RangeError(`audio.planes: depth ${depth}`);
            const n = frame.length;
            const packet = new Uint8Array(1 + depth * n);
            packet[0] = depth;
            // Half a step of this depth, so that dropping the low bytes rounds.
            const half = depth === 3 ? 0 : 1 << (8 * (3 - depth) - 1);
            for (let i = 0; i < n; i++) {
                let u = Math.round(frame[i] * FULL) + FULL + half;
                if (u < 0) u = 0;
                else if (u > TOP) u = TOP;
                packet[1 + i] = u >>> 16;
                if (depth > 1) packet[1 + n + i] = (u >>> 8) & 0xff;
                if (depth > 2) packet[1 + 2 * n + i] = u & 0xff;
            }
            return packet;
        }

        /**
         * @param {Uint8Array} packet
         * @returns {number} The depth the packet declares.
         * @throws {RangeError} When the packet is malformed.
         */
        function depthOf(packet) {
            const depth = packet[0];
            if ((depth !== 1 && depth !== 2 && depth !== 3) || (packet.length - 1) % depth !== 0) {
                throw new RangeError('audio.planes: malformed packet');
            }
            return depth;
        }

        /**
         * @param {Uint8Array} packet
         * @returns {Float32Array}
         * @throws {RangeError} When the packet is malformed.
         */
        function unpack(packet) {
            const depth = depthOf(packet);
            const n = (packet.length - 1) / depth;
            const frame = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                let u = packet[1 + i] << 16;
                if (depth > 1) u |= packet[1 + n + i] << 8;
                if (depth > 2) u |= packet[1 + 2 * n + i];
                frame[i] = (u - FULL) / FULL;
            }
            return frame;
        }

        return { pack, unpack, depthOf };
    },
};
