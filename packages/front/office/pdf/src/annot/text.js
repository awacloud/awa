// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Text (sticky-note) annotation per ISO 32000-2:2020 §12.5.6.4.
 *
 * Subtype-specific entries:
 *   /Open       boolean — pop-up window initial state
 *   /Name       name    — icon name (e.g. Note, Comment, Help)
 *   /State      string  — annotation state (e.g. Marked, Unmarked)
 *   /StateModel string  — model the state belongs to
 *
 * @module pdf/annot/text
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfTextAnnot = {
    name: 'pdfTextAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['Open', 'Name', 'State', 'StateModel']);

        function typeTextAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Text') {
                throw new ParseError('pdf/annot/text/bad-subtype',
                    '/Subtype must be /Text',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.open       = isType(e.Open, 'bool') ? !!e.Open.value : false;
            base.iconName   = isType(e.Name, 'name') ? e.Name.value : null;
            base.state      = isType(e.State, 'string') ? e.State.value : null;
            base.stateModel = isType(e.StateModel, 'string') ? e.StateModel.value : null;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typeTextAnnot };
    }
};
