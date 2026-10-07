// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TrueType hinting VM — Graphics State + Zone.
 *
 * Strict factory-only module. Constants and classes are owned by the
 * factory body; consumers resolve via `ttHintingGs` through the runtime.
 *
 * @module fonts/extra/tt-hinting/gs
 */

/** DI wrapper for {@link ../tt-hinting.js} — bundles constants + classes. */
export const ttHintingGs = {
    name: 'ttHintingGs',
    dependencies: [],
    factory() {
        const F26DOT6 = 64;          // one pixel in 26.6 fixed-point
        const F2DOT14_ONE = 1 << 14;
        const MAX_STEPS = 1_000_000;
        const MAX_STACK = 10_000;

        /**
         * RM05 Graphics State — every interpreter run owns one. Numeric fields
         * use 26.6 unless noted (vectors use F2Dot14).
         */
        class GraphicsState {
            constructor() {
                // Direction vectors (F2Dot14 — 1.0 → 0x4000)
                this.projection_vector = [F2DOT14_ONE, 0];
                this.freedom_vector    = [F2DOT14_ONE, 0];
                this.dual_proj_vector  = [F2DOT14_ONE, 0];
                // Reference points
                this.rp0 = 0; this.rp1 = 0; this.rp2 = 0;
                // Glyph element pointers
                this.gep0 = 1; this.gep1 = 1; this.gep2 = 1;
                // Zone pointers — index into `zones`
                this.zp0 = 1; this.zp1 = 1; this.zp2 = 1;
                // Distances / thresholds (26.6)
                this.control_value_cut_in = 68;      // 17/16 px
                this.single_width_value   = 0;
                this.single_width_cut_in  = 0;
                this.minimum_distance     = F26DOT6;  // 1 px
                // Loop counter
                this.loop = 1;
                // Scan conversion / instruct control flags
                this.scan_control_flag = 0;
                this.scan_type         = 0;
                this.instruct_control  = 0;
                // Delta exception
                this.delta_base  = 9;
                this.delta_shift = 3;
                // Rounding (`round_state` encodes RM05 round-state byte)
                this.round_state = 1;                 // grid
                this.auto_flip   = true;
            }
        }

        /**
         * A Zone holds parallel arrays of original / current point coordinates
         * plus on-curve flags. Zone 0 is the "twilight" zone and starts empty;
         * Zone 1 is the glyph zone — callers populate it before `interpret`.
         */
        class Zone {
            /** @param {number} [n=0] initial point count (all-zero coords). */
            constructor(n) {
                const k = n || 0;
                this.x        = new Float64Array(k);
                this.y        = new Float64Array(k);
                this.origX    = new Float64Array(k);
                this.origY    = new Float64Array(k);
                this.onCurve  = new Uint8Array(k);
                this.touched  = new Uint8Array(k);
            }
            get length() { return this.x.length; }
        }

        return { F26DOT6, F2DOT14_ONE, MAX_STEPS, MAX_STACK, GraphicsState, Zone };
    }
};
