// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Optional Content Group (OCG) typing per ISO 32000-2:2020
 * §8.11.2.
 *
 * An OCG is a dictionary `/Type /OCG` referenced by content streams,
 * annotations and form XObjects whose visibility can be toggled at view
 * time. The L3 typing decodes `/Name`, `/Intent`, and the `/Usage`
 * sub-dictionary (CreatorInfo, Language, Export, Zoom, Print, View,
 * User, PageElement plus state convenience entries).
 *
 * Unknown entries are preserved in `_extras`.
 *
 * @module pdf/ocg/ocg
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfOCG = {
    name: 'pdfOCG',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN_TOP   = new Set(['Type', 'Name', 'Intent', 'Usage']);
        const KNOWN_USAGE = new Set([
            'CreatorInfo', 'Language', 'Export', 'Zoom', 'Print', 'View',
            'User', 'PageElement', 'ViewState', 'PrintState', 'ExportState'
        ]);

        function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

        function typeUsage(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/ocg/usage/not-dict',
                    'Usage must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = { raw: dict, _extras: {} };

            for (const k of KNOWN_USAGE) {
                if (e[k] !== undefined) {
                    const v = e[k];
                    if (k === 'PrintState' || k === 'ViewState' || k === 'ExportState') {
                        if (v.type !== 'name') {
                            throw new ParseError('pdf/ocg/usage/bad-state',
                                '/' + k + ' must be a name',
                                { context: { type: v.type } });
                        }
                        out[lower(k)] = v.value;
                    } else {
                        out[lower(k)] = v;
                    }
                }
            }
            for (const k of Object.keys(e)) {
                if (!KNOWN_USAGE.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeOCG(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/ocg/not-dict',
                    'OCG must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'OCG')) {
                throw new ParseError('pdf/ocg/bad-type',
                    '/Type entry must be /OCG',
                    { context: { actual: e.Type.value } });
            }
            if (!e.Name || e.Name.type !== 'string') {
                throw new ParseError('pdf/ocg/missing-name',
                    'OCG is missing required /Name string',
                    { context: { type: e.Name && e.Name.type } });
            }

            const out = {
                name: e.Name.value,
                raw: dict,
                _extras: {}
            };

            if (e.Intent) {
                if (e.Intent.type === 'name') {
                    out.intent = [e.Intent.value];
                } else if (e.Intent.type === 'array') {
                    out.intent = e.Intent.items
                        .filter((it) => it && it.type === 'name')
                        .map((it) => it.value);
                }
            }

            if (e.Usage) {
                if (e.Usage.type !== 'dict') {
                    throw new ParseError('pdf/ocg/bad-usage',
                        '/Usage must be a dictionary',
                        { context: { type: e.Usage.type } });
                }
                out.usage = typeUsage(e.Usage);
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN_TOP.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeOCG, typeUsage };
    }
};
