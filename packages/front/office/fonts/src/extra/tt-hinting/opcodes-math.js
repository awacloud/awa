// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — math + logical handlers.
 *
 * Strict factory-only module. `RenderError` is read off `vm.RenderError`.
 *
 * @module fonts/extra/tt-hinting/opcodes-math
 */

export const ttHintingOpMath = {
    name: 'ttHintingOpMath',
    dependencies: [],
    factory() {
        // F26DOT6 is replicated here (kept in sync with ./gs.js) to keep this
        // module's top-level fully strict — no imports at module scope.
        const F26DOT6 = 64;

        function handleMathOp(op, vm) {
            const { push, pop, opPos, RenderError } = vm;
            switch (op) {
                case 0x60: { const b = pop(), a = pop(); push(a + b); return true; }
                case 0x61: { const b = pop(), a = pop(); push(a - b); return true; }
                case 0x63: {
                    const b = pop(), a = pop();
                    push(Math.trunc((a * b) / F26DOT6));
                    return true;
                }
                case 0x62: {
                    const b = pop(), a = pop();
                    if (b === 0)
                        throw new RenderError('fonts/tt-hinting-div-zero',
                            'DIV by zero', { context: { pos: opPos } });
                    push(Math.trunc((a * F26DOT6) / b));
                    return true;
                }
                case 0x64: push(Math.abs(pop())); return true;
                case 0x65: push(-pop()); return true;
                case 0x66: {
                    const v = pop();
                    push(Math.floor(v / F26DOT6) * F26DOT6);
                    return true;
                }
                case 0x67: {
                    const v = pop();
                    push(Math.ceil(v / F26DOT6) * F26DOT6);
                    return true;
                }
                case 0x8B: { const b = pop(), a = pop(); push(a > b ? a : b); return true; }
                case 0x8C: { const b = pop(), a = pop(); push(a < b ? a : b); return true; }

                case 0x5A: { const b = pop(), a = pop(); push((a && b) ? 1 : 0); return true; }
                case 0x5B: { const b = pop(), a = pop(); push((a || b) ? 1 : 0); return true; }
                case 0x5C: push(pop() ? 0 : 1); return true;
                case 0x54: { const b = pop(), a = pop(); push(a === b ? 1 : 0); return true; }
                case 0x55: { const b = pop(), a = pop(); push(a !== b ? 1 : 0); return true; }
                case 0x50: { const b = pop(), a = pop(); push(a <  b ? 1 : 0); return true; }
                case 0x51: { const b = pop(), a = pop(); push(a <= b ? 1 : 0); return true; }
                case 0x52: { const b = pop(), a = pop(); push(a >  b ? 1 : 0); return true; }
                case 0x53: { const b = pop(), a = pop(); push(a >= b ? 1 : 0); return true; }
            }
            return false;
        }

        return { handleMathOp };
    }
};
