// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — outline manipulation skeletons.
 *
 * Strict factory-only module.
 *
 * Handles MDAP[0..1] (0x2E/0x2F), MIAP[0..1] (0x3E/0x3F),
 * MDRP (0xC0..0xDF), MIRP (0xE0..0xFF), IUP[0..1] (0x30/0x31),
 * SHP[0..1] (0x32/0x33), SHC[0..1] (0x34/0x35),
 * SHZ[0..1] (0x36/0x37), SHPIX (0x38), IP (0x39), ALIGNRP (0x3C),
 * ALIGNPTS (0x27), ISECT (0x0F).
 *
 * Geometry is not computed — handlers update reference points
 * and drain the stack to keep execution flowing.
 *
 * @module fonts/extra/tt-hinting/opcodes-outline
 */

export const ttHintingOpOutline = {
    name: 'ttHintingOpOutline',
    dependencies: [],
    factory() {
        function handleOutlineOp(op, vm) {
            const { pop, gs } = vm;

            // MDRP range
            if (op >= 0xC0 && op <= 0xDF) {
                const p = pop() | 0;
                gs.rp1 = gs.rp0;
                gs.rp2 = p;
                if (op & 0x10) gs.rp0 = p;
                return true;
            }
            // MIRP range
            if (op >= 0xE0 && op <= 0xFF) {
                pop(); // cvt index
                const p = pop() | 0;
                gs.rp1 = gs.rp0;
                gs.rp2 = p;
                if (op & 0x10) gs.rp0 = p;
                return true;
            }

            switch (op) {
                /** ALIGNPTS (0x27) — Align two points. Pops 2. Geometry: no-op. */
                case 0x27: { pop(); pop(); return true; }
                /** MDAP[a] (0x2E..0x2F) — Move direct absolute point. Pops 1.
                 *  rp0 = rp1 = point. a=1 rounds (no-op in scaffold). */
                case 0x2E:
                case 0x2F: {
                    const p = pop() | 0;
                    gs.rp0 = p; gs.rp1 = p;
                    return true;
                }
                /** IUP[a] (0x30..0x31) — Interpolate untouched points. 0/0. No-op. */
                case 0x30:
                case 0x31: return true;
                /** SHP[a] (0x32..0x33) — Shift point using rpN. Pops `loop` points. */
                case 0x32:
                case 0x33: {
                    for (let i = 0; i < gs.loop; i++) pop();
                    gs.loop = 1;
                    return true;
                }
                /** SHC[a] (0x34..0x35) — Shift contour. Pops 1. */
                case 0x34:
                case 0x35: { pop(); return true; }
                /** SHZ[a] (0x36..0x37) — Shift zone. Pops 1. */
                case 0x36:
                case 0x37: { pop(); return true; }
                /** SHPIX (0x38) — Shift point by pixel amount. Pops loop + 1. */
                case 0x38: {
                    pop(); // amount
                    for (let i = 0; i < gs.loop; i++) pop();
                    gs.loop = 1;
                    return true;
                }
                /** IP (0x39) — Interpolate point. Pops `loop` points. */
                case 0x39: {
                    for (let i = 0; i < gs.loop; i++) pop();
                    gs.loop = 1;
                    return true;
                }
                /** ALIGNRP (0x3C) — Align points to rp0. Pops `loop` points. */
                case 0x3C: {
                    for (let i = 0; i < gs.loop; i++) pop();
                    gs.loop = 1;
                    return true;
                }
                /** MIAP[ab] (0x3E..0x3F) — Move indirect absolute point. Pops 2. */
                case 0x3E:
                case 0x3F: {
                    pop(); // cvt index
                    const p = pop() | 0;
                    gs.rp0 = p; gs.rp1 = p;
                    return true;
                }
                /** ISECT (0x0F) — Move pt to intersection of two lines. Pops 5. */
                case 0x0F: {
                    pop(); pop(); pop(); pop(); pop();
                    return true;
                }
            }
            return false;
        }

        return { handleOutlineOp };
    }
};
