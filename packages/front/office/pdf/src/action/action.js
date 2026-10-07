// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Action orchestrator per ISO 32000-2:2020 §12.6.
 *
 * Dispatches on `/S` (action type) and delegates to a specialised typer
 * when available, otherwise returns a generic `{ kind, raw, _extras }`
 * record for action subtypes not (yet) covered by a dedicated module
 * (Thread, Sound, Movie, Hide, SubmitForm, ResetForm, ImportData,
 * SetOCGState, Rendition, Trans, GoTo3DView, GoToDp, JavaScript).
 *
 * The `/Next` entry (a single action dict or an array of them) is
 * recursively typed, with cycle protection via a Set of seen dicts.
 *
 * Optional sub-typers are passed via the `typers` argument — this lets
 * callers wire `typeGoTo`, `typeUri`, etc. without creating a hard
 * import chain.
 *
 * @module pdf/action/action
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfAction = {
    name: 'pdfAction',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const GENERIC_KINDS = new Set([
            'GoTo', 'GoToR', 'GoToE', 'GoToDp', 'Launch', 'Thread', 'URI',
            'Sound', 'Movie', 'Hide', 'Named', 'SubmitForm', 'ResetForm',
            'ImportData', 'SetOCGState', 'Rendition', 'Trans', 'GoTo3DView',
            'JavaScript', 'RichMediaExecute'
        ]);

        function typeAction(dict, typers, opts) {
            const seen = new Set();
            const maxDepth = (opts && opts.maxDepth) || 16;
            return walk(dict, 0);

            function walk(d, depth) {
                if (depth > maxDepth) {
                    throw new ParseError('pdf/action/max-depth',
                        'action /Next chain too deep',
                        { context: { depth, maxDepth } });
                }
                if (!isType(d, 'dict')) {
                    throw new ParseError('pdf/action/not-dict',
                        'action must be a dictionary',
                        { context: { type: d && d.type } });
                }
                if (seen.has(d)) {
                    throw new ParseError('pdf/action/cycle',
                        'cycle detected in action /Next chain');
                }
                seen.add(d);

                const e = d.entries;
                if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'Action')) {
                    throw new ParseError('pdf/action/bad-type',
                        '/Type must be /Action when present',
                        { context: { actual: e.Type.value } });
                }
                if (!e.S || e.S.type !== 'name') {
                    throw new ParseError('pdf/action/missing-s',
                        'action missing /S name',
                        { context: { type: e.S && e.S.type } });
                }
                const kind = e.S.value;

                let rec;
                const t = typers && typers[kind];
                if (typeof t === 'function') {
                    rec = t(d);
                    if (!rec.kind) rec.kind = kind;
                } else {
                    if (!GENERIC_KINDS.has(kind)) {
                        rec = { kind, vendor: true, raw: d, _extras: collectExtras(e) };
                    } else {
                        rec = { kind, raw: d, _extras: collectExtras(e) };
                    }
                }

                if (e.Next) {
                    if (e.Next.type === 'dict') {
                        rec.next = [walk(e.Next, depth + 1)];
                    } else if (e.Next.type === 'array') {
                        rec.next = e.Next.items.map((nx) => walk(nx, depth + 1));
                    } else {
                        throw new ParseError('pdf/action/bad-next',
                            '/Next must be a dict or array of dicts',
                            { context: { type: e.Next.type } });
                    }
                }
                return rec;
            }
        }

        function collectExtras(entries) {
            const out = {};
            for (const k of Object.keys(entries)) {
                if (k !== 'Type' && k !== 'S' && k !== 'Next') out[k] = entries[k];
            }
            return out;
        }

        return { typeAction };
    }
};
