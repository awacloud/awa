// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Convert user-space axis coordinates (per `fvar` definitions)
 * to the normalised `[-1, +1]` space that gvar tuples live in.
 *
 * Per OT spec §10.6.2 :
 *   normalised(x) =
 *     0                                                   if x == default
 *     (x - default) / (max - default)                     if x > default
 *     (x - default) / (default - min)                     if x < default
 *
 * The avar table may then remap this linear coordinate non-linearly
 * (see `table/avar.js` + `applyAvarSegment`).
 *
 * Strict factory body.
 *
 * @module fonts/variable/coordsConvert
 */

import { tableAvar } from '../table/avar.js';

export const varCoordsConvert = {
    name: 'varCoordsConvert',
    dependencies: ['tableAvar'],
    deps: [tableAvar],
    factory(avar) {
        const { applyAvarSegment } = avar;

        /**
         * Normalise a user-space value for a single axis.
         *
         * @param {number} value
         * @param {{ minValue: number, defaultValue: number, maxValue: number }} axis
         * @returns {number}  in [-1, +1]
         */
        function normaliseAxisValue(value, axis) {
            const { minValue, defaultValue, maxValue } = axis;
            if (value === defaultValue) return 0;
            if (value > defaultValue) {
                if (maxValue === defaultValue) return 0;
                const v = (value - defaultValue) / (maxValue - defaultValue);
                return Math.min(1, v);
            }
            if (defaultValue === minValue) return 0;
            const v = (value - defaultValue) / (defaultValue - minValue);
            return Math.max(-1, v);
        }

        /**
         * Normalise an entire axes coordinate object `{ [tag]: userValue }`
         * given the fvar axes definitions, optionally remapping each value
         * through the avar segment map.
         *
         * @param {object} userCoords    map of axis tag → user-space value
         * @param {Array} fvarAxes       output of parseFvar().axes
         * @param {Array<Array>} [avarSegmentMaps] one array per fvar axis (matching index)
         * @returns {Array<number>}      array of normalised coords in fvar axis order
         */
        function normaliseAxesCoords(userCoords, fvarAxes, avarSegmentMaps) {
            const out = new Array(fvarAxes.length);
            for (let i = 0; i < fvarAxes.length; i++) {
                const axis = fvarAxes[i];
                const v = userCoords[axis.tag] != null ? userCoords[axis.tag] : axis.defaultValue;
                const n = normaliseAxisValue(v, axis);
                out[i] = avarSegmentMaps ? applyAvarSegment(avarSegmentMaps[i], n) : n;
            }
            return out;
        }

        return { normaliseAxisValue, normaliseAxesCoords };
    }
};
