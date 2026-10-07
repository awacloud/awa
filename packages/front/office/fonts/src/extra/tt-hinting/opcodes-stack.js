// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — stack manipulation handlers.
 *
 * Strict factory-only module. `RenderError` is read off `vm.RenderError`
 * (injected by the orchestrator factory).
 *
 * Handles DUP (0x20), POP (0x21), CLEAR (0x22), SWAP (0x23),
 * DEPTH (0x24), CINDEX (0x25), MINDEX (0x26), ROLL (0x8A).
 *
 * @module fonts/extra/tt-hinting/opcodes-stack
 */

export const ttHintingOpStack = {
    name: 'ttHintingOpStack',
    dependencies: [],
    factory() {
        function handleStackOp(op, vm) {
            const { stack, push, pop, RenderError } = vm;
            switch (op) {
                case 0x20: { const v = pop(); push(v); push(v); return true; }
                case 0x21: pop(); return true;
                case 0x22: stack.length = 0; return true;
                case 0x23: { const a = pop(), b = pop(); push(a); push(b); return true; }
                case 0x24: push(stack.length); return true;
                case 0x25: {
                    const k = pop();
                    if (k < 1 || k > stack.length)
                        throw new RenderError('fonts/tt-hinting-cindex',
                            'CINDEX out of range',
                            { context: { k, depth: stack.length } });
                    push(stack[stack.length - k]);
                    return true;
                }
                case 0x26: {
                    const k = pop();
                    if (k < 1 || k > stack.length)
                        throw new RenderError('fonts/tt-hinting-mindex',
                            'MINDEX out of range',
                            { context: { k, depth: stack.length } });
                    const v = stack.splice(stack.length - k, 1)[0];
                    push(v);
                    return true;
                }
                case 0x8A: {
                    const c3 = pop(), b3 = pop(), a3 = pop();
                    push(b3); push(c3); push(a3);
                    return true;
                }
            }
            return false;
        }

        return { handleStackOp };
    }
};
