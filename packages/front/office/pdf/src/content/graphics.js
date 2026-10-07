// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Graphics state stack per ISO 32000-2:2020 §8.4.
 *
 * Implements a saveable / restorable state for a content-stream
 * interpreter. The set of state parameters covered here is the
 * **device-independent** subset (§8.4.1, Table 53) that L2 needs:
 *
 * - CTM (current transformation matrix, 2x3 affine)
 * - line width, cap, join, miter limit, dash pattern
 * - rendering intent, flatness tolerance
 * - text state nested via `text.js`
 * - color state (stroking + non-stroking) — see `color.js`
 *
 * Output is **not** a renderer; it is a faithful model of the
 * `gstate` chain that downstream layers (tagged-PDF MCID tracking,
 * text extraction, redaction) consume.
 *
 * @module pdf/content/graphics
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfGraphics = {
    name: 'pdfGraphics',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ContractError } = errors;

        /**
         * Construct an identity initial graphics state.
         */
        function initialGState() {
            return {
                ctm: [1, 0, 0, 1, 0, 0],
                lineWidth: 1.0,
                lineCap: 0,        // butt
                lineJoin: 0,       // miter
                miterLimit: 10.0,
                dash: { array: [], phase: 0 },
                renderingIntent: 'RelativeColorimetric',
                flatness: 1.0,
                text: {
                    charSpace: 0,
                    wordSpace: 0,
                    scale: 100,
                    leading: 0,
                    font: null,
                    fontSize: 0,
                    renderMode: 0,
                    rise: 0
                },
                strokeColor: { space: 'DeviceGray', components: [0] },
                fillColor:   { space: 'DeviceGray', components: [0] }
            };
        }

        /**
         * Multiply two 2x3 affine matrices (PDF row-vector convention).
         */
        function mulCtm(a, b) {
            return [
                a[0] * b[0] + a[1] * b[2],
                a[0] * b[1] + a[1] * b[3],
                a[2] * b[0] + a[3] * b[2],
                a[2] * b[1] + a[3] * b[3],
                a[4] * b[0] + a[5] * b[2] + b[4],
                a[4] * b[1] + a[5] * b[3] + b[5]
            ];
        }

        // Closure-based stack constructor — avoids `this.` references so
        // `factory.toString()` stays transportable across the worker
        // boundary (integration test contract). Returned objects support
        // `instanceof GStateStack` via the shared prototype path.
        function GStateStack() {
            const stack = [initialGState()];
            const api = Object.create(GStateStack.prototype);
            api.current = function () { return stack[stack.length - 1]; };
            api.save = function () {
                const cur = stack[stack.length - 1];
                stack.push({
                    ...cur,
                    ctm: cur.ctm.slice(),
                    dash: { array: cur.dash.array.slice(), phase: cur.dash.phase },
                    text: { ...cur.text },
                    strokeColor: { space: cur.strokeColor.space, components: cur.strokeColor.components.slice() },
                    fillColor:   { space: cur.fillColor.space,   components: cur.fillColor.components.slice() }
                });
            };
            api.restore = function () {
                if (stack.length <= 1) {
                    throw new ContractError('pdf/gstate/unbalanced-Q',
                        'Q without matching q');
                }
                stack.pop();
            };
            api.depth = function () { return stack.length; };
            api.concatCtm = function (matrix) {
                if (!Array.isArray(matrix) || matrix.length !== 6) {
                    throw new ContractError('pdf/gstate/bad-cm',
                        'cm matrix must have 6 elements');
                }
                const cur = stack[stack.length - 1];
                cur.ctm = mulCtm(matrix, cur.ctm);
            };
            return api;
        }

        function numArg(args, i) {
            const a = args[i];
            if (!a || (a.type !== 'int' && a.type !== 'real')) {
                throw new ContractError('pdf/gstate/bad-arg-type',
                    `expected numeric argument at position ${i}`,
                    { context: { index: i, kind: a && a.type } });
            }
            return a.value;
        }

        function numArgs(args, n) {
            const out = new Array(n);
            for (let i = 0; i < n; i++) out[i] = numArg(args, i);
            return out;
        }

        function nameArg(args, i) {
            const a = args[i];
            if (!a || a.type !== 'name') {
                throw new ContractError('pdf/gstate/bad-name-arg',
                    `expected name argument at position ${i}`,
                    { context: { index: i, kind: a && a.type } });
            }
            return a.value;
        }

        function arrArg(args, i) {
            const a = args[i];
            if (!a || a.type !== 'array') return [];
            return a.items
                .filter(x => x.type === 'int' || x.type === 'real')
                .map(x => x.value);
        }

        /**
         * Apply an op + args pair to a `GStateStack` instance.
         */
        function applyOp(stack, ops, handlers) {
            const cur = stack.current();
            switch (ops.op) {
                case 'q':  stack.save(); break;
                case 'Q':  stack.restore(); break;
                case 'cm':
                    stack.concatCtm(numArgs(ops.args, 6));
                    break;
                case 'w':  cur.lineWidth = numArg(ops.args, 0); break;
                case 'J':  cur.lineCap   = numArg(ops.args, 0) | 0; break;
                case 'j':  cur.lineJoin  = numArg(ops.args, 0) | 0; break;
                case 'M':  cur.miterLimit = numArg(ops.args, 0); break;
                case 'd':
                    cur.dash = {
                        array: arrArg(ops.args, 0),
                        phase: numArg(ops.args, 1)
                    };
                    break;
                case 'ri': cur.renderingIntent = nameArg(ops.args, 0); break;
                case 'i':  cur.flatness = numArg(ops.args, 0); break;
                default:
                    if (handlers && typeof handlers.unhandled === 'function') {
                        handlers.unhandled(ops, stack);
                    }
            }
        }

        function createStack() { return new GStateStack(); }

        return {
            GStateStack,
            createStack,
            applyOp,
            initialGState,
            mulCtm
        };
    }
};
