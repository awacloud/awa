// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — Graphics State setters + reads.
 *
 * Strict factory-only module.
 *
 * Reads : MPPEM (0x4B), MPS (0x4C), GPV (0x0C), GFV (0x0D),
 *         GC[0..1] (0x46..0x47), ROUND[00..11] (0x68..0x6B).
 *
 * Vector / projection setters : SVTCA/SPVTCA/SFVTCA (0x00..0x05),
 *   SPVTL/SFVTL (0x06..0x09), SPVFS (0x0A), SFVFS (0x0B), SFVTPV (0x0E).
 *
 * GS setters : SRP0/1/2 (0x10..0x12), SZP0/1/2/S (0x13..0x16),
 *   SLOOP (0x17), RTG/RTHG (0x18/0x19), SMD (0x1A),
 *   SCVTCI/SSWCI/SSW (0x1D..0x1F), RTDG (0x3D),
 *   FLIPON/FLIPOFF (0x4D/0x4E), SROUND/S45ROUND (0x76/0x77),
 *   ROFF (0x7A), RUTG (0x7C), RDTG (0x7D),
 *   SCANCTRL (0x85), SCANTYPE (0x8D), INSTCTRL (0x8E).
 *
 * @module fonts/extra/tt-hinting/opcodes-gs
 */

export const ttHintingOpGs = {
    name: 'ttHintingOpGs',
    dependencies: [],
    factory() {
        // F2DOT14_ONE replicated locally to keep module top-level strict.
        const F2DOT14_ONE = 1 << 14;

        function handleGsOp(op, vm) {
            const { push, pop, gs, zones, ppem, pointSize, round, RenderError } = vm;
            switch (op) {
                /* GS reads */
                case 0x4B: push(ppem); return true;                  // MPPEM
                case 0x4C: push(pointSize); return true;             // MPS
                case 0x0C: { // GPV
                    push(gs.projection_vector[0]);
                    push(gs.projection_vector[1]);
                    return true;
                }
                case 0x0D: { // GFV
                    push(gs.freedom_vector[0]);
                    push(gs.freedom_vector[1]);
                    return true;
                }
                case 0x46:
                case 0x47: { // GC[a] — coordinate of a point along projection vector
                    const p = pop();
                    const z = zones[gs.zp2];
                    if (p < 0 || p >= z.length)
                        throw new RenderError('fonts/tt-hinting-bad-point',
                            'GC point out of range',
                            { context: { point: p, zone: gs.zp2, length: z.length } });
                    const useOrig = (op & 1) === 1;
                    const x = useOrig ? z.origX[p] : z.x[p];
                    const y = useOrig ? z.origY[p] : z.y[p];
                    const pv = gs.projection_vector;
                    // F2Dot14 dot product → result is in same units as point coords.
                    push(Math.trunc((x * pv[0] + y * pv[1]) / F2DOT14_ONE));
                    return true;
                }
                case 0x68: case 0x69: case 0x6A: case 0x6B: { // ROUND[ab]
                    push(round(pop()));
                    return true;
                }

                /* ─── vectors ─── */

                case 0x00:
                case 0x01: { // SVTCA[a]
                    const x = (op & 1) ? F2DOT14_ONE : 0;
                    const y = (op & 1) ? 0 : F2DOT14_ONE;
                    gs.projection_vector = [x, y];
                    gs.freedom_vector    = [x, y];
                    gs.dual_proj_vector  = [x, y];
                    return true;
                }
                case 0x02:
                case 0x03: { // SPVTCA[a]
                    const x = (op & 1) ? F2DOT14_ONE : 0;
                    const y = (op & 1) ? 0 : F2DOT14_ONE;
                    gs.projection_vector = [x, y];
                    gs.dual_proj_vector  = [x, y];
                    return true;
                }
                case 0x04:
                case 0x05: { // SFVTCA[a]
                    const x = (op & 1) ? F2DOT14_ONE : 0;
                    const y = (op & 1) ? 0 : F2DOT14_ONE;
                    gs.freedom_vector = [x, y];
                    return true;
                }
                case 0x06:
                case 0x07: { // SPVTL[a]
                    const p1 = pop(), p2 = pop();
                    const z1 = zones[gs.zp1], z2 = zones[gs.zp2];
                    let dx = 0, dy = 0;
                    if (p1 < z1.length && p2 < z2.length) {
                        dx = z2.x[p2] - z1.x[p1];
                        dy = z2.y[p2] - z1.y[p1];
                    }
                    if (op & 1) { const t = dx; dx = -dy; dy = t; } // perp
                    const len = Math.hypot(dx, dy) || 1;
                    gs.projection_vector = [
                        Math.trunc(dx / len * F2DOT14_ONE),
                        Math.trunc(dy / len * F2DOT14_ONE),
                    ];
                    gs.dual_proj_vector = gs.projection_vector.slice();
                    return true;
                }
                case 0x08:
                case 0x09: { // SFVTL[a]
                    const p1 = pop(), p2 = pop();
                    const z1 = zones[gs.zp1], z2 = zones[gs.zp2];
                    let dx = 0, dy = 0;
                    if (p1 < z1.length && p2 < z2.length) {
                        dx = z2.x[p2] - z1.x[p1];
                        dy = z2.y[p2] - z1.y[p1];
                    }
                    if (op & 1) { const t = dx; dx = -dy; dy = t; }
                    const len = Math.hypot(dx, dy) || 1;
                    gs.freedom_vector = [
                        Math.trunc(dx / len * F2DOT14_ONE),
                        Math.trunc(dy / len * F2DOT14_ONE),
                    ];
                    return true;
                }
                case 0x0A: { // SPVFS
                    const y = pop(), x = pop();
                    gs.projection_vector = [x | 0, y | 0];
                    gs.dual_proj_vector  = [x | 0, y | 0];
                    return true;
                }
                case 0x0B: { // SFVFS
                    const y = pop(), x = pop();
                    gs.freedom_vector = [x | 0, y | 0];
                    return true;
                }
                case 0x0E: { // SFVTPV
                    gs.freedom_vector = gs.projection_vector.slice();
                    return true;
                }

                /* ─── GS setters ─── */

                case 0x10: gs.rp0 = pop() | 0; return true;
                case 0x11: gs.rp1 = pop() | 0; return true;
                case 0x12: gs.rp2 = pop() | 0; return true;
                case 0x13: gs.zp0 = pop() | 0; return true;
                case 0x14: gs.zp1 = pop() | 0; return true;
                case 0x15: gs.zp2 = pop() | 0; return true;
                case 0x16: {
                    const z = pop() | 0;
                    gs.zp0 = z; gs.zp1 = z; gs.zp2 = z;
                    return true;
                }
                case 0x17: {
                    const v = pop() | 0;
                    if (v < 1)
                        throw new RenderError('fonts/tt-hinting-bad-loop',
                            'SLOOP value must be ≥ 1', { context: { v } });
                    gs.loop = v;
                    return true;
                }
                case 0x18: gs.round_state = 1; return true;
                case 0x19: gs.round_state = 0; return true;
                case 0x1A: gs.minimum_distance = pop() | 0; return true;
                case 0x1D: gs.control_value_cut_in = pop() | 0; return true;
                case 0x1E: gs.single_width_cut_in  = pop() | 0; return true;
                case 0x1F: gs.single_width_value   = pop() | 0; return true;
                case 0x3D: gs.round_state = 2; return true;
                case 0x4D: gs.auto_flip = true;  return true;
                case 0x4E: gs.auto_flip = false; return true;
                case 0x76: {
                    const n = pop() & 0xFF;
                    gs.round_state = 5;
                    gs.round_period = (n >> 6) & 0x3;
                    gs.round_phase  = (n >> 4) & 0x3;
                    gs.round_threshold = n & 0xF;
                    return true;
                }
                case 0x77: {
                    const n = pop() & 0xFF;
                    gs.round_state = 6;
                    gs.round_period = (n >> 6) & 0x3;
                    gs.round_phase  = (n >> 4) & 0x3;
                    gs.round_threshold = n & 0xF;
                    return true;
                }
                case 0x7A: gs.round_state = 3; return true;
                case 0x7C: gs.round_state = 4; return true;
                case 0x7D: gs.round_state = 7; return true;
                case 0x85: gs.scan_control_flag = pop() | 0; return true;
                case 0x8D: gs.scan_type         = pop() | 0; return true;
                case 0x8E: {
                    pop(); // selector
                    gs.instruct_control = pop() | 0;
                    return true;
                }
            }
            return false;
        }

        return { handleGsOp };
    }
};
