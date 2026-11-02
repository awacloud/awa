// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended action subtypes per
 * ISO 32000-2:2020 §12.6.4 — GoTo3DView (§12.6.4.15),
 * SetOCGState (§12.6.4.12), Trans (§12.6.4.13), Rendition (§12.6.4.14),
 * Hide (§12.6.4.10), SubmitForm (§12.6.4.4), ResetForm (§12.6.4.5),
 * ImportData (§12.6.4.6), JavaScript (§12.6.4.7, sandboxed flag only);
 * Thread, Sound, Movie, RichMediaExecute, GoToDp and the PDF 1.2 SetState
 * and NOP (their keys typed as `Key:type` tables); the
 * additional-actions dictionaries (`typeAdditionalActions`); and, beside
 * the core field typers, the field dictionary's shared and rich-text keys
 * (`typeFieldEntries`).
 *
 * Each typer returns a typed record ; unknowns are preserved in
 * `_extras`. The orchestrator returns `{ kind, ...typed, raw, _extras }`.
 *
 * @module pdf/extra/form-actions-extended
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParserObj } from '../syntax/parser-obj.js';

export const pdfFormActionsExtended = {
    name: 'pdfFormActionsExtended',
    dependencies: ['pdfErrors', 'pdfParserObj'],
    deps: [pdfErrors, pdfParserObj],
    factory(errors, parserObj) {
        const { ParseError, ContractError } = errors;
        const { isType } = parserObj;

        // The subtypes typed from their tables: per /S, the keys and their
        // types (the Arlington PDF Model's), as `Key:type` pairs.
        const keyTypes = (text) => Object.freeze(Object.fromEntries(
            text ? text.split(' ').map((p) => p.split(':')) : []));
        const TABLE_TYPES = Object.freeze({
            Thread: keyTypes('F:dict|string D:dict|int|string B:dict|int'),
            Sound: keyTypes('Sound:stream Volume:num Synchronous:bool Repeat:bool Mix:bool'),
            Movie: keyTypes('Annotation:dict T:string Operation:name'),
            RichMediaExecute: keyTypes('TA:dict TI:dict CMD:dict'),
            GoToDp: keyTypes('Dp:dict'),
            SetState: keyTypes('T:array|dict AS:name'),
            NOP: keyTypes('')
        });
        const KEY_READ = Object.freeze({
            name: (v) => (isType(v, 'name') ? v.value : undefined),
            string: (v) => (isType(v, 'string') ? v.value : undefined),
            num: (v) => (isType(v, 'int') || isType(v, 'real') ? v.value : undefined),
            int: (v) => (isType(v, 'int') ? v.value : undefined),
            bool: (v) => (isType(v, 'bool') ? v.value : undefined),
            array: (v) => (isType(v, 'array') ? v : undefined),
            dict: (v) => (isType(v, 'dict') ? v : undefined),
            stream: (v) => (isType(v, 'stream') ? v : undefined)
        });
        // A key's value by the first of its types that fits; a reference
        // as read; null when none fits.
        function keyValue(type, v) {
            if (isType(v, 'ref')) return v;
            for (const t of type.split('|')) {
                const r = KEY_READ[t](v);
                if (r !== undefined) return r;
            }
            return null;
        }
        function readTable(s, e) {
            const out = {};
            for (const [k, type] of Object.entries(TABLE_TYPES[s])) {
                if (e[k] !== undefined) out[k.toLowerCase()] = keyValue(type, e[k]);
            }
            return out;
        }

        const EXTENDED_ACTION_SUBTYPES = new Set([
            'GoTo3DView', 'SetOCGState', 'Trans', 'Rendition', 'Hide',
            'SubmitForm', 'ResetForm', 'ImportData', 'JavaScript',
            ...Object.keys(TABLE_TYPES)
        ]);

        const KNOWN = {
            GoTo3DView:  new Set(['Type', 'S', 'Next', 'TA', 'V']),
            SetOCGState: new Set(['Type', 'S', 'Next', 'State', 'PreserveRB']),
            Trans:       new Set(['Type', 'S', 'Next', 'Trans']),
            Rendition:   new Set(['Type', 'S', 'Next', 'R', 'AN', 'OP', 'JS']),
            Hide:        new Set(['Type', 'S', 'Next', 'T', 'H']),
            SubmitForm:  new Set(['Type', 'S', 'Next', 'F', 'Fields', 'Flags', 'CharSet']),
            ResetForm:   new Set(['Type', 'S', 'Next', 'Fields', 'Flags']),
            ImportData:  new Set(['Type', 'S', 'Next', 'F']),
            JavaScript:  new Set(['Type', 'S', 'Next', 'JS']),
            ...Object.fromEntries(Object.entries(TABLE_TYPES).map(([s, types]) =>
                [s, new Set(['Type', 'S', 'Next', ...Object.keys(types)])]))
        };

        function knownFor(s) { return KNOWN[s] || new Set(['Type', 'S', 'Next']); }

        function typeExtendedAction(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/action-ext/not-dict',
                    'action must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Action')) {
                throw new ParseError('pdf/extra/action-ext/bad-type',
                    '/Type entry must be /Action',
                    { context: { actual: e.Type.value } });
            }
            if (!isType(e.S, 'name') || !EXTENDED_ACTION_SUBTYPES.has(e.S.value)) {
                throw new ParseError('pdf/extra/action-ext/unsupported',
                    'unsupported extended action subtype',
                    { context: { subtype: e.S && e.S.value } });
            }
            let rec;
            switch (e.S.value) {
                case 'GoTo3DView':  rec = readGoTo3DView(e); break;
                case 'SetOCGState': rec = readSetOCGState(e); break;
                case 'Trans':       rec = readTrans(e); break;
                case 'Rendition':   rec = readRendition(e); break;
                case 'Hide':        rec = readHide(e); break;
                case 'SubmitForm':  rec = readSubmitForm(e); break;
                case 'ResetForm':   rec = readResetForm(e); break;
                case 'ImportData':  rec = readImportData(e); break;
                case 'JavaScript':  rec = readJavaScript(e); break;
                default:            rec = readTable(e.S.value, e);
            }
            rec.kind = e.S.value;
            rec.raw = dict;
            rec._extras = collectExtras(e, knownFor(e.S.value));
            return rec;
        }

        function readGoTo3DView(e) {
            return { ta: e.TA || null, v:  e.V  || null };
        }

        function readSetOCGState(e) {
            if (!isType(e.State, 'array')) {
                throw new ParseError('pdf/extra/action-ext/bad-state',
                    '/State must be an array',
                    { context: { type: e.State && e.State.type } });
            }
            return {
                state:      e.State.items,
                preserveRB: isType(e.PreserveRB, 'bool') ? e.PreserveRB.value : true
            };
        }

        function readTrans(e) {
            if (!isType(e.Trans, 'dict')) {
                throw new ParseError('pdf/extra/action-ext/bad-trans',
                    '/Trans must be a dict',
                    { context: { type: e.Trans && e.Trans.type } });
            }
            return { trans: e.Trans };
        }

        function readRendition(e) {
            const op = (e.OP && (e.OP.type === 'int' || e.OP.type === 'real'))
                ? (e.OP.value | 0) : null;
            // a stream script reaches the typer as an indirect reference
            // (ISO 32000-2 7.3.8): kept for the caller to resolve
            const scriptObj = isType(e.JS, 'stream') || isType(e.JS, 'ref');
            const hasJs = isType(e.JS, 'string') || scriptObj;
            return {
                r:  e.R  || null,
                an: e.AN || null,
                op,
                js: isType(e.JS, 'string') ? e.JS.value : (scriptObj ? e.JS : null),
                sandboxed: hasJs ? true : undefined
            };
        }

        function readHide(e) {
            if (!e.T) {
                throw new ParseError('pdf/extra/action-ext/missing-t',
                    'Hide action requires /T');
            }
            let targets;
            if (isType(e.T, 'string') || e.T.type === 'ref') targets = [e.T];
            else if (isType(e.T, 'array')) targets = e.T.items;
            else {
                throw new ParseError('pdf/extra/action-ext/bad-t',
                    '/T must be string, ref, or array',
                    { context: { type: e.T.type } });
            }
            return { targets, h: isType(e.H, 'bool') ? e.H.value : true };
        }

        function readSubmitForm(e) {
            if (!e.F) {
                throw new ParseError('pdf/extra/action-ext/missing-f',
                    'SubmitForm requires /F (URL)');
            }
            return {
                url:     e.F,
                fields:  isType(e.Fields, 'array') ? e.Fields.items : null,
                flags:   (e.Flags && (e.Flags.type === 'int' || e.Flags.type === 'real'))
                            ? (e.Flags.value | 0) : 0,
                charSet: isType(e.CharSet, 'string') ? e.CharSet.value : null,
                sandboxed: true
            };
        }

        function readResetForm(e) {
            return {
                fields: isType(e.Fields, 'array') ? e.Fields.items : null,
                flags:  (e.Flags && (e.Flags.type === 'int' || e.Flags.type === 'real'))
                            ? (e.Flags.value | 0) : 0
            };
        }

        function readImportData(e) {
            if (!e.F) {
                throw new ParseError('pdf/extra/action-ext/missing-f',
                    'ImportData requires /F (file spec)');
            }
            return { file: e.F, sandboxed: true };
        }

        function readJavaScript(e) {
            if (!e.JS) {
                throw new ParseError('pdf/extra/action-ext/missing-js',
                    'JavaScript action requires /JS');
            }
            // a stream script reaches the typer as an indirect reference
            // (ISO 32000-2 7.3.8): kept for the caller to resolve
            if (!isType(e.JS, 'string') && !isType(e.JS, 'stream') && !isType(e.JS, 'ref')) {
                throw new ParseError('pdf/extra/action-ext/bad-js',
                    '/JS must be a string, a stream or a reference to a stream',
                    { context: { type: e.JS.type } });
            }
            return { js: e.JS, sandboxed: true };
        }

        function collectExtras(entries, known) {
            const out = {};
            for (const k of Object.keys(entries)) {
                if (!known.has(k)) out[k] = entries[k];
            }
            return out;
        }

        // The additional-actions dictionaries: per kind, the trigger keys.
        const TRIGGERS = Object.freeze({
            catalog: Object.freeze(['DC', 'WS', 'DS', 'WP', 'DP']),
            formField: Object.freeze(['K', 'F', 'V', 'C']),
            pageObject: Object.freeze(['O', 'C']),
            screenAnnotation: Object.freeze(['E', 'X', 'D', 'U', 'PO', 'PC', 'PV', 'PI']),
            widgetAnnotation: Object.freeze(['E', 'X', 'D', 'U', 'Fo', 'Bl', 'PO', 'PC', 'PV', 'PI'])
        });

        /**
         * Type an additional-actions dictionary (`/AA`) of the given kind
         * (a key of `ADDITIONAL_ACTION_TRIGGERS`): one field per trigger
         * key, named after the key in lower case, the action dictionary or
         * reference as read (`null` for a value of another type); the
         * other keys in `_extras`.
         */
        function typeAdditionalActions(dict, kind) {
            if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(TRIGGERS, kind)) {
                throw new ContractError('pdf/extra/action-ext/aa-kind',
                    `kind must be one of ${Object.keys(TRIGGERS).join(', ')}`,
                    { context: { kind } });
            }
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/action-ext/aa-not-dict',
                    'an additional-actions dictionary must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const keys = TRIGGERS[kind];
            const out = { raw: dict, _extras: {} };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (keys.includes(k)) out[k.toLowerCase()] = keyValue('dict', v);
                else out._extras[k] = v;
            }
            return out;
        }

        // The field dictionary's shared keys and its rich text.
        const FIELD_ENTRY_TYPES = keyTypes('Parent:dict Kids:array T:string TU:string TM:string Ff:int AA:dict DS:string RV:string|stream');

        /**
         * The companion of the core field typers: the field dictionary's
         * shared keys (`parent`, `kids`, `t`, `tu`, `tm`, `ff`, `aa`) and its
         * rich text (`ds`, `rv`), present only when the key is, `null` for
         * a value of another type; no `_extras` (the other keys are the
         * core typers').
         */
        function typeFieldEntries(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/action-ext/field-not-dict',
                    'a field must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const out = { raw: dict };
            for (const [k, v] of Object.entries(dict.entries)) {
                if (Object.prototype.hasOwnProperty.call(FIELD_ENTRY_TYPES, k)) out[k.toLowerCase()] = keyValue(FIELD_ENTRY_TYPES[k], v);
            }
            return out;
        }

        return { typeExtendedAction, EXTENDED_ACTION_SUBTYPES, typeFieldEntries,
                 typeAdditionalActions, ADDITIONAL_ACTION_TRIGGERS: TRIGGERS };
    }
};

