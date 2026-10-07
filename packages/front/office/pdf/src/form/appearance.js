// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Appearance-stream dict typing per ISO 32000-2:2020 §12.5.5.
 *
 * @module pdf/form/appearance
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAppearance = {
    name: 'pdfAppearance',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parserMod) {
        const { ParseError } = errors;
        const isType = (parserMod && parserMod.isType)
            || ((v, kind) => !!(v && v.type === kind));

        const SLOTS = ['N', 'R', 'D'];

        function normalise(v, slot) {
            if (!v) {
                return { default: null, states: {} };
            }
            if (v.type === 'ref' || v.type === 'stream') {
                return { default: v, states: {} };
            }
            if (v.type === 'dict') {
                const states = {};
                for (const k of Object.keys(v.entries)) {
                    const sub = v.entries[k];
                    if (!sub || (sub.type !== 'ref' && sub.type !== 'stream')) {
                        throw new ParseError('pdf/form/ap/bad-state',
                            'appearance-state entry must be a stream or indirect ref',
                            { context: { slot, state: k, kind: sub && sub.type } });
                    }
                    states[k] = sub;
                }
                return { default: null, states };
            }
            throw new ParseError('pdf/form/ap/bad-slot',
                '/AP slot must be a stream, indirect ref, or sub-dict',
                { context: { slot, kind: v.type } });
        }

        function typeAppearanceStreams(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/form/ap/not-dict',
                    '/AP must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;

            const out = {
                N: normalise(e.N, 'N'),
                R: e.R ? normalise(e.R, 'R') : null,
                D: e.D ? normalise(e.D, 'D') : null,
                raw: dict,
                _extras: {}
            };

            if (!e.N) {
                throw new ParseError('pdf/form/ap/missing-n',
                    '/AP is missing required /N entry',
                    { context: {} });
            }

            for (const k of Object.keys(e)) {
                if (k !== 'N' && k !== 'R' && k !== 'D') out._extras[k] = e[k];
            }
            return out;
        }

        function listPopulatedSlots(ap) {
            const out = [];
            for (const s of SLOTS) if (ap[s]) out.push(s);
            return out;
        }

        return { typeAppearanceStreams, listPopulatedSlots };
    }
};
