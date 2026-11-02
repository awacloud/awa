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
 *  - `typeFontDescriptor(dict)`           → typed font descriptor of any
 *    font kind (§9.8, Tables 120, 122 and 123), the `FD` values included
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
            const out = {
                subtype:  'OpenType',
                length:   stream.raw instanceof Uint8Array ? stream.raw.length : null,
                metadata: e.Metadata || null,
                color,
                raw:      stream,
                _extras:  collectExtras(e, new Set(['Subtype', 'Length', 'Filter', 'DecodeParms', 'Metadata',
                    'Length1', 'Length2', 'Length3']))
            };
            for (const [k, f] of LENGTH_KEYS) {
                if (e[k] !== undefined) out[f] = isType(e[k], 'int') ? e[k].value : null;
            }
            // The filters the bytes are encoded with (Table 5), only when
            // present: a name by its value, an array or a dictionary as read.
            if (isType(e.Filter, 'name')) out.filter = e.Filter.value;
            else if (isType(e.Filter, 'array')) out.filter = e.Filter;
            if (isType(e.DecodeParms, 'dict') || isType(e.DecodeParms, 'array')) {
                out.decodeParms = e.DecodeParms;
            }
            return out;
        }

        const LENGTH_KEYS = Object.freeze([['Length1', 'length1'], ['Length2', 'length2'], ['Length3', 'length3']]);

        /**
         * The companion of `typeStreamEntries` for a font file stream: its
         * own keys — `length1`, `length2`, `length3` (integers),
         * `subtype` (a name), `metadata` (a stream or reference as read) —
         * present only when the key is, `null` for a value of another
         * type; no `_extras` (the stream keys are `typeStreamEntries`').
         */
        function typeFontFileEntries(stream) {
            if (!isType(stream, 'stream') || !isType(stream.dict, 'dict')) {
                throw new ParseError('pdf/extra/fontfile/not-stream',
                    'a font file must be a stream',
                    { context: { type: stream && stream.type } });
            }
            const e = stream.dict.entries;
            const out = { raw: stream };
            for (const [k, f] of LENGTH_KEYS) {
                if (e[k] !== undefined) out[f] = isType(e[k], 'int') ? e[k].value : null;
            }
            if (e.Subtype !== undefined) out.subtype = isType(e.Subtype, 'name') ? e.Subtype.value : null;
            if (e.Metadata !== undefined) {
                out.metadata = isType(e.Metadata, 'stream') || isType(e.Metadata, 'ref') ? e.Metadata : null;
            }
            return out;
        }

        // Font descriptor entries (§9.8, Tables 120, 122 and 123).
        const DESCRIPTOR_KEYS = new Set([
            'Type', 'FontName', 'FontFamily', 'FontStretch', 'FontWeight', 'Flags',
            'FontBBox', 'ItalicAngle', 'Ascent', 'Descent', 'Leading', 'CapHeight',
            'XHeight', 'StemV', 'StemH', 'AvgWidth', 'MaxWidth', 'MissingWidth',
            'FontFile', 'FontFile2', 'FontFile3', 'CharSet', 'Style', 'Lang', 'FD', 'CIDSet'
        ]);

        function typeFontDescriptor(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/font-descriptor/not-dict',
                    'font descriptor must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const nameOf = (v) => (isType(v, 'name') ? v.value : null);
            const strOf = (v) => (isType(v, 'string') ? v.value : null);
            const intOf = (v) => (isType(v, 'int') ? v.value : null);
            const numOf = (v, dflt) => (isNum(v) ? v.value : dflt);
            const refOf = (v) => (isType(v, 'ref') ? { num: v.num, gen: v.gen } : null);
            // A font program or CIDSet must be indirect; a direct stream is kept as read.
            const streamOf = (v) => refOf(v) || (isType(v, 'stream') ? v : null);
            const dictOf = (v) => refOf(v) || (isType(v, 'dict') ? v : null);
            const box = isType(e.FontBBox, 'array') && e.FontBBox.items.length === 4
                && e.FontBBox.items.every(isNum) ? e.FontBBox.items.map((it) => it.value) : null;
            return {
                type:         nameOf(e.Type),
                fontName:     nameOf(e.FontName),
                fontFamily:   strOf(e.FontFamily),
                fontStretch:  nameOf(e.FontStretch),
                fontWeight:   intOf(e.FontWeight),
                flags:        intOf(e.Flags),
                fontBBox:     box,
                italicAngle:  numOf(e.ItalicAngle, null),
                ascent:       numOf(e.Ascent, null),
                descent:      numOf(e.Descent, null),
                leading:      numOf(e.Leading, 0),
                capHeight:    numOf(e.CapHeight, null),
                xHeight:      numOf(e.XHeight, 0),
                stemV:        numOf(e.StemV, null),
                stemH:        numOf(e.StemH, 0),
                avgWidth:     numOf(e.AvgWidth, 0),
                maxWidth:     numOf(e.MaxWidth, 0),
                missingWidth: numOf(e.MissingWidth, 0),
                fontFile:     streamOf(e.FontFile),
                fontFile2:    streamOf(e.FontFile2),
                fontFile3:    streamOf(e.FontFile3),
                charSet:      strOf(e.CharSet),
                style:        dictOf(e.Style),
                lang:         nameOf(e.Lang),
                fd:           dictOf(e.FD),
                cidSet:       streamOf(e.CIDSet),
                _extras:      collectExtras(e, DESCRIPTOR_KEYS)
            };
        }

        function isNum(v) {
            return !!v && (v.type === 'int' || v.type === 'real');
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
            typeFontFileEntries,
            typeFontDescriptor,
            FONT_DESCRIPTOR_FLAGS,
            COLOR_OT_TABLES
        };
    }
};

