// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Page boundary helpers per ISO 32000-2:2020 §14.11.2.
 *
 * Each Page may declare four optional boundary rectangles —
 * `/CropBox`, `/TrimBox`, `/BleedBox`, `/ArtBox` — each defaulting to
 * `/MediaBox` (which is mandatory on every page) when absent. These
 * helpers resolve the effective rectangle following the spec's
 * inheritance rules:
 *   - MediaBox itself is inheritable from ancestor /Pages nodes (already
 *     handled at L2 by the page-typing layer; we expect callers to pass
 *     a Page record carrying its effective `/MediaBox`).
 *   - CropBox defaults to MediaBox; Trim/Bleed/ArtBox default to
 *     CropBox.
 *
 * The input is the *typed* page record returned by the page typer,
 * carrying `{ mediaBox, cropBox?, trimBox?, bleedBox?, artBox? }` —
 * each a `[llx, lly, urx, ury]` array of numbers. To stay loosely
 * coupled we also accept raw dict-shape objects with `entries.MediaBox`
 * etc.
 *
 * @module pdf/prepress/pageBoundary
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfPageBoundary = {
    name: 'pdfPageBoundary',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, _p) {
        const { ParseError } = errors;

        const KEYS = {
            mediaBox: 'MediaBox',
            cropBox:  'CropBox',
            trimBox:  'TrimBox',
            bleedBox: 'BleedBox',
            artBox:   'ArtBox'
        };

        function readBox(page, normKey) {
            if (!page) return undefined;
            if (page[normKey] !== undefined) return page[normKey];
            // Raw dict shape.
            const k = KEYS[normKey];
            const dict = page.entries ? page : page.raw;
            if (dict && dict.entries && dict.entries[k]) {
                const arr = dict.entries[k];
                if (arr.type !== 'array' || arr.items.length !== 4) {
                    throw new ParseError('pdf/page-boundary/bad-box',
                        '/' + k + ' must be a 4-element array',
                        { context: { key: k } });
                }
                return arr.items.map((x) => {
                    if (x.type !== 'int' && x.type !== 'real') {
                        throw new ParseError('pdf/page-boundary/bad-box-element',
                            '/' + k + ' elements must be numbers',
                            { context: { key: k, type: x.type } });
                    }
                    return x.value;
                });
            }
            return undefined;
        }

        function effectiveMediaBox(page) {
            const v = readBox(page, 'mediaBox');
            if (!v) {
                throw new ParseError('pdf/page-boundary/no-mediabox',
                    'page has no /MediaBox');
            }
            return v;
        }

        function effectiveCropBox(page) {
            return readBox(page, 'cropBox') || effectiveMediaBox(page);
        }

        function effectiveTrimBox(page) {
            return readBox(page, 'trimBox') || effectiveCropBox(page);
        }

        function effectiveBleedBox(page) {
            return readBox(page, 'bleedBox') || effectiveCropBox(page);
        }

        function effectiveArtBox(page) {
            return readBox(page, 'artBox') || effectiveCropBox(page);
        }

        return {
            effectiveMediaBox,
            effectiveCropBox,
            effectiveTrimBox,
            effectiveBleedBox,
            effectiveArtBox
        };
    }
};
