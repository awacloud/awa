// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Popup annotation per ISO 32000-2:2020 §12.5.6.14.
 *
 * Popups are subordinate displays for markup annotations.
 *
 * Subtype-specific entries:
 *   /Parent  ref     — annotation this popup is associated with
 *   /Open    boolean — initial open state
 *
 * @module pdf/annot/popup
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfAnnot } from './annot.js';

export const pdfPopupAnnot = {
    name: 'pdfPopupAnnot',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfAnnot'],
    deps: [pdfErrors, pdfParser, pdfAnnot],
    factory(errors, parser, annot) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { typeBaseAnnot, captureExtras } = annot;

        const KNOWN = new Set(['Parent', 'Open']);

        function typePopupAnnot(dict) {
            const base = typeBaseAnnot(dict);
            if (base.subtype && base.subtype !== 'Popup') {
                throw new ParseError('pdf/annot/popup/bad-subtype',
                    '/Subtype must be /Popup',
                    { context: { actual: base.subtype } });
            }
            const e = dict.entries;
            base.parent = e.Parent && e.Parent.type === 'ref'
                ? { num: e.Parent.num, gen: e.Parent.gen } : null;
            base.open   = isType(e.Open, 'bool') ? !!e.Open.value : false;
            captureExtras(base, dict, KNOWN);
            return base;
        }

        return { typePopupAnnot };
    }
};
