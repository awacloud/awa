// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Instantiate a variable font at a user-supplied axis
 * location.
 *
 * Per OT spec §10.6.2, applying gvar deltas combines :
 *  1. **Tuple scalar** : product of per-axis scalar contributions. For
 *     a peak `P` (and optional intermediateStart `I_s`, intermediateEnd
 *     `I_e`) at coordinate `c` :
 *       - If P == 0 (axis not used by tuple) → scalar = 1
 *       - If c < I_s or c > I_e → scalar = 0
 *       - If c == P → scalar = 1
 *       - Otherwise linear ramp from 0 at the I_*_ boundary up to 1 at P
 *  2. **Glyph point displacement** : delta_x[i] += deltaX[i] * scalar.
 *
 * The point-list packed-encoding follows the same format as the
 * `unpackPointNumbers` / `unpackDeltas` helpers from `table/gvar.js`.
 *
 * **Scope**: this module computes the tuple scalar product +
 * exposes `applyGvarDeltas(glyph, deltas, scalar)` for callers that
 * already decoded a tuple's deltas. Wiring the full instantiation
 * pipeline (decode tuple → compute scalar → unpack deltas → apply to
 * glyf points → re-pack glyf bytes) is the consumer's job: there is no
 * one-shot `instantiate(font, coords)` entry point.
 *
 * Strict factory body.
 *
 * @module fonts/variable/instance
 */

import { fontErrors } from '../errors.js';

export const varInstance = {
    name: 'varInstance',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ContractError } = errors;

        /**
         * Compute the scalar contribution of one peak coordinate to a tuple
         * at the current normalised axis location.
         *
         * @param {number} peak              normalised peak coordinate in [-1, +1]
         * @param {number} coord             current normalised axis value
         * @param {number} [intermStart]
         * @param {number} [intermEnd]
         * @returns {number}                 scalar in [0, 1]
         */
        function axisScalar(peak, coord, intermStart, intermEnd) {
            if (peak === 0) return 1;
            if (coord === peak) return 1;
            // Use explicit intermediate range if supplied, else triangle from 0 → peak
            if (intermStart != null && intermEnd != null) {
                if (coord < intermStart || coord > intermEnd) return 0;
                if (coord < peak)  return (coord - intermStart) / (peak - intermStart);
                return (intermEnd - coord) / (intermEnd - peak);
            }
            // Triangle: 0 ramp from (peak's sign × 0) → peak → 0
            if (peak > 0) {
                if (coord <= 0) return 0;
                if (coord >= peak) return 0;
                return coord / peak;
            } else {
                if (coord >= 0) return 0;
                if (coord <= peak) return 0;
                return coord / peak;
            }
        }

        /**
         * Compute the full tuple scalar (product of per-axis scalars).
         *
         * @param {Array<number>} peak              one per axis, normalised
         * @param {Array<number>} coord             one per axis, normalised
         * @param {Array<number>} [intermStart]
         * @param {Array<number>} [intermEnd]
         * @returns {number}
         */
        function tupleScalar(peak, coord, intermStart, intermEnd) {
            if (!peak || peak.length !== coord.length)
                throw new ContractError('fonts/var-tuple-mismatch',
                    'peak and coord arrays must have the same length', { context: { peakLen: peak?.length, coordLen: coord.length } });
            let s = 1;
            for (let i = 0; i < peak.length; i++) {
                const sa = axisScalar(peak[i], coord[i],
                                      intermStart?.[i], intermEnd?.[i]);
                if (sa === 0) return 0;
                s *= sa;
            }
            return s;
        }

        /**
         * Apply scaled point-deltas to a glyph's `points` array in place.
         *
         * `pointNumbers` is the list of affected point indices (an empty array
         * means "all points"). `deltaX` / `deltaY` are the unpacked signed
         * deltas (one per pointNumber). `scalar` ∈ [0, 1] scales each delta
         * before adding.
         *
         * @param {{ points: Array<{x:number, y:number, onCurve:boolean}> }} glyph
         * @param {{ pointNumbers: number[], deltaX: number[], deltaY: number[] }} deltas
         * @param {number} scalar
         */
        function applyGvarDeltas(glyph, deltas, scalar) {
            if (scalar === 0 || !glyph || !glyph.points || !deltas) return;
            const { pointNumbers, deltaX, deltaY } = deltas;
            const points = glyph.points;
            if (pointNumbers.length === 0) {
                const limit = Math.min(deltaX.length, points.length);
                for (let i = 0; i < limit; i++) {
                    points[i].x += deltaX[i] * scalar;
                    points[i].y += deltaY[i] * scalar;
                }
            } else {
                for (let i = 0; i < pointNumbers.length; i++) {
                    const idx = pointNumbers[i];
                    if (idx < 0 || idx >= points.length) continue;
                    points[idx].x += deltaX[i] * scalar;
                    points[idx].y += deltaY[i] * scalar;
                }
            }
        }

        return { axisScalar, tupleScalar, applyGvarDeltas };
    }
};
