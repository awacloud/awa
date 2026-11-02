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
 * routing (View vs Design). It also types the optional content
 * properties, the membership dictionaries and the usage sub-dictionaries
 * (`typeOptionalContent`).
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
        const { ParseError, ContractError } = errors;
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

        // The optional content dictionaries: per kind, the keys and their
        // types (the Arlington PDF Model's), as `Key:type` pairs.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const OPTIONAL_CONTENT_TYPES = Object.freeze({
            properties: keyTypes('OCGs:array D:dict Configs:array'),
            membership: keyTypes('Type:name OCGs:array|dict P:name VE:array'),
            creatorInfo: keyTypes('Creator:string Subtype:name'),
            language: keyTypes('Lang:string Preferred:name'),
            export: keyTypes('ExportState:name'),
            zoom: keyTypes('min:num max:num'),
            print: keyTypes('Subtype:name PrintState:name'),
            view: keyTypes('ViewState:name'),
            user: keyTypes('Type:name Name:array|string'),
            pageElement: keyTypes('Subtype:name')
        });
        const OPTIONAL_CONTENT_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(OPTIONAL_CONTENT_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
        const KEY_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined)
        });
        function keyValue(type, v) {
            if (isType(v, 'ref')) return v;
            for (const t of type.split('|')) {
                const r = KEY_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }

        /**
         * Type an optional content properties, membership or usage
         * sub-dictionary (`kind` a key of `OPTIONAL_CONTENT_KEYS`): one
         * field per key of its list, named after the key in lower case
         * (`OCGs` → `ocgs`), present only when the key is; the other keys in
         * `_extras`.
         */
        function typeOptionalContent(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(OPTIONAL_CONTENT_TYPES, kind)) {
                throw new ContractError('pdf/extra/oc/kind',
                    `kind must be one of ${Object.keys(OPTIONAL_CONTENT_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/oc/not-dict',
                    'an optional content dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = OPTIONAL_CONTENT_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        return {
            evaluateVE,
            typeOrderTree,
            typeRBGroups,
            classifyOcgIntent,
            typeOptionalContent,
            OPTIONAL_CONTENT_KEYS,
            VE_OPERATORS
        };
    }
};

