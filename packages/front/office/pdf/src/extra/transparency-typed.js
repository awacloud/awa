// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: typed Transparency Group attributes (§11.6.6),
 * Soft Mask (§11.6.5.2 — Luminosity/Alpha) with `/TR` transfer, and the
 * frozen catalog of standard blend modes (§11.3.5) — ISO 32000-2:2020.
 *
 * @module pdf/extra/transparency-typed
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfTransparencyTyped = {
    name: 'pdfTransparencyTyped',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        /** 16 standard blend modes (§11.3.5 Table 136). */
        const BLEND_MODES = Object.freeze([
            'Normal', 'Compatible', 'Multiply', 'Screen', 'Overlay',
            'Darken', 'Lighten', 'ColorDodge', 'ColorBurn', 'HardLight',
            'SoftLight', 'Difference', 'Exclusion',
            'Hue', 'Saturation', 'Color', 'Luminosity'
        ]);

        const NUM = (v) => v && (v.type === 'int' || v.type === 'real');

        function typeTransparencyGroup(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/transparency-group/not-dict',
                    'Transparency Group must be a dict',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Group')) {
                throw new ParseError('pdf/extra/transparency-group/bad-type',
                    '/Type entry must be /Group',
                    { context: { actual: e.Type.value } });
            }
            if (!isType(e.S, 'name') || e.S.value !== 'Transparency') {
                throw new ParseError('pdf/extra/transparency-group/bad-s',
                    '/S must be /Transparency',
                    { context: { actual: e.S && e.S.value } });
            }
            const known = new Set(['Type', 'S', 'CS', 'I', 'K']);
            const out = {
                s:        'Transparency',
                cs:       e.CS || null,
                isolated: isType(e.I, 'bool') ? e.I.value : false,
                knockout: isType(e.K, 'bool') ? e.K.value : false,
                raw:      dict,
                _extras:  {}
            };
            for (const k of Object.keys(e)) if (!known.has(k)) out._extras[k] = e[k];
            return out;
        }

        function typeSoftMask(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/soft-mask/not-dict',
                    'Soft Mask must be a dict',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Mask')) {
                throw new ParseError('pdf/extra/soft-mask/bad-type',
                    '/Type entry must be /Mask',
                    { context: { actual: e.Type.value } });
            }
            if (!isType(e.S, 'name') || (e.S.value !== 'Alpha' && e.S.value !== 'Luminosity')) {
                throw new ParseError('pdf/extra/soft-mask/bad-s',
                    '/S must be /Alpha or /Luminosity',
                    { context: { actual: e.S && e.S.value } });
            }
            if (!e.G) {
                throw new ParseError('pdf/extra/soft-mask/missing-g',
                    'Soft Mask requires /G (transparency group XObject)');
            }
            const known = new Set(['Type', 'S', 'G', 'BC', 'TR']);
            const out = {
                kind:        e.S.value,
                g:           e.G,
                backdrop:    isType(e.BC, 'array') ? toNumArr(e.BC) : null,
                transfer:    e.TR || null,
                raw:         dict,
                _extras:     {}
            };
            for (const k of Object.keys(e)) if (!known.has(k)) out._extras[k] = e[k];
            return out;
        }

        function resolveBlendMode(value) {
            if (!value) return null;
            if (isType(value, 'name')) {
                return BLEND_MODES.includes(value.value) ? value.value : null;
            }
            if (isType(value, 'array')) {
                for (const it of value.items) {
                    if (isType(it, 'name') && BLEND_MODES.includes(it.value)) return it.value;
                }
                return null;
            }
            throw new ParseError('pdf/extra/blend-mode/bad-type',
                '/BM must be name or array of names',
                { context: { type: value.type } });
        }

        function toNumArr(v) {
            const out = [];
            for (const it of v.items) {
                if (!NUM(it)) return null;
                out.push(it.value);
            }
            return out;
        }

        return {
            typeTransparencyGroup,
            typeSoftMask,
            resolveBlendMode,
            BLEND_MODES
        };
    }
};

