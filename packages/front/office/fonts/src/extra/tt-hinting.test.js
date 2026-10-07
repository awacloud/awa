// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { extraTtHinting } from './tt-hinting.js';
import { testRuntime } from './_test-runtime.js';
const { interpret, RM05_OPCODES, RM05_DEFERRED_COUNT, GraphicsState, Zone } = testRuntime.resolve('extraTtHinting');
const { BinaryReader } = testRuntime.resolve('fontReader');
const { RenderError } = testRuntime.resolve('fontErrors');

const F26DOT6 = 64;

function code(...arr) { return new Uint8Array(arr); }

describe('extraTtHinting â€” module metadata', () => {
    test('factory shape', () => {
        expect(extraTtHinting.name).toBe('extraTtHinting');
        expect(extraTtHinting.dependencies).toContain('fontErrors');
        expect(extraTtHinting.dependencies).toContain('fontReader');
        const api = testRuntime.resolve('extraTtHinting');
        expect(typeof api.interpret).toBe('function');
        expect(api.GraphicsState).toBe(GraphicsState);
        expect(api.Zone).toBe(Zone);
    });

    test('opcode catalogue is populated', () => {
        // 0xB0..0xBF push family + many singletons should be present
        expect(RM05_OPCODES[0xB0].name).toBe('PUSHB[0]');
        expect(RM05_OPCODES[0xB8].name).toBe('PUSHW[0]');
        expect(RM05_OPCODES[0x60].name).toBe('ADD');
        expect(RM05_OPCODES[0x58].name).toBe('IF');
        // Deferred count shrinks as Phase-2 lands more opcodes; a handful
        // (CALL, FDEF, ENDF, LOOPCALL, IDEF, GETINFO, etc.) remain.
        expect(RM05_DEFERRED_COUNT).toBeGreaterThan(10);
    });
});

describe('extraTtHinting â€” push family', () => {
    test('PUSHB pushes N+1 unsigned bytes', () => {
        // 0xB2 = PUSHB[2] â†’ 3 bytes
        const { stack } = interpret(code(0xB2, 0x01, 0x02, 0x03));
        expect(stack).toEqual([1, 2, 3]);
    });

    test('PUSHW pushes N+1 signed 16-bit words', () => {
        // 0xB8 = PUSHW[0] â†’ 1 word ; 0xFF 0xFE = -2 (BE)
        const { stack } = interpret(code(0xB8, 0xFF, 0xFE));
        expect(stack).toEqual([-2]);
    });

    test('NPUSHB / NPUSHW', () => {
        const { stack: a } = interpret(code(0x40, 0x02, 0x10, 0x20));
        expect(a).toEqual([0x10, 0x20]);
        const { stack: b } = interpret(code(0x41, 0x01, 0x00, 0x05));
        expect(b).toEqual([5]);
    });
});

describe('extraTtHinting â€” math + stack', () => {
    test('ADD', () => {
        // push 3, 4 â†’ ADD â†’ 7
        const { stack } = interpret(code(0xB1, 3, 4, 0x60));
        expect(stack).toEqual([7]);
    });

    test('SUB', () => {
        // push 10, 4 â†’ SUB â†’ 6
        const { stack } = interpret(code(0xB1, 10, 4, 0x61));
        expect(stack).toEqual([6]);
    });

    test('DUP', () => {
        const { stack } = interpret(code(0xB0, 5, 0x20));
        expect(stack).toEqual([5, 5]);
    });
});

describe('extraTtHinting â€” graphics state reads', () => {
    test('MPPEM returns context ppem', () => {
        const { stack } = interpret(code(0x4B), { ppem: 24 });
        expect(stack).toEqual([24]);
    });

    test('MPS returns context point size', () => {
        const { stack } = interpret(code(0x4C), { pointSize: 18 });
        expect(stack).toEqual([18]);
    });
});

describe('extraTtHinting â€” flow control', () => {
    test('IF / ELSE / EIF then-branch', () => {
        // push 1, IF, push 42, ELSE, push 7, EIF
        const bc = code(0xB0, 1, 0x58, 0xB0, 42, 0x1B, 0xB0, 7, 0x59);
        const { stack } = interpret(bc);
        expect(stack).toEqual([42]);
    });

    test('IF / ELSE / EIF else-branch', () => {
        const bc = code(0xB0, 0, 0x58, 0xB0, 42, 0x1B, 0xB0, 7, 0x59);
        const { stack } = interpret(bc);
        expect(stack).toEqual([7]);
    });

    test('IF without ELSE, false skips to EIF', () => {
        const bc = code(0xB0, 0, 0x58, 0xB0, 99, 0x59, 0xB0, 1);
        const { stack } = interpret(bc);
        expect(stack).toEqual([1]);
    });

    test('JMPR jumps relative to opcode position', () => {
        // [0] PUSHW 0x0005 (offset 5)
        // [3] JMPR (op at pos 3, +5 â†’ pos 8)
        // [4] PUSHB 0x99       â† skipped
        // [6] PUSHB 0xAA       â† skipped
        // [8] PUSHB 0x77       â† landed
        const bc = code(
            0xB8, 0x00, 0x05,   // 0..2
            0x1C,               // 3 JMPR
            0xB0, 0x99,         // 4..5
            0xB0, 0xAA,         // 6..7
            0xB0, 0x77,         // 8..9
        );
        const { stack } = interpret(bc);
        expect(stack).toEqual([0x77]);
    });
});

describe('extraTtHinting â€” storage + CVT', () => {
    test('WS / RS roundtrip', () => {
        // push idx=2, val=99 â†’ WS ; push idx=2 â†’ RS
        const bc = code(0xB1, 2, 99, 0x42, 0xB0, 2, 0x43);
        const { stack } = interpret(bc);
        expect(stack).toEqual([99]);
    });

    test('WCVTP / RCVT roundtrip', () => {
        const bc = code(0xB1, 0, 64, 0x44, 0xB0, 0, 0x45);
        const { stack } = interpret(bc);
        expect(stack).toEqual([64]);
    });
});

describe('extraTtHinting â€” errors', () => {
    test('unimplemented opcode raises typed RenderError', () => {
        // 0x2B = CALL (deferred)
        expect(() => interpret(code(0x2B))).toThrow(RenderError);
    });

    test('unimplemented opcode error carries the code and names the opcode, no internal label', () => {
        // 0x2B = CALL (deferred)
        let err;
        try { interpret(code(0x2B)); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(RenderError);
        expect(err.code).toBe('fonts/tt-hinting-unimplemented');
        expect(err.message).toContain('TT opcode not implemented: CALL (0x2b)');
        expect(err.message).not.toContain('Phase');
    });

    test('stack underflow', () => {
        expect(() => interpret(code(0x21))).toThrow(RenderError);
    });

    test('rejects non-Uint8Array input', () => {
        // ParseError, not RenderError
        expect(() => interpret(/** @type {any} */ ([0xB0, 1]))).toThrow();
    });
});

describe('extraTtHinting â€” Phase-2 vectors', () => {
    test('SVTCA[1] sets vectors to x-axis', () => {
        const { gs } = interpret(code(0x01));
        expect(gs.projection_vector).toEqual([0x4000, 0]);
        expect(gs.freedom_vector).toEqual([0x4000, 0]);
    });

    test('SVTCA[0] sets vectors to y-axis', () => {
        const { gs } = interpret(code(0x00));
        expect(gs.projection_vector).toEqual([0, 0x4000]);
        expect(gs.freedom_vector).toEqual([0, 0x4000]);
    });

    test('SPVTCA only touches projection', () => {
        // SFVTCA[1] then SPVTCA[0]: freedom = x-axis, projection = y-axis
        const { gs } = interpret(code(0x05, 0x02));
        expect(gs.freedom_vector).toEqual([0x4000, 0]);
        expect(gs.projection_vector).toEqual([0, 0x4000]);
    });
});

describe('extraTtHinting â€” Phase-2 reference & zone pointers', () => {
    test('SRP0 / SRP1 / SRP2 consume one item each', () => {
        // push 7 â†’ SRP0, push 8 â†’ SRP1, push 9 â†’ SRP2
        const bc = code(0xB0, 7, 0x10, 0xB0, 8, 0x11, 0xB0, 9, 0x12);
        const { gs, stack } = interpret(bc);
        expect(gs.rp0).toBe(7);
        expect(gs.rp1).toBe(8);
        expect(gs.rp2).toBe(9);
        expect(stack).toEqual([]);
    });

    test('SZP0 / SZP1 / SZP2 set zone pointers', () => {
        const bc = code(0xB0, 0, 0x13, 0xB0, 1, 0x14, 0xB0, 0, 0x15);
        const { gs } = interpret(bc);
        expect(gs.zp0).toBe(0);
        expect(gs.zp1).toBe(1);
        expect(gs.zp2).toBe(0);
    });

    test('SZPS sets all three at once', () => {
        const { gs } = interpret(code(0xB0, 0, 0x16));
        expect(gs.zp0).toBe(0);
        expect(gs.zp1).toBe(0);
        expect(gs.zp2).toBe(0);
    });
});

describe('extraTtHinting â€” Phase-2 rounding', () => {
    test('SROUND records period/phase/threshold', () => {
        // byte = 0b10_01_0100 = 0x94 â†’ period=2, phase=1, threshold=4
        const { gs } = interpret(code(0xB0, 0x94, 0x76));
        expect(gs.round_state).toBe(5);
        expect(gs.round_period).toBe(2);
        expect(gs.round_phase).toBe(1);
        expect(gs.round_threshold).toBe(4);
    });

    test('S45ROUND uses round_state 6', () => {
        const { gs } = interpret(code(0xB0, 0x40, 0x77));
        expect(gs.round_state).toBe(6);
        expect(gs.round_period).toBe(1);
    });

    test('RTHG / RTG / RTDG / ROFF / RUTG / RDTG set round_state', () => {
        expect(interpret(code(0x19)).gs.round_state).toBe(0); // RTHG
        expect(interpret(code(0x18)).gs.round_state).toBe(1); // RTG
        expect(interpret(code(0x3D)).gs.round_state).toBe(2); // RTDG
        expect(interpret(code(0x7A)).gs.round_state).toBe(3); // ROFF
        expect(interpret(code(0x7C)).gs.round_state).toBe(4); // RUTG
        expect(interpret(code(0x7D)).gs.round_state).toBe(7); // RDTG
    });
});

describe('extraTtHinting â€” Phase-2 misc setters', () => {
    test('SLOOP consumes one item and updates gs.loop', () => {
        const { gs, stack } = interpret(code(0xB0, 5, 0x17));
        expect(gs.loop).toBe(5);
        expect(stack).toEqual([]);
    });

    test('SLOOP < 1 throws', () => {
        expect(() => interpret(code(0xB0, 0, 0x17))).toThrow(RenderError);
    });

    test('FLIPON / FLIPOFF toggle auto_flip', () => {
        expect(interpret(code(0x4E)).gs.auto_flip).toBe(false);
        expect(interpret(code(0x4D)).gs.auto_flip).toBe(true);
    });

    test('SMD updates minimum_distance', () => {
        const { gs } = interpret(code(0xB1, 0, 32, 0x1A));
        expect(gs.minimum_distance).toBe(32);
    });
});

describe('extraTtHinting â€” Phase-2 deltas + MDRP', () => {
    test('DELTAP1 consumes n + 2n stack entries', () => {
        // 2 pairs: (arg0, pt0), (arg1, pt1), then count = 2
        const bc = code(
            0xB1, 0x10, 0x05,   // arg0=0x10, pt0=5
            0xB1, 0x20, 0x07,   // arg1=0x20, pt1=7
            0xB0, 0x02,         // count=2
            0x5D,               // DELTAP1
        );
        const { stack } = interpret(bc);
        expect(stack).toEqual([]);
    });

    test('DELTAC1 drains pairs as well', () => {
        const bc = code(0xB1, 0x10, 0x00, 0xB0, 0x01, 0x73);
        const { stack } = interpret(bc);
        expect(stack).toEqual([]);
    });

    test('MDRP[00010] (0xD0) consumes single point arg', () => {
        // 0xC0 + 0x10 = 0xD0
        const bc = code(0xB0, 0x09, 0xD0);
        const { gs, stack } = interpret(bc);
        expect(stack).toEqual([]);
        expect(gs.rp2).toBe(9);
        expect(gs.rp0).toBe(9); // bit 0x10 set â†’ reset rp0
    });

    test('MDRP[00000] (0xC0) does not reset rp0', () => {
        const bc = code(0xB0, 0x04, 0xC0);
        const { gs } = interpret(bc);
        expect(gs.rp2).toBe(4);
        expect(gs.rp0).toBe(0); // bit 0x10 clear â†’ rp0 unchanged
    });

    test('MIRP consumes cvt + point', () => {
        // 0xE0: MIRP base â€” pops cvt idx then point
        const bc = code(0xB1, 0x03, 0x02, 0xE0);
        const { gs, stack } = interpret(bc);
        expect(stack).toEqual([]);
        expect(gs.rp2).toBe(3);
    });
});

describe('extraTtHinting â€” GraphicsState defaults', () => {
    test('default GS is RM05-conformant', () => {
        const gs = new GraphicsState();
        expect(gs.projection_vector).toEqual([0x4000, 0]);
        expect(gs.freedom_vector).toEqual([0x4000, 0]);
        expect(gs.zp0).toBe(1);
        expect(gs.minimum_distance).toBe(F26DOT6);
        expect(gs.delta_base).toBe(9);
        expect(gs.delta_shift).toBe(3);
    });
});
