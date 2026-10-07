// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: color-font detection per ISO 32000-2:2020
 * §9.8.2 (FontDescriptor `/Flags`) plus the OpenType color tables
 * COLR/sbix/SVG via /FontFile3 streams with `/Subtype /OpenType`.
 *
 * Color-font detection is heuristic — the PDF FontDescriptor does NOT
 * carry a single "is-color-font" flag. We expose:
 *  - `decodeFontDescriptorFlags(int)`     → typed flag record
 *  - `detectColorFontTables(stream)`      → which color-OT tables are
 *    present in an embedded OpenType font program by sfnt-table scan
 *  - `typeFontFile3OpenType(stream)`      → typed wrapper around a
 *    `/FontFile3` stream whose `/Subtype` is `/OpenType`
 *
 * @module pdf/extra/font-color-tagging
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfFontColorTagging = {
    name: 'pdfFontColorTagging',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const FONT_DESCRIPTOR_FLAGS = Object.freeze({
            FixedPitch:   1 << 0,
            Serif:        1 << 1,
            Symbolic:     1 << 2,
            Script:       1 << 3,
            Nonsymbolic:  1 << 5,
            Italic:       1 << 6,
            AllCap:       1 << 16,
            SmallCap:     1 << 17,
            ForceBold:    1 << 18
        });

        const COLOR_OT_TABLES = Object.freeze(['COLR', 'CPAL', 'sbix', 'SVG ', 'CBDT', 'CBLC']);

        function decodeFontDescriptorFlags(flags) {
            if (typeof flags !== 'number' || !Number.isFinite(flags)) {
                throw new ParseError('pdf/extra/font-flags/bad-input',
                    'flags must be a finite number',
                    { context: { flags } });
            }
            const f = flags | 0;
            const out = { raw: f };
            for (const [k, mask] of Object.entries(FONT_DESCRIPTOR_FLAGS)) {
                out[k.charAt(0).toLowerCase() + k.slice(1)] = (f & mask) !== 0;
            }
            return out;
        }

        function detectColorFontTables(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new ParseError('pdf/extra/color-font/bad-input',
                    'expected Uint8Array', { context: { kind: typeof bytes } });
            }
            if (bytes.length < 12) {
                throw new ParseError('pdf/extra/color-font/truncated',
                    'sfnt header too short', { context: { length: bytes.length } });
            }
            const numTables = (bytes[4] << 8) | bytes[5];
            const need = 12 + numTables * 16;
            if (bytes.length < need) {
                throw new ParseError('pdf/extra/color-font/truncated',
                    'sfnt table directory truncated',
                    { context: { numTables, length: bytes.length } });
            }
            const tables = [];
            for (let i = 0; i < numTables; i++) {
                const off = 12 + i * 16;
                const tag = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
                tables.push(tag);
            }
            return {
                hasCOLR: tables.includes('COLR'),
                hasSbix: tables.includes('sbix'),
                hasSVG:  tables.includes('SVG '),
                hasCBDT: tables.includes('CBDT'),
                tables
            };
        }

        function typeFontFile3OpenType(stream) {
            if (!isType(stream, 'stream')) {
                throw new ParseError('pdf/extra/fontfile3/not-stream',
                    '/FontFile3 must be a stream',
                    { context: { type: stream && stream.type } });
            }
            const dict = stream.dict;
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/fontfile3/no-dict',
                    '/FontFile3 stream missing dict');
            }
            const e = dict.entries;
            if (!isType(e.Subtype, 'name') || e.Subtype.value !== 'OpenType') {
                throw new ParseError('pdf/extra/fontfile3/bad-subtype',
                    '/FontFile3 /Subtype must be /OpenType',
                    { context: { actual: e.Subtype && e.Subtype.value } });
            }
            let color = null;
            if (stream.raw instanceof Uint8Array && stream.raw.length >= 12) {
                try { color = detectColorFontTables(stream.raw); }
                catch (_e) { color = null; }
            }
            return {
                subtype:  'OpenType',
                length:   stream.raw instanceof Uint8Array ? stream.raw.length : null,
                metadata: e.Metadata || null,
                color,
                raw:      stream,
                _extras:  collectExtras(e, new Set(['Subtype', 'Length', 'Filter', 'DecodeParms', 'Metadata']))
            };
        }

        function collectExtras(entries, known) {
            const out = {};
            for (const k of Object.keys(entries)) {
                if (!known.has(k)) out[k] = entries[k];
            }
            return out;
        }

        return {
            decodeFontDescriptorFlags,
            detectColorFontTables,
            typeFontFile3OpenType,
            FONT_DESCRIPTOR_FLAGS,
            COLOR_OT_TABLES
        };
    }
};

