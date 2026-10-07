// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Destination typing per ISO 32000-2:2020 §12.3.2.
 *
 * A destination targets a page and a view rectangle/zoom. It can be:
 *   - an explicit array `[ pageRef, /XYZ, ... ]`;
 *   - a named destination (a name or byte-string) resolved through the
 *     document's `/Names./Dests` name tree (PDF 1.2+) or the legacy
 *     `/Dests` dict (PDF 1.1, name-only).
 *
 * The L3 typing returns `{ page, fit, args }`:
 *   - `page`  — `{ num, gen }` (explicit) or `{ pageNum: int }` (remote).
 *   - `fit`   — one of XYZ, Fit, FitH, FitV, FitR, FitB, FitBH, FitBV.
 *   - `args`  — fit-specific numeric arguments per §12.3.2.2.
 *
 * @module pdf/destination/destination
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfDestination = {
    name: 'pdfDestination',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, _p) {
        const { ParseError } = errors;

        const FIT_ARGS = {
            XYZ:   3, // left, top, zoom
            Fit:   0,
            FitH:  1, // top
            FitV:  1, // left
            FitR:  4, // left, bottom, right, top
            FitB:  0,
            FitBH: 1, // top
            FitBV: 1  // left
        };

        function typeDestination(value, namesDict, resolveRef) {
            if (!value || typeof value !== 'object') {
                throw new ParseError('pdf/dest/bad-input',
                    'destination must be a typed PDF object',
                    { context: { type: value && value.type } });
            }

            if (value.type === 'dict' && value.entries && value.entries.D) {
                return typeDestination(value.entries.D, namesDict, resolveRef);
            }

            if (value.type === 'name' || value.type === 'string') {
                return resolveNamed(value, namesDict, resolveRef);
            }

            if (value.type !== 'array') {
                throw new ParseError('pdf/dest/bad-type',
                    'destination must be an array, name or string',
                    { context: { type: value.type } });
            }

            const items = value.items;
            if (items.length === 0) {
                throw new ParseError('pdf/dest/empty',
                    'destination array is empty');
            }

            const head = items[0];
            let page;
            if (head.type === 'ref') {
                page = { num: head.num, gen: head.gen };
            } else if (head.type === 'int') {
                page = { pageNum: head.value };
            } else {
                throw new ParseError('pdf/dest/bad-page',
                    'destination[0] must be a page ref or int',
                    { context: { type: head.type } });
            }

            const fitItem = items[1];
            if (!fitItem || fitItem.type !== 'name') {
                throw new ParseError('pdf/dest/missing-fit',
                    'destination[1] must be a fit name',
                    { context: { type: fitItem && fitItem.type } });
            }
            const fit = fitItem.value;
            if (!Object.prototype.hasOwnProperty.call(FIT_ARGS, fit)) {
                throw new ParseError('pdf/dest/unknown-fit',
                    'unknown destination fit mode',
                    { context: { fit } });
            }

            const expected = FIT_ARGS[fit];
            const args = [];
            for (let i = 0; i < expected; i++) {
                const a = items[2 + i];
                if (a === undefined) { args.push(null); continue; }
                if (a.type === 'int' || a.type === 'real') args.push(a.value);
                else if (a.type === 'null') args.push(null);
                else {
                    throw new ParseError('pdf/dest/bad-arg',
                        'destination argument must be number or null',
                        { context: { fit, index: i, type: a.type } });
                }
            }

            return { page, fit, args };
        }

        function resolveNamed(value, namesDict, resolveRef) {
            if (!namesDict) {
                throw new ParseError('pdf/dest/no-names',
                    'named destination but no /Dests or /Names./Dests provided',
                    { context: { kind: value.type } });
            }
            const key = value.value;
            let target;
            if (namesDict.type === 'dict' && namesDict.entries) {
                if (value.type === 'name') {
                    target = namesDict.entries[key];
                }
                if (!target && Array.isArray(namesDict.entries.Names && namesDict.entries.Names.items)) {
                    target = lookupNameTree(namesDict, key, resolveRef);
                }
            }
            if (!target) {
                throw new ParseError('pdf/dest/unknown-name',
                    'named destination not found',
                    { context: { name: typeof key === 'string' ? key : '<bytes>' } });
            }
            if (resolveRef && target.type === 'ref') {
                target = resolveRef(target);
            }
            return typeDestination(target, null, resolveRef);
        }

        function lookupNameTree(node, key, resolveRef) {
            const names = node.entries.Names;
            if (names && names.type === 'array') {
                const it = names.items;
                for (let i = 0; i + 1 < it.length; i += 2) {
                    const k = it[i];
                    if (!k) continue;
                    const kv = k.type === 'string' ? bytesEq(k.value, key) :
                               (k.type === 'name' ? k.value === key : false);
                    if (kv) return it[i + 1];
                }
            }
            if (node.entries.Kids && node.entries.Kids.type === 'array' && resolveRef) {
                for (const k of node.entries.Kids.items) {
                    if (k.type !== 'ref') continue;
                    const child = resolveRef(k);
                    if (child && child.type === 'dict') {
                        const found = lookupNameTree(child, key, resolveRef);
                        if (found) return found;
                    }
                }
            }
            return null;
        }

        function bytesEq(a, b) {
            if (a === b) return true;
            if (!a || !b) return false;
            if (typeof b === 'string') {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) if (a[i] !== b.charCodeAt(i)) return false;
                return true;
            }
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
            return true;
        }

        return { typeDestination };
    }
};
