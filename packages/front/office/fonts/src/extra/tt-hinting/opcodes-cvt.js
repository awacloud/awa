// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — CVT + Storage + delta exceptions.
 *
 * Strict factory-only module. `RenderError` is read off `vm.RenderError`.
 *
 * @module fonts/extra/tt-hinting/opcodes-cvt
 */

export const ttHintingOpCvt = {
    name: 'ttHintingOpCvt',
    dependencies: [],
    factory() {
        function handleCvtOp(op, vm) {
            const { push, pop, cvt, storage, RenderError } = vm;
            switch (op) {
                case 0x44: {
                    const v = pop(), idx = pop();
                    if (idx < 0)
                        throw new RenderError('fonts/tt-hinting-bad-cvt',
                            'WCVTP negative index', { context: { idx } });
                    cvt[idx] = v | 0;
                    return true;
                }
                case 0x70: {
                    const v = pop(), idx = pop();
                    if (idx < 0)
                        throw new RenderError('fonts/tt-hinting-bad-cvt',
                            'WCVTF negative index', { context: { idx } });
                    cvt[idx] = v | 0;
                    return true;
                }
                case 0x45: {
                    const idx = pop();
                    push(cvt[idx] | 0);
                    return true;
                }
                case 0x42: {
                    const v = pop(), idx = pop();
                    if (idx < 0)
                        throw new RenderError('fonts/tt-hinting-bad-storage',
                            'WS negative index', { context: { idx } });
                    storage[idx] = v | 0;
                    return true;
                }
                case 0x43: {
                    const idx = pop();
                    push(storage[idx] | 0);
                    return true;
                }
                case 0x5D:
                case 0x71:
                case 0x72: {
                    const n = pop() | 0;
                    for (let i = 0; i < n; i++) { pop(); pop(); }
                    return true;
                }
                case 0x73:
                case 0x74:
                case 0x75: {
                    const n = pop() | 0;
                    for (let i = 0; i < n; i++) { pop(); pop(); }
                    return true;
                }
            }
            return false;
        }

        return { handleCvtOp };
    }
};
