// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Named action per ISO 32000-2:2020 §12.6.4.11.
 *
 * `/S /Named` actions carry a `/N` name. The standard predefined names
 * are NextPage, PrevPage, FirstPage, LastPage; vendor-defined names are
 * accepted but flagged via `standard: false`.
 *
 * @module pdf/action/named
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfActionNamed = {
    name: 'pdfActionNamed',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const STANDARD = new Set(['NextPage', 'PrevPage', 'FirstPage', 'LastPage']);

        function typeNamed(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/action/named/not-dict',
                    'Named action must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!e.N || e.N.type !== 'name') {
                throw new ParseError('pdf/action/named/missing-n',
                    'Named action missing /N name',
                    { context: { type: e.N && e.N.type } });
            }
            return {
                kind: 'Named',
                name: e.N.value,
                standard: STANDARD.has(e.N.value),
                raw: dict
            };
        }

        return { typeNamed };
    }
};
