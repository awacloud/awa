// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Color operators + DeviceGray/RGB/CMYK helpers per
 * ISO 32000-2:2020 §8.6.
 *
 * Applies `g`/`G`/`rg`/`RG`/`k`/`K`/`cs`/`CS`/`sc`/`SC`/`scn`/`SCN`
 * operators to the graphics state. Returns the typed color record
 * `{ space: string, components: number[] }`.
 *
 * Patterns and Separation/DeviceN spaces accept a trailing `/PatternName`
 * argument via `scn`/`SCN` — captured in the record as
 * `{ space, components, pattern? }`.
 *
 * @module pdf/content/color
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';

export const pdfColor = {
    name: 'pdfColor',
    dependencies: ['pdfErrors'],
    deps: [pdfErrors],
    factory(errors) {
        const { ContractError } = errors;

        function nameArg(args, i) {
            const a = args[i];
            if (!a || a.type !== 'name') {
                throw new ContractError('pdf/color/bad-name',
                    `expected name arg at position ${i}`,
                    { context: { index: i, kind: a && a.type } });
            }
            return a.value;
        }

        function nums(args, n) {
            if (args.length < n) {
                throw new ContractError('pdf/color/short-args',
                    `expected ${n} numeric args, got ${args.length}`);
            }
            const out = new Array(n);
            for (let i = 0; i < n; i++) {
                const a = args[i];
                if (!a || (a.type !== 'int' && a.type !== 'real')) {
                    throw new ContractError('pdf/color/bad-num',
                        `arg ${i} is not numeric`,
                        { context: { index: i, kind: a && a.type } });
                }
                out[i] = a.value;
            }
            return out;
        }

        function numArgs(args) {
            return args
                .filter(a => a && (a.type === 'int' || a.type === 'real'))
                .map(a => a.value);
        }

        function deviceDefault(spaceName) {
            if (spaceName === 'DeviceGray') return [0];
            if (spaceName === 'DeviceRGB')  return [0, 0, 0];
            if (spaceName === 'DeviceCMYK') return [0, 0, 0, 1];
            return [];
        }

        function applyScn(gstate, slot, args) {
            if (args.length === 0) return;
            const last = args[args.length - 1];
            if (last && last.type === 'name') {
                gstate[slot].components = numArgs(args.slice(0, -1));
                gstate[slot].pattern    = last.value;
            } else {
                gstate[slot].components = numArgs(args);
                delete gstate[slot].pattern;
            }
        }

        /**
         * Apply a color operator to a gstate.
         *
         * @param {object} gstate
         * @param {{ op: string, args: object[] }} ops
         */
        function applyColorOp(gstate, ops) {
            switch (ops.op) {
                case 'g':   gstate.fillColor   = { space: 'DeviceGray', components: nums(ops.args, 1) }; break;
                case 'G':   gstate.strokeColor = { space: 'DeviceGray', components: nums(ops.args, 1) }; break;
                case 'rg':  gstate.fillColor   = { space: 'DeviceRGB',  components: nums(ops.args, 3) }; break;
                case 'RG':  gstate.strokeColor = { space: 'DeviceRGB',  components: nums(ops.args, 3) }; break;
                case 'k':   gstate.fillColor   = { space: 'DeviceCMYK', components: nums(ops.args, 4) }; break;
                case 'K':   gstate.strokeColor = { space: 'DeviceCMYK', components: nums(ops.args, 4) }; break;
                case 'cs':  gstate.fillColor   = { space: nameArg(ops.args, 0), components: deviceDefault(nameArg(ops.args, 0)) }; break;
                case 'CS':  gstate.strokeColor = { space: nameArg(ops.args, 0), components: deviceDefault(nameArg(ops.args, 0)) }; break;
                case 'sc':  gstate.fillColor.components   = numArgs(ops.args); break;
                case 'SC':  gstate.strokeColor.components = numArgs(ops.args); break;
                case 'scn': applyScn(gstate, 'fillColor', ops.args); break;
                case 'SCN': applyScn(gstate, 'strokeColor', ops.args); break;
                default:
                    throw new ContractError('pdf/color/unknown-op',
                        `applyColorOp called with non-color op "${ops.op}"`);
            }
        }

        return { applyColorOp };
    }
};
