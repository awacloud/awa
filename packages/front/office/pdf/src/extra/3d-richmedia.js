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
 * and the 3D measurement dictionaries (`type3DMeasure`), views and scene
 * (`type3DScene`), and the RichMedia dictionaries (`typeRichMedia`).
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
        const { ParseError, ContractError } = errors;
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
                style: isType(e.Style, 'name') ? e.Style.value : null,
                window: isType(e.Window, 'dict') || isType(e.Window, 'ref') ? e.Window : null,
                transparent: isType(e.Transparent, 'bool') ? e.Transparent.value : null,
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
                ...(e.Type ? { type: isType(e.Type, 'name') ? e.Type.value : null } : {}),
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

        // The 3D measurement dictionaries: per /Subtype, the keys of that
        // measurement type (the Arlington PDF Model's lists), and how each
        // key's value is read.
        // Each list in one string: a key and the next one apart by a space.
        const keyList = (text) => Object.freeze(text.split(' '));
        const MEASURE_KEYS = Object.freeze({
            RD3: keyList('Type Subtype TRL AP A1 A2 N2 A3 A4 TP TX TY EL TS C V U P UT SC R S'),
            AD3: keyList('Type Subtype TRL AP A1 D1 N1 A2 D2 N2 TP TX TY TS C V P UT DR S'),
            PD3: keyList('Type Subtype TRL AP A1 D1 N1 A2 N2 TP TY TS C V U P UT S'),
            LD3: keyList('Type Subtype TRL AP A1 N1 A2 N2 TP TY TS C V U P UT S'),
            '3DC': keyList('Type Subtype TRL A1 N1 TP TB TS C UT S')
        });
        const MEASURE_TEXT = new Set(['TRL', 'N1', 'N2', 'U', 'UT']);
        const MEASURE_NUMBER = new Set(['EL', 'TS', 'V']);
        const MEASURE_BOOL = new Set(['SC', 'R', 'DR']);
        const MEASURE_DICT = new Set(['S']);

        function measureValue(k, v) {
            if (k === 'Type' || k === 'Subtype') return isType(v, 'name') ? v.value : null;
            if (MEASURE_TEXT.has(k)) return isType(v, 'string') ? v.value : null;
            if (MEASURE_NUMBER.has(k)) return isType(v, 'int') || isType(v, 'real') ? v.value : null;
            if (k === 'P') return isType(v, 'int') ? v.value : null;
            if (MEASURE_BOOL.has(k)) return isType(v, 'bool') ? v.value : null;
            if (MEASURE_DICT.has(k)) return isType(v, 'dict') || isType(v, 'ref') ? v : null;
            return isType(v, 'array') || isType(v, 'ref') ? v : null;
        }

        /**
         * Type a 3D measurement dictionary: one field per key of its
         * subtype's list (`MEASURE_KEYS`), named after the key in lower
         * case (`TRL` → `trl`, as `type3DActivation`), present only when the key is; the
         * other keys in `_extras`.
         */
        function type3DMeasure(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/3d/measure/not-dict',
                    'a 3D measurement must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const subtype = isType(e.Subtype, 'name') ? e.Subtype.value : null;
            const keys = subtype && Object.prototype.hasOwnProperty.call(MEASURE_KEYS, subtype) ? MEASURE_KEYS[subtype] : null;
            if (!keys) {
                throw new ParseError('pdf/extra/3d/measure/bad-subtype',
                    '/Subtype must be RD3, AD3, PD3, LD3 or 3DC',
                    { context: { actual: subtype } });
            }
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(e)) {
                if (keys.includes(k)) out[k.toLowerCase()] = measureValue(k, v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The 3D view and scene dictionaries: per kind of object, its keys
        // and their types (the Arlington PDF Model's), as `Key:type` pairs
        // apart by a space; a type of two, `a|b`, takes either.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(text.split(' ').map((p) => p.split(':'))));
        const SCENE_TYPES = Object.freeze({
            view: keyTypes('Type:name XN:text IN:text MS:name MA:array C2W:array U3DPath:array|text CO:number '
                + 'P:dict O:stream BG:dict RM:dict LS:dict SA:array NA:array NR:bool Snapshot:stream Params:array'),
            crossSection: keyTypes('Type:name C:array O:array PO:number PC:array IV:bool PV:bool IC:array ST:bool SC:bool'),
            node: keyTypes('Type:name N:text O:number V:bool M:array Instance:dict Data:stream|text RM:dict'),
            renderMode: keyTypes('Type:name Subtype:name AC:array FC:array|name O:number CV:number'),
            background: keyTypes('Type:name Subtype:name CS:name C:array EA:bool'),
            lightingScheme: keyTypes('Type:name Subtype:name'),
            units: keyTypes('TSm:number TSn:number TU:text USm:number USn:number UU:text DSm:number DSn:number DU:text'),
            stream: keyTypes('Type:name Subtype:name VA:array DV:dict|int|name|text Resources:dict OnInstantiate:stream '
                + 'AN:dict ColorSpace:array|name'),
            animationStyle: keyTypes('Type:name Subtype:name PC:int TM:number'),
            reference: keyTypes('Type:name 3DD:stream'),
            projection: keyTypes('Subtype:name CS:name F:number N:number FOV:number PS:name|number OS:number OB:name'),
            markup: keyTypes('Type:name Subtype:name 3DA:dict|text 3DV:dict MD5:text'),
            measureRef: keyTypes('Type:name Subtype:name M3DREF:dict')
        });
        // A stream's Table 5 keys: typeStreamEntries' part.
        const STREAM_KEYS = new Set(['Length', 'Filter', 'DecodeParms', 'F', 'FFilter', 'FDecodeParms', 'DL']);
        const SCENE_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(SCENE_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));
        const KEY_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            text: (v) => (isType(v, 'string') ? v.value : undefined),
            number: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') || isType(v, 'ref') ? v : undefined),
            dict: (v) => (isType(v, 'dict') || isType(v, 'ref') ? v : undefined),
            stream: (v) => (isType(v, 'stream') || isType(v, 'ref') ? v : undefined)
        });

        function keyValue(type, v) {
            for (const t of type.split('|')) {
                const r = KEY_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }

        /**
         * Type a 3D view or scene dictionary of the given kind (a key of
         * `SCENE_KEYS`: `view`, `crossSection`, `node`, `renderMode`,
         * `background`, `lightingScheme`, `units`, `stream`,
         * `animationStyle`, `reference`, `projection`, `markup` (a 3D markup's
         * external data), `measureRef` (a 3D measurement's)), or a stream (its dictionary
         * read, its Table 5 keys left to `typeStreamEntries`): one field
         * per key of its list, named after the key in lower case (`C2W` →
         * `c2w`, as `type3DMeasure`), present only when the key is; the
         * other keys in `_extras`.
         */
        function type3DScene(value, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(SCENE_TYPES, kind)) {
                throw new ContractError('pdf/extra/3d/scene/kind',
                    `kind must be one of ${Object.keys(SCENE_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            const streamed = isType(value, 'stream');
            const dict = streamed ? value.dict : value;
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/3d/scene/not-dict',
                    'a 3D view or scene dictionary must be a dictionary or a stream',
                    { context: { type: value && value.type } });
            }
            const types = SCENE_TYPES[kind];
            const out = { raw: value, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else if (!(streamed && STREAM_KEYS.has(k))) out._extras[k] = v;
            }
            return out;
        }

        // The RichMedia dictionaries: per kind of object, its ISO 32000-2
        // keys and their types (the Arlington PDF Model's), as A7b's.
        const RICH_MEDIA_TYPES = Object.freeze({
            activation: keyTypes('Type:name Condition:name Animation:dict View:dict Configuration:dict Presentation:dict Scripts:array'),
            animation: keyTypes('Type:name Subtype:name PlayCount:int Speed:number'),
            command: keyTypes('Type:name C:text A:array|bool|int|number|text'),
            configuration: keyTypes('Type:name Subtype:name Name:text Instances:array'),
            deactivation: keyTypes('Type:name Condition:name'),
            height: keyTypes('Default:int Max:int Min:int'),
            instance: keyTypes('Type:name Subtype:name Asset:dict'),
            position: keyTypes('Type:name HAlign:name VAlign:name HOffset:number VOffset:number'),
            presentation: keyTypes('Type:name Style:name Window:dict Transparent:bool NavigationPane:bool Toolbar:bool PassContextClick:bool'),
            settings: keyTypes('Type:name Activation:dict Deactivation:dict'),
            width: keyTypes('Default:int Max:int Min:int'),
            window: keyTypes('Type:name Width:dict Height:dict Position:dict')
        });
        const RICH_MEDIA_KEYS = Object.freeze(Object.fromEntries(
            Object.entries(RICH_MEDIA_TYPES).map(([kind, types]) => [kind, Object.freeze(Object.keys(types))])));

        /**
         * Type a RichMedia dictionary of the given kind (a key of
         * `RICH_MEDIA_KEYS`): one field per key of its list, named after
         * the key in lower case (`PlayCount` → `playcount`), present only
         * when the key is; the other keys in `_extras`.
         */
        function typeRichMedia(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(RICH_MEDIA_TYPES, kind)) {
                throw new ContractError('pdf/extra/rm/dict/kind',
                    `kind must be one of ${Object.keys(RICH_MEDIA_TYPES).join(', ')}`,
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/rm/dict/not-dict',
                    'a RichMedia dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const types = RICH_MEDIA_TYPES[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(types, k)) out[k.toLowerCase()] = keyValue(types[k], v);
                else out._extras[k] = v;
            }
            return out;
        }

        return {
            type3DAnnot,
            type3DActivation,
            type3DMeasure,
            MEASURE_KEYS,
            type3DScene,
            SCENE_KEYS,
            typeRichMedia,
            RICH_MEDIA_KEYS,
            typeRichMediaAnnot,
            typeRichMediaContent,
            classifyRmInstanceState,
            RM_INSTANCE_STATES,
            ACTIVATION_CONDITIONS
        };
    }
};

