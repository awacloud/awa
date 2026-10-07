// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Launch action per ISO 32000-2:2020 §12.6.4.6.
 *
 * `/S /Launch` actions request the PDF viewer to run an external
 * application or open a file. Executing such an action is a known
 * security risk; this typer **never executes anything** — it surfaces
 * the entries plus a `securityWarning` flag so the host application can
 * decide what to do (typically: ignore, or prompt the user).
 *
 * @module pdf/action/launch
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfActionLaunch = {
    name: 'pdfActionLaunch',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        function typeLaunch(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/action/launch/not-dict',
                    'Launch action must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = {
                kind: 'Launch',
                sandboxed: true,
                securityWarning: 'launch actions are not executed by @awacloud/pdf',
                raw: dict
            };
            if (e.F)   out.file = e.F;
            if (e.Win && e.Win.type === 'dict') out.win = e.Win;
            if (e.Mac && e.Mac.type === 'dict') out.mac = e.Mac;
            if (e.Unix && e.Unix.type === 'dict') out.unix = e.Unix;
            if (e.NewWindow && e.NewWindow.type === 'bool') {
                out.newWindow = e.NewWindow.value;
            }
            if (!out.file && !out.win && !out.mac && !out.unix) {
                throw new ParseError('pdf/action/launch/empty',
                    'Launch action has no /F, /Win, /Mac, or /Unix target');
            }
            return out;
        }

        return { typeLaunch };
    }
};
