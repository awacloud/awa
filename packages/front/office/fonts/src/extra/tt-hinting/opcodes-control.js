// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TT hinting VM — flow control handlers.
 *
 * Strict factory-only module. `RenderError` is read off `vm.RenderError`.
 *
 * @module fonts/extra/tt-hinting/opcodes-control
 */

export const ttHintingOpControl = {
    name: 'ttHintingOpControl',
    dependencies: [],
    factory() {
        function handleControlOp(op, vm) {
            const { pop, reader, bytes, opPos, skipTo, RenderError } = vm;
            switch (op) {
                case 0x58: {
                    const cond = pop();
                    if (!cond) {
                        const hit = skipTo([0x1B, 0x59]);
                        if (hit === 0x59) {/* consumed EIF */}
                    }
                    return true;
                }
                case 0x1B: {
                    skipTo([0x59]);
                    return true;
                }
                case 0x59: return true;
                case 0x1C: {
                    const off = pop();
                    const tgt = opPos + off;
                    if (tgt < 0 || tgt > bytes.length)
                        throw new RenderError('fonts/tt-hinting-jump-range',
                            'JMPR target out of range',
                            { context: { tgt, length: bytes.length } });
                    reader.seek(tgt);
                    return true;
                }
                case 0x78: {
                    const e = pop(), off = pop();
                    if (e) {
                        const tgt = opPos + off;
                        if (tgt < 0 || tgt > bytes.length)
                            throw new RenderError('fonts/tt-hinting-jump-range',
                                'JROT target out of range',
                                { context: { tgt, length: bytes.length } });
                        reader.seek(tgt);
                    }
                    return true;
                }
                case 0x79: {
                    const e = pop(), off = pop();
                    if (!e) {
                        const tgt = opPos + off;
                        if (tgt < 0 || tgt > bytes.length)
                            throw new RenderError('fonts/tt-hinting-jump-range',
                                'JROF target out of range',
                                { context: { tgt, length: bytes.length } });
                        reader.seek(tgt);
                    }
                    return true;
                }
            }
            return false;
        }

        return { handleControlOp };
    }
};
