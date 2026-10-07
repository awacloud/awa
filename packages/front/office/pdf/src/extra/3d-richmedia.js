// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: 3D and RichMedia annotation typing.
 *
 * ISO 32000-2:2020 §13.6 defines two interactive multimedia annotation
 * subtypes:
 *
 *   - `/Subtype /3D` (§13.6.2)  — references a 3D stream via `/3DD`,
 *      default view (`/3DV`), activation dict (`/3DA`), interactive
 *      dict (`/3DI`).
 *
 *   - `/Subtype /RichMedia` (§13.6.3) — `/RichMediaContent` with
 *      `/Assets`, `/Configurations`, `/Views`; `/RichMediaSettings`
 *      with `/Activation`, `/Deactivation`, instance state.
 *
 * @module pdf/extra/3d-richmedia
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdf3dRichMedia = {
    name: 'pdf3dRichMedia',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const THREE_D_KNOWN = new Set([
            'Type', 'Subtype', 'Rect', '3DD', '3DV', '3DA', '3DI', '3DB'
        ]);
        const RM_KNOWN = new Set([
            'Type', 'Subtype', 'Rect', 'RichMediaContent', 'RichMediaSettings'
        ]);

        const RM_INSTANCE_STATES = Object.freeze({
            A: 'active',
            L: 'loaded',
            U: 'uninstantiated'
        });

        const ACTIVATION_CONDITIONS = Object.freeze({
            XA: 'explicit activate',
            PO: 'page open',
            PV: 'page visible'
        });

        function type3DAnnot(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/3d/not-dict',
                    '3D annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Subtype && (e.Subtype.type !== 'name' || e.Subtype.value !== '3D')) {
                throw new ParseError('pdf/extra/3d/bad-subtype',
                    '/Subtype must be /3D',
                    { context: { actual: e.Subtype.value } });
            }
            if (!e['3DD']) {
                throw new ParseError('pdf/extra/3d/missing-3dd',
                    '3D annotation requires /3DD entry');
            }
            const out = {
                threeDD: e['3DD'],
                threeDV: e['3DV'] || null,
                threeDA: isType(e['3DA'], 'dict') ? type3DActivation(e['3DA']) : null,
                threeDI: isType(e['3DI'], 'bool') ? e['3DI'].value : null,
                threeDB: e['3DB'] || null,
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!THREE_D_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function type3DActivation(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/3d/act/not-dict',
                    '/3DA must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            return {
                a:    isType(e.A,   'name') ? e.A.value   : null,
                ais:  isType(e.AIS, 'name') ? e.AIS.value : null,
                d:    isType(e.D,   'name') ? e.D.value   : null,
                dis:  isType(e.DIS, 'name') ? e.DIS.value : null,
                tb:   isType(e.TB, 'bool')  ? e.TB.value  : null,
                np:   isType(e.NP, 'bool')  ? e.NP.value  : null,
                raw:  dict
            };
        }

        function typeRichMediaAnnot(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/rm/not-dict',
                    'RichMedia annotation must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Subtype && (e.Subtype.type !== 'name' || e.Subtype.value !== 'RichMedia')) {
                throw new ParseError('pdf/extra/rm/bad-subtype',
                    '/Subtype must be /RichMedia',
                    { context: { actual: e.Subtype.value } });
            }
            if (!e.RichMediaContent) {
                throw new ParseError('pdf/extra/rm/missing-content',
                    'RichMedia annotation requires /RichMediaContent');
            }
            const out = {
                content:  isType(e.RichMediaContent, 'dict')
                    ? typeRichMediaContent(e.RichMediaContent) : e.RichMediaContent,
                settings: isType(e.RichMediaSettings, 'dict')
                    ? e.RichMediaSettings : null,
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!RM_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeRichMediaContent(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/rm/content/not-dict',
                    '/RichMediaContent must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            return {
                assets:         e.Assets         || null,
                configurations: e.Configurations || null,
                views:          e.Views          || null,
                raw: dict
            };
        }

        function classifyRmInstanceState(name) {
            if (name == null) return null;
            if (typeof name !== 'string') {
                throw new ParseError('pdf/extra/rm/state/bad',
                    'state must be a string',
                    { context: { type: typeof name } });
            }
            return RM_INSTANCE_STATES[name] || null;
        }

        return {
            type3DAnnot,
            type3DActivation,
            typeRichMediaAnnot,
            typeRichMediaContent,
            classifyRmInstanceState,
            RM_INSTANCE_STATES,
            ACTIVATION_CONDITIONS
        };
    }
};

