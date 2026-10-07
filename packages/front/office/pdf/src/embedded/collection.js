// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Collection (PDF Portfolio) typing per ISO 32000-2:2020
 * §7.11.6.
 *
 * A Collection dict (`/Type /Collection`) lives on the Catalog and
 * describes how to display the embedded files attached to a "PDF
 * Portfolio". Entries:
 *   /Schema    — dict of collection field definitions.
 *   /D         — name of the embedded file shown initially.
 *   /View      — display mode (D/T/H — Details, Tile, Hidden, custom).
 *   /Sort      — sort dictionary.
 *   /Navigator — navigator extension dict.
 *
 * @module pdf/embedded/collection
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfCollection = {
    name: 'pdfCollection',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const KNOWN = new Set(['Type', 'Schema', 'D', 'View', 'Sort', 'Navigator', 'Folders', 'Colors', 'Split']);
        const VIEW_MODES = new Set(['D', 'T', 'H', 'C']);

        function typeCollection(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/collection/not-dict',
                    'Collection must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Collection')) {
                throw new ParseError('pdf/collection/bad-type',
                    '/Type must be /Collection',
                    { context: { actual: e.Type.value } });
            }
            const out = { raw: dict, _extras: {} };

            if (e.Schema) {
                if (e.Schema.type !== 'dict') {
                    throw new ParseError('pdf/collection/bad-schema',
                        '/Schema must be a dictionary',
                        { context: { type: e.Schema.type } });
                }
                out.schema = e.Schema;
            }
            if (e.D) {
                if (e.D.type !== 'string') {
                    throw new ParseError('pdf/collection/bad-d',
                        '/D must be a string',
                        { context: { type: e.D.type } });
                }
                out.initialDoc = e.D.value;
            }
            if (e.View) {
                if (e.View.type !== 'name' || !VIEW_MODES.has(e.View.value)) {
                    throw new ParseError('pdf/collection/bad-view',
                        '/View must be one of D, T, H, C',
                        { context: { actual: e.View.value } });
                }
                out.view = e.View.value;
            }
            if (e.Sort) {
                if (e.Sort.type !== 'dict') {
                    throw new ParseError('pdf/collection/bad-sort',
                        '/Sort must be a dictionary',
                        { context: { type: e.Sort.type } });
                }
                out.sort = e.Sort;
            }
            if (e.Navigator) {
                if (e.Navigator.type !== 'dict' && e.Navigator.type !== 'ref') {
                    throw new ParseError('pdf/collection/bad-navigator',
                        '/Navigator must be a dict or ref',
                        { context: { type: e.Navigator.type } });
                }
                out.navigator = e.Navigator;
            }

            for (const k of Object.keys(e)) {
                if (!KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        return { typeCollection };
    }
};
