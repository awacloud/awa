// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: extended action subtypes per
 * ISO 32000-2:2020 §12.6.4 — GoTo3DView (§12.6.4.15),
 * SetOCGState (§12.6.4.12), Trans (§12.6.4.13), Rendition (§12.6.4.14),
 * Hide (§12.6.4.10), SubmitForm (§12.6.4.4), ResetForm (§12.6.4.5),
 * ImportData (§12.6.4.6), JavaScript (§12.6.4.7, sandboxed flag only).
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
        const { ParseError } = errors;
        const { isType } = parserObj;

        const EXTENDED_ACTION_SUBTYPES = new Set([
            'GoTo3DView', 'SetOCGState', 'Trans', 'Rendition', 'Hide',
            'SubmitForm', 'ResetForm', 'ImportData', 'JavaScript'
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
            JavaScript:  new Set(['Type', 'S', 'Next', 'JS'])
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
            const hasJs = isType(e.JS, 'string') || isType(e.JS, 'stream');
            return {
                r:  e.R  || null,
                an: e.AN || null,
                op,
                js: isType(e.JS, 'string') ? e.JS.value : (isType(e.JS, 'stream') ? e.JS : null),
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
            if (!isType(e.JS, 'string') && !isType(e.JS, 'stream')) {
                throw new ParseError('pdf/extra/action-ext/bad-js',
                    '/JS must be string or stream',
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

        return { typeExtendedAction, EXTENDED_ACTION_SUBTYPES };
    }
};

