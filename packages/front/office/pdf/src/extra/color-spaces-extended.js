// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed PDF color spaces per ISO 32000-2:2020 §8.6.
 *
 * Covers: CalGray (§8.6.5.2), CalRGB (§8.6.5.3), Lab (§8.6.5.4),
 * ICCBased (§8.6.5.5, with Metadata), Indexed (§8.6.6.3),
 * Separation (§8.6.6.4), DeviceN (§8.6.6.5) with /Attributes,
 * NChannel (DeviceN subtype, /Process), Pattern (§8.7).
 *
 * Color spaces in PDF are typically arrays where the first element is
 * the family name. We type the array form and the named device families.
 *
 * @module pdf/extra/color-spaces-extended
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfColorSpacesExtended = {
    name: 'pdfColorSpacesExtended',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError } = errors;
        const { isType } = parserObj;

        const COLOR_SPACE_FAMILIES = new Set([
            'CalGray', 'CalRGB', 'Lab', 'ICCBased', 'Indexed',
            'Separation', 'DeviceN', 'NChannel', 'Pattern',
            'DeviceGray', 'DeviceRGB', 'DeviceCMYK'
        ]);

        function typeColorSpace(value) {
            if (isType(value, 'name')) {
                if (!COLOR_SPACE_FAMILIES.has(value.value)) {
                    return { family: 'NamedResource', name: value.value, raw: value };
                }
                return { family: value.value, raw: value };
            }
            if (!isType(value, 'array') || value.items.length < 1) {
                throw new ParseError('pdf/extra/colorspace/bad-shape',
                    'color space must be name or non-empty array',
                    { context: { type: value && value.type } });
            }
            const head = value.items[0];
            if (!isType(head, 'name')) {
                throw new ParseError('pdf/extra/colorspace/bad-family',
                    'color space array must start with a name');
            }
            const family = head.value;
            if (!COLOR_SPACE_FAMILIES.has(family)) {
                throw new ParseError('pdf/extra/colorspace/unknown',
                    'unknown color-space family',
                    { context: { family } });
            }
            switch (family) {
                case 'CalGray':    return { family, ...readCalGray(value), raw: value };
                case 'CalRGB':     return { family, ...readCalRGB(value), raw: value };
                case 'Lab':        return { family, ...readLab(value), raw: value };
                case 'ICCBased':   return { family, ...readICCBased(value), raw: value };
                case 'Indexed':    return { family, ...readIndexed(value), raw: value };
                case 'Separation': return { family, ...readSeparation(value), raw: value };
                case 'DeviceN':    return { family, ...readDeviceN(value), raw: value };
                case 'NChannel':   return { family, ...readDeviceN(value), nChannel: true, raw: value };
                case 'Pattern':    return { family, ...readPattern(value), raw: value };
                default:           return { family, raw: value };
            }
        }

        function readCalDict(d) {
            if (!isType(d, 'dict')) {
                throw new ParseError('pdf/extra/colorspace/cal-no-dict',
                    'Cal* parameters dict missing');
            }
            return {
                whitePoint: numArr(d.entries.WhitePoint, 3),
                blackPoint: numArr(d.entries.BlackPoint, 3),
                gamma:      d.entries.Gamma   || null,
                matrix:     numArr(d.entries.Matrix, 9)
            };
        }

        function readCalGray(arr) {
            if (arr.items.length < 2) {
                throw new ParseError('pdf/extra/colorspace/cal-truncated', 'CalGray needs dict');
            }
            return { params: readCalDict(arr.items[1]) };
        }

        function readCalRGB(arr) {
            if (arr.items.length < 2) {
                throw new ParseError('pdf/extra/colorspace/cal-truncated', 'CalRGB needs dict');
            }
            return { params: readCalDict(arr.items[1]) };
        }

        function readLab(arr) {
            if (arr.items.length < 2 || !isType(arr.items[1], 'dict')) {
                throw new ParseError('pdf/extra/colorspace/lab-truncated', 'Lab needs dict');
            }
            const d = arr.items[1].entries;
            return {
                whitePoint: numArr(d.WhitePoint, 3),
                blackPoint: numArr(d.BlackPoint, 3),
                range:      numArr(d.Range, 4)
            };
        }

        function readICCBased(arr) {
            if (arr.items.length < 2 || !isType(arr.items[1], 'stream')) {
                throw new ParseError('pdf/extra/colorspace/icc-no-stream',
                    'ICCBased needs a stream');
            }
            const s = arr.items[1];
            const e = s.dict.entries;
            return {
                n:        (e.N && (e.N.type === 'int' || e.N.type === 'real')) ? (e.N.value | 0) : null,
                alt:      e.Alternate || null,
                range:    numArr(e.Range, null),
                metadata: e.Metadata  || null,
                profile:  s
            };
        }

        function readIndexed(arr) {
            if (arr.items.length < 4) {
                throw new ParseError('pdf/extra/colorspace/indexed-truncated',
                    'Indexed needs [base hival lookup]');
            }
            const hival = arr.items[2];
            if (!hival || (hival.type !== 'int' && hival.type !== 'real')) {
                throw new ParseError('pdf/extra/colorspace/indexed-bad-hival',
                    'Indexed hival must be numeric');
            }
            return {
                base:    arr.items[1],
                hival:   hival.value | 0,
                lookup:  arr.items[3]
            };
        }

        function readSeparation(arr) {
            if (arr.items.length < 4) {
                throw new ParseError('pdf/extra/colorspace/sep-truncated',
                    'Separation needs [name alternate tintTransform]');
            }
            return {
                colorant:      isType(arr.items[1], 'name') ? arr.items[1].value : null,
                alternate:     arr.items[2],
                tintTransform: arr.items[3]
            };
        }

        function readDeviceN(arr) {
            if (arr.items.length < 4) {
                throw new ParseError('pdf/extra/colorspace/devn-truncated',
                    'DeviceN needs [names alternate tintTransform attributes?]');
            }
            let names = null;
            if (isType(arr.items[1], 'array')) {
                names = arr.items[1].items.map(it => isType(it, 'name') ? it.value : null);
            }
            return {
                names,
                alternate:     arr.items[2],
                tintTransform: arr.items[3],
                attributes:    arr.items[4] || null
            };
        }

        function readPattern(arr) {
            return { base: arr.items[1] || null };
        }

        function numArr(v, expectedLen) {
            if (!isType(v, 'array')) return null;
            const out = [];
            for (const it of v.items) {
                if (!it || (it.type !== 'int' && it.type !== 'real')) return null;
                out.push(it.value);
            }
            if (expectedLen != null && out.length !== expectedLen) return null;
            return out;
        }

        return { typeColorSpace, COLOR_SPACE_FAMILIES };
    }
};

