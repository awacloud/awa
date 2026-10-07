// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview URI action per ISO 32000-2:2020 §12.6.4.7.
 *
 * `/S /URI` actions navigate to a URI; `/IsMap` indicates that mouse
 * coordinates should be appended for image-map style links. The URI
 * value is preserved as a raw byte string — callers decide how to
 * decode it (typically PDFDocEncoding or UTF-8).
 *
 * @module pdf/action/uri
 */

/**
 * Module factory — worker-safe, self-contained.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfActionUri = {
    name: 'pdfActionUri',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors) {
        const { ParseError } = errors;
        // Self-contained isType: tolerates `parser = {}` from tests.
        function isType(node, kind) { return !!(node && node.type === kind); }

        function typeUri(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/action/uri/not-dict',
                    'URI action must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (!e.URI || e.URI.type !== 'string') {
                throw new ParseError('pdf/action/uri/missing',
                    'URI action missing /URI string',
                    { context: { type: e.URI && e.URI.type } });
            }
            const out = { kind: 'URI', uri: e.URI.value, raw: dict };
            if (e.IsMap && e.IsMap.type === 'bool') out.isMap = e.IsMap.value;
            return out;
        }

        return { typeUri };
    }
};
