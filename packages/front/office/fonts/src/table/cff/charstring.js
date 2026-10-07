// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CFF Type 2 charstring decoder.
 *
 * Decodes a per-glyph byte stream of operators into high-level path
 * commands { type: 'M'|'L'|'C', x, y, x1, y1, x2, y2 } + width.
 *
 * Package-private helper for {@link ../cff.js}.
 *
 * @module fonts/table/cff/charstring
 */

import { fontErrors } from '../../errors.js';

export const tableCffCharstring = {
    name: 'tableCffCharstring',
    dependencies: ['fontErrors'],
    deps: [fontErrors],
    factory(errors) {
        const { ParseError } = errors;

        /**
         * Subroutine bias per CFF spec : ≤ 1240 → 107, ≤ 33900 → 1131, else 32768.
         */
        function subrBias(count) {
            if (count < 1240) return 107;
            if (count < 33900) return 1131;
            return 32768;
        }

        function isWidthOp(op) {
            return op === 1 || op === 3 || op === 18 || op === 19 || op === 20 || op === 21 || op === 22 || op === 4 || op === 14 || op === 23;
        }

        function expectedOpArgs(op, _stackLen) {
            // For width detection purposes: the canonical number of args these ops consume.
            if (op === 14) return 0;     // endchar with no args (width-only if 1 on stack)
            if (op === 21) return 2;     // rmoveto
            if (op === 22 || op === 4) return 1; // hmoveto / vmoveto
            return 0;
        }

        function executeOp(op, stack, cmds, getX, getY, setXY, getHint, setHint, callSubr) {
            function moveTo(dx, dy) { const nx = getX() + dx, ny = getY() + dy; cmds.push({ type: 'M', x: nx, y: ny }); setXY(nx, ny); }
            function lineTo(dx, dy) { const nx = getX() + dx, ny = getY() + dy; cmds.push({ type: 'L', x: nx, y: ny }); setXY(nx, ny); }
            function curveTo(dx1, dy1, dx2, dy2, dx3, dy3) {
                const cx1 = getX() + dx1, cy1 = getY() + dy1;
                const cx2 = cx1 + dx2,     cy2 = cy1 + dy2;
                const x3  = cx2 + dx3,     y3  = cy2 + dy3;
                cmds.push({ type: 'C', x1: cx1, y1: cy1, x2: cx2, y2: cy2, x: x3, y: y3 });
                setXY(x3, y3);
            }
            switch (op) {
                case 21: { // rmoveto
                    const dy = stack.pop(); const dx = stack.pop();
                    moveTo(dx, dy);
                    stack.length = 0;
                    return;
                }
                case 22: { // hmoveto
                    const dx = stack.pop();
                    moveTo(dx, 0);
                    stack.length = 0;
                    return;
                }
                case 4: { // vmoveto
                    const dy = stack.pop();
                    moveTo(0, dy);
                    stack.length = 0;
                    return;
                }
                case 5: { // rlineto
                    for (let i = 0; i + 1 < stack.length; i += 2) lineTo(stack[i], stack[i + 1]);
                    stack.length = 0;
                    return;
                }
                case 6: { // hlineto
                    let horizontal = true;
                    for (const v of stack) {
                        if (horizontal) lineTo(v, 0); else lineTo(0, v);
                        horizontal = !horizontal;
                    }
                    stack.length = 0;
                    return;
                }
                case 7: { // vlineto
                    let horizontal = false;
                    for (const v of stack) {
                        if (horizontal) lineTo(v, 0); else lineTo(0, v);
                        horizontal = !horizontal;
                    }
                    stack.length = 0;
                    return;
                }
                case 8: { // rrcurveto
                    for (let i = 0; i + 5 < stack.length; i += 6) {
                        curveTo(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]);
                    }
                    stack.length = 0;
                    return;
                }
                case 24: { // rcurveline
                    let i = 0;
                    while (i + 5 < stack.length - 2) {
                        curveTo(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]);
                        i += 6;
                    }
                    lineTo(stack[i], stack[i + 1]);
                    stack.length = 0;
                    return;
                }
                case 25: { // rlinecurve
                    let i = 0;
                    while (i + 5 < stack.length) {
                        lineTo(stack[i], stack[i + 1]); i += 2;
                    }
                    curveTo(stack[i], stack[i + 1], stack[i + 2], stack[i + 3], stack[i + 4], stack[i + 5]);
                    stack.length = 0;
                    return;
                }
                case 27: { // hhcurveto
                    let i = 0;
                    let dy1 = 0;
                    if (stack.length & 1) { dy1 = stack[0]; i = 1; }
                    for (; i + 3 < stack.length; i += 4) {
                        curveTo(stack[i], dy1, stack[i + 1], stack[i + 2], stack[i + 3], 0);
                        dy1 = 0;
                    }
                    stack.length = 0;
                    return;
                }
                case 26: { // vvcurveto
                    let i = 0;
                    let dx1 = 0;
                    if (stack.length & 1) { dx1 = stack[0]; i = 1; }
                    for (; i + 3 < stack.length; i += 4) {
                        curveTo(dx1, stack[i], stack[i + 1], stack[i + 2], 0, stack[i + 3]);
                        dx1 = 0;
                    }
                    stack.length = 0;
                    return;
                }
                case 31: { // hvcurveto
                    let i = 0;
                    let alt = false;
                    while (i + 3 < stack.length) {
                        if (!alt) {
                            const lastY = (i + 4 < stack.length && (stack.length - i) % 8 === 5) ? stack[i + 4] : 0;
                            curveTo(stack[i], 0, stack[i + 1], stack[i + 2], lastY, stack[i + 3]);
                            i += 4 + (lastY ? 1 : 0);
                        } else {
                            const lastX = (i + 4 < stack.length && (stack.length - i) % 8 === 5) ? stack[i + 4] : 0;
                            curveTo(0, stack[i], stack[i + 1], stack[i + 2], stack[i + 3], lastX);
                            i += 4 + (lastX ? 1 : 0);
                        }
                        alt = !alt;
                    }
                    stack.length = 0;
                    return;
                }
                case 30: { // vhcurveto
                    let i = 0;
                    let alt = true;
                    while (i + 3 < stack.length) {
                        if (!alt) {
                            const lastY = (i + 4 < stack.length && (stack.length - i) % 8 === 5) ? stack[i + 4] : 0;
                            curveTo(stack[i], 0, stack[i + 1], stack[i + 2], lastY, stack[i + 3]);
                            i += 4 + (lastY ? 1 : 0);
                        } else {
                            const lastX = (i + 4 < stack.length && (stack.length - i) % 8 === 5) ? stack[i + 4] : 0;
                            curveTo(0, stack[i], stack[i + 1], stack[i + 2], stack[i + 3], lastX);
                            i += 4 + (lastX ? 1 : 0);
                        }
                        alt = !alt;
                    }
                    stack.length = 0;
                    return;
                }
                case 14:  // endchar
                    stack.length = 0;
                    return;
                case 1:   // hstem
                case 3:   // vstem
                case 18:  // hstemhm
                case 23:  // vstemhm
                    setHint(getHint() + (stack.length >>> 1));
                    stack.length = 0;
                    return;
                case 19:  // hintmask
                case 20:  // cntrmask
                    setHint(getHint() + (stack.length >>> 1));
                    stack.length = 0;
                    return;
                case 10:  // callsubr
                    callSubr(stack.pop(), false);
                    return;
                case 29:  // callgsubr
                    callSubr(stack.pop(), true);
                    return;
                case 11:  // return
                    return;
                default:
                    // Unknown / unsupported ops (flex etc.) — clear stack to keep going.
                    stack.length = 0;
            }
        }

        /**
         * Decode a Type 2 charstring into a sequence of high-level path
         * commands { type: 'M'|'L'|'C', x, y, x1, y1, x2, y2 } + width
         * `advanceWidth` (when the charstring starts with one).
         *
         * @param {Uint8Array} bytes
         * @param {{ globalSubrs?: Array, localSubrs?: Array, nominalWidthX?: number, defaultWidthX?: number, maxDepth?: number }} [ctx]
         * @returns {{ commands: Array, hintCount: number, width?: number }}
         */
        function decodeCharstring(bytes, ctx) {
            ctx = ctx || {};
            const globalSubrs = ctx.globalSubrs || [];
            const localSubrs  = ctx.localSubrs  || [];
            const gBias = subrBias(globalSubrs.length);
            const lBias = subrBias(localSubrs.length);
            const maxDepth = ctx.maxDepth ?? 10;
            const cmds = [];
            let x = 0, y = 0;
            let hintCount = 0;
            let width;
            let hadFirstStackOp = false;
            const stack = [];

            function run(stream, depth) {
                if (depth > maxDepth)
                    throw new ParseError('fonts/cff-cs-depth', 'CFF charstring recursion too deep',
                        { context: { depth } });
                let i = 0;
                while (i < stream.length) {
                    const b0 = stream[i++];
                    if (b0 >= 32 && b0 <= 246) { stack.push(b0 - 139); }
                    else if (b0 >= 247 && b0 <= 250) { stack.push((b0 - 247) * 256 + stream[i++] + 108); }
                    else if (b0 >= 251 && b0 <= 254) { stack.push(-((b0 - 251) * 256 + stream[i++] + 108)); }
                    else if (b0 === 28) { stack.push(((stream[i] << 24) >> 16) | stream[i + 1]); i += 2; }
                    else if (b0 === 255) {
                        // Fixed 16.16 in charstrings
                        const v = ((stream[i] << 24) | (stream[i + 1] << 16) | (stream[i + 2] << 8) | stream[i + 3]) | 0;
                        stack.push(v / 65536); i += 4;
                    }
                    else {
                        // Operator
                        let op = b0;
                        if (op === 12) op = 0x0C00 | stream[i++];
                        if (!hadFirstStackOp && stack.length > 0 && isWidthOp(op)) {
                            // Type 2 width detection : if stack has an extra (odd)
                            // value before certain ops, that's the width delta.
                            const expected = expectedOpArgs(op, stack.length);
                            if (stack.length > expected) {
                                width = stack.shift() + (ctx.nominalWidthX ?? 0);
                            }
                        }
                        hadFirstStackOp = true;
                        // hintmask / cntrmask consume mask bytes after the op
                        if (op === 19 || op === 20) {
                            hintCount += stack.length >>> 1;
                            stack.length = 0;
                            const maskBytes = Math.ceil(hintCount / 8);
                            i += maskBytes;
                            continue;
                        }
                        executeOp(op, stack, cmds, () => x, () => y,
                                  (nx, ny) => { x = nx; y = ny; },
                                  () => hintCount, n => { hintCount = n; },
                                  (idx, isGlobal) => {
                                      const arr = isGlobal ? globalSubrs : localSubrs;
                                      const bias = isGlobal ? gBias : lBias;
                                      const sub = arr[idx + bias];
                                      if (!sub)
                                          throw new ParseError('fonts/cff-cs-bad-subr',
                                              `CFF charstring references missing subr ${idx + bias}`,
                                              { context: { index: idx + bias, isGlobal } });
                                      run(sub, depth + 1);
                                  });
                        if (op === 14) return;          // endchar
                        if (op === 11) return;          // return (from subr)
                    }
                }
            }
            try { run(bytes, 0); } catch (e) { if (!(e instanceof ParseError)) throw new ParseError('fonts/cff-cs-decode', String(e), { cause: e }); throw e; }

            return { commands: cmds, hintCount, width };
        }

        return { subrBias, isWidthOp, executeOp, decodeCharstring };
    }
};

