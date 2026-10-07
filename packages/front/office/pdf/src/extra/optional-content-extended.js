// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: Extended OCG/OCMD support.
 *
 * ISO 32000-2 §8.11.2.4 defines OCMD `/VE` (Visibility Expression) as a
 * nested array `[op, operand, ...]` with ops `And`, `Or`, `Not`. This
 * module evaluates such expressions, types `/Order` trees with embedded
 * sub-headings (string leaves), and surfaces RBGroups + `/Intent`
 * routing (View vs Design).
 *
 * @module pdf/extra/optional-content-extended
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfOptionalContentExtended = {
    name: 'pdfOptionalContentExtended',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const VE_OPERATORS = Object.freeze(['And', 'Or', 'Not']);

        function evaluateVE(ve, on) {
            if (!ve) {
                throw new ParseError('pdf/extra/ocgx/ve/null',
                    'VE expression is null');
            }
            if (!(on instanceof Set)) {
                throw new ParseError('pdf/extra/ocgx/ve/bad-state',
                    'evaluateVE requires a Set of on refs',
                    { context: { type: typeof on } });
            }
            if (ve.type === 'ref') {
                return on.has(ve.num + ' ' + ve.gen);
            }
            if (ve.type !== 'array' || ve.items.length === 0) {
                throw new ParseError('pdf/extra/ocgx/ve/bad-shape',
                    'VE must be an array starting with an operator',
                    { context: { type: ve.type } });
            }
            const op = ve.items[0];
            if (!isType(op, 'name') || !VE_OPERATORS.includes(op.value)) {
                throw new ParseError('pdf/extra/ocgx/ve/bad-op',
                    'VE operator must be /And, /Or or /Not',
                    { context: { actual: op && op.value } });
            }
            const operands = ve.items.slice(1);
            if (op.value === 'Not') {
                if (operands.length !== 1) {
                    throw new ParseError('pdf/extra/ocgx/ve/not-arity',
                        '/Not requires exactly one operand');
                }
                return !evaluateVE(operands[0], on);
            }
            if (op.value === 'And') return operands.every(o => evaluateVE(o, on));
            return operands.some(o => evaluateVE(o, on));
        }

        function typeOrderTree(arr) {
            if (!arr || arr.type !== 'array') {
                throw new ParseError('pdf/extra/ocgx/order/not-array',
                    '/Order must be an array',
                    { context: { type: arr && arr.type } });
            }
            const out = [];
            for (const it of arr.items) {
                if (!it) continue;
                if (it.type === 'string') {
                    out.push({ kind: 'heading', text: it.value });
                } else if (it.type === 'array') {
                    out.push({ kind: 'group', children: typeOrderTree(it) });
                } else if (it.type === 'ref') {
                    out.push({ kind: 'ocg', ref: { num: it.num, gen: it.gen } });
                } else {
                    out.push({ kind: 'other', value: it });
                }
            }
            return out;
        }

        function typeRBGroups(arr) {
            if (!arr || arr.type !== 'array') {
                throw new ParseError('pdf/extra/ocgx/rbg/not-array',
                    '/RBGroups must be an array',
                    { context: { type: arr && arr.type } });
            }
            const out = [];
            for (const grp of arr.items) {
                if (!grp || grp.type !== 'array') {
                    throw new ParseError('pdf/extra/ocgx/rbg/bad-group',
                        '/RBGroups entry must be an array',
                        { context: { type: grp && grp.type } });
                }
                const refs = [];
                for (const r of grp.items) {
                    if (!r || r.type !== 'ref') continue;
                    refs.push({ num: r.num, gen: r.gen });
                }
                out.push(refs);
            }
            return out;
        }

        function classifyOcgIntent(v) {
            if (!v) return { view: false, design: false, names: [] };
            const names = [];
            if (v.type === 'name') names.push(v.value);
            else if (v.type === 'array') {
                for (const it of v.items) if (isType(it, 'name')) names.push(it.value);
            } else {
                throw new ParseError('pdf/extra/ocgx/intent/bad',
                    '/Intent must be name or array of names',
                    { context: { type: v.type } });
            }
            return {
                view:   names.includes('View'),
                design: names.includes('Design'),
                names
            };
        }

        return {
            evaluateVE,
            typeOrderTree,
            typeRBGroups,
            classifyOcgIntent,
            VE_OPERATORS
        };
    }
};

