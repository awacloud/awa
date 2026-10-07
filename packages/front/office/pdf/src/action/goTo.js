// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GoTo / GoToR / GoToE actions per ISO 32000-2:2020
 * §12.6.4.2, §12.6.4.3, §12.6.4.4.
 *
 * GoTo  — navigate to a destination in the current document.
 * GoToR — navigate to a destination in a remote document (`/F` + `/D`).
 * GoToE — navigate to a destination in an embedded document.
 *
 * These typers read the raw entries; resolution of `/F` (file
 * specification) and `/D` (destination) is left to the caller via
 * dedicated modules (`fileSpec`, `destination`).
 *
 * @module pdf/action/goTo
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfActionGoTo = {
    name: 'pdfActionGoTo',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        function expectDict(d, kind) {
            if (!isType(d, 'dict')) {
                throw new ParseError('pdf/action/' + kind.toLowerCase() + '/not-dict',
                    kind + ' action must be a dictionary',
                    { context: { type: d && d.type } });
            }
        }

        function typeGoTo(dict) {
            expectDict(dict, 'GoTo');
            const e = dict.entries;
            if (!e.D) {
                throw new ParseError('pdf/action/goto/missing-d',
                    'GoTo action is missing /D');
            }
            return { kind: 'GoTo', dest: e.D, raw: dict };
        }

        function typeGoToR(dict) {
            expectDict(dict, 'GoToR');
            const e = dict.entries;
            if (!e.F) {
                throw new ParseError('pdf/action/gotor/missing-f',
                    'GoToR action is missing /F');
            }
            if (!e.D) {
                throw new ParseError('pdf/action/gotor/missing-d',
                    'GoToR action is missing /D');
            }
            const out = { kind: 'GoToR', file: e.F, dest: e.D, raw: dict };
            if (e.NewWindow && e.NewWindow.type === 'bool') {
                out.newWindow = e.NewWindow.value;
            }
            return out;
        }

        function typeGoToE(dict) {
            expectDict(dict, 'GoToE');
            const e = dict.entries;
            if (!e.D) {
                throw new ParseError('pdf/action/gotoe/missing-d',
                    'GoToE action is missing /D');
            }
            const out = { kind: 'GoToE', dest: e.D, raw: dict };
            if (e.F) out.file = e.F;
            if (e.T) out.target = e.T;
            if (e.NewWindow && e.NewWindow.type === 'bool') {
                out.newWindow = e.NewWindow.value;
            }
            return out;
        }

        return { typeGoTo, typeGoToR, typeGoToE };
    }
};
