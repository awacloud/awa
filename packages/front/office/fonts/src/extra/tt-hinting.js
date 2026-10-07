// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview TrueType bytecode hinting VM (RM05).
 *
 * Strict factory body. The opcode handler sub-modules and the GS/Zone
 * classes are pulled in via DI factory descriptors so this file owns no
 * top-level `import` statements.
 *
 * Logic is split across sibling sub-modules :
 *  - `./tt-hinting/gs.js`               — GraphicsState + Zone + constants
 *  - `./tt-hinting/opcodes-catalog.js`  — RM05_OPCODES + IMPLEMENTED set
 *  - `./tt-hinting/opcodes-push.js`     — PUSHB/PUSHW/NPUSHB/NPUSHW
 *  - `./tt-hinting/opcodes-stack.js`    — DUP/POP/CLEAR/SWAP/DEPTH/etc.
 *  - `./tt-hinting/opcodes-math.js`     — ADD/SUB/MUL/DIV/... + logical
 *  - `./tt-hinting/opcodes-control.js`  — IF/ELSE/EIF, JMPR/JROT/JROF
 *  - `./tt-hinting/opcodes-gs.js`       — GS setters/reads, vectors
 *  - `./tt-hinting/opcodes-outline.js`  — MDAP/MIAP/MDRP/MIRP/IUP/SHP/etc.
 *  - `./tt-hinting/opcodes-cvt.js`      — WCVTP/F, RCVT, WS/RS, deltas
 *
 * Public surface (GraphicsState, Zone, RM05_OPCODES, RM05_DEFERRED_COUNT)
 * is re-exported here for convenience.
 *
 * Opcode coverage is partial: the interpreter recognizes the majority of
 * the catalogued RM05 opcodes (`RM05_DEFERRED_COUNT` is the number it does
 * not), and the outline-movement opcodes do not move glyph geometry — see
 * `./tt-hinting/opcodes-outline.js`.
 *
 * @module fonts/extra/tt-hinting
 */

/**
 * @typedef {object} HintingContext
 * @property {number} [ppem]
 * @property {number} [pointSize]
 * @property {Int32Array|number[]} [cvt]
 * @property {Int32Array|number[]} [storage]
 * @property {object} [zone0]
 * @property {object} [zone1]
 * @property {object} [gs]
 * @property {number} [maxSteps]
 */

import { fontErrors } from '../errors.js';
import { fontReader } from '../primitives/reader.js';
import { ttHintingGs } from './tt-hinting/gs.js';
import { ttHintingOpCatalog } from './tt-hinting/opcodes-catalog.js';
import { ttHintingOpPush } from './tt-hinting/opcodes-push.js';
import { ttHintingOpStack } from './tt-hinting/opcodes-stack.js';
import { ttHintingOpMath } from './tt-hinting/opcodes-math.js';
import { ttHintingOpControl } from './tt-hinting/opcodes-control.js';
import { ttHintingOpGs } from './tt-hinting/opcodes-gs.js';
import { ttHintingOpOutline } from './tt-hinting/opcodes-outline.js';
import { ttHintingOpCvt } from './tt-hinting/opcodes-cvt.js';

export const extraTtHinting = {
    name: 'extraTtHinting',
    dependencies: [
        'fontErrors', 'fontReader',
        'ttHintingGs', 'ttHintingOpCatalog',
        'ttHintingOpPush', 'ttHintingOpStack', 'ttHintingOpMath',
        'ttHintingOpControl', 'ttHintingOpGs', 'ttHintingOpOutline',
        'ttHintingOpCvt'
    ],
    deps: [fontErrors, fontReader, ttHintingGs, ttHintingOpCatalog, ttHintingOpPush, ttHintingOpStack, ttHintingOpMath, ttHintingOpControl, ttHintingOpGs, ttHintingOpOutline, ttHintingOpCvt],
    factory(errors, reader, gsMod, catalogMod, pushMod, stackMod, mathMod, controlMod, gsOpMod, outlineMod, cvtMod) {
        const { ParseError, RenderError } = errors;
        const { BinaryReader } = reader;
        const { GraphicsState, Zone, MAX_STEPS, MAX_STACK, F26DOT6 } = gsMod;
        const { RM05_OPCODES, RM05_DEFERRED_COUNT } = catalogMod;
        const { handlePushOp } = pushMod;
        const { handleStackOp } = stackMod;
        const { handleMathOp } = mathMod;
        const { handleControlOp } = controlMod;
        const { handleGsOp } = gsOpMod;
        const { handleOutlineOp } = outlineMod;
        const { handleCvtOp } = cvtMod;

        /**
         * Execute a TrueType bytecode stream.
         *
         * @param {Uint8Array} bytes
         * @param {HintingContext} [ctx]
         */
        function interpret(bytes, ctx) {
            if (!(bytes instanceof Uint8Array))
                throw new ParseError('fonts/tt-hinting-input',
                    'interpret expects Uint8Array bytecode',
                    { context: { actual: typeof bytes } });

            const c = ctx || {};
            const gs = c.gs || new GraphicsState();
            const zones = [c.zone0 || new Zone(0), c.zone1 || new Zone(0)];
            const cvt     = Array.from(c.cvt     || []);
            const storage = Array.from(c.storage || []);
            const ppem      = c.ppem      != null ? c.ppem      : 12;
            const pointSize = c.pointSize != null ? c.pointSize :  9;
            const maxSteps  = c.maxSteps  != null ? c.maxSteps  : MAX_STEPS;

            const readerInst = new BinaryReader(bytes);
            const stack = [];
            let executed = 0;

            const push = (v) => {
                if (stack.length >= MAX_STACK)
                    throw new RenderError('fonts/tt-hinting-stack-overflow',
                        'TT VM stack overflow', { context: { limit: MAX_STACK } });
                stack.push(v | 0);
            };
            const pop = () => {
                if (stack.length === 0)
                    throw new RenderError('fonts/tt-hinting-stack-underflow',
                        'TT VM stack underflow', { context: { pos: readerInst.pos } });
                return stack.pop();
            };

            const round = (v, period) => {
                const p = period || F26DOT6;
                const half = p >> 1;
                return v >= 0
                    ? Math.trunc((v + half) / p) * p
                    : -Math.trunc((-v + half) / p) * p;
            };

            const skipTo = (targets) => {
                let depth = 0;
                while (!readerInst.eof) {
                    const op = readerInst.readUint8();
                    if (op === 0x58) depth++;
                    else if (op === 0x59) {
                        if (depth === 0 && targets.indexOf(0x59) >= 0) return 0x59;
                        depth--;
                    } else if (op === 0x1B && depth === 0
                               && targets.indexOf(0x1B) >= 0) {
                        return 0x1B;
                    } else if (op >= 0xB0 && op <= 0xB7) {
                        readerInst.skip(op - 0xB0 + 1);
                    } else if (op >= 0xB8 && op <= 0xBF) {
                        readerInst.skip(2 * (op - 0xB8 + 1));
                    } else if (op === 0x40) {
                        readerInst.skip(readerInst.readUint8());
                    } else if (op === 0x41) {
                        readerInst.skip(2 * readerInst.readUint8());
                    }
                }
                throw new RenderError('fonts/tt-hinting-unbalanced-if',
                    'unterminated IF block', { context: {} });
            };

            const vm = {
                stack, push, pop, gs, zones, cvt, storage,
                ppem, pointSize, reader: readerInst, bytes, skipTo, round,
                opPos: 0,
                RenderError
            };

            while (!readerInst.eof) {
                if (++executed > maxSteps)
                    throw new RenderError('fonts/tt-hinting-step-limit',
                        'TT VM step limit exceeded',
                        { context: { maxSteps, pos: readerInst.pos } });

                const opPos = readerInst.pos;
                const op = readerInst.readUint8();
                vm.opPos = opPos;

                if (handlePushOp(op, vm))    continue;
                if (handleStackOp(op, vm))   continue;
                if (handleMathOp(op, vm))    continue;
                if (handleControlOp(op, vm)) continue;
                if (handleGsOp(op, vm))      continue;
                if (handleCvtOp(op, vm))     continue;
                if (handleOutlineOp(op, vm)) continue;

                const info = RM05_OPCODES[op];
                if (info) {
                    throw new RenderError('fonts/tt-hinting-unimplemented',
                        'TT opcode not implemented: '
                            + info.name + ' (0x' + op.toString(16) + ')',
                        { context: { op, name: info.name, pos: opPos } });
                }
                throw new RenderError('fonts/tt-hinting-unknown-op',
                    'unknown TT opcode 0x' + op.toString(16),
                    { context: { op, pos: opPos } });
            }

            return { stack, gs, zones, executed, cvt, storage };
        }

        return { interpret, RM05_OPCODES, RM05_DEFERRED_COUNT, GraphicsState, Zone };
    }
};
