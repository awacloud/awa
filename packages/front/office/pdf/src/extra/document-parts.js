// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in: Document Parts (ISO/TS 32004) typing.
 *
 * TS 32004 introduces a hierarchical "Document Parts" tree rooted in the
 * Catalog under `/DPartRoot`. Each node is a `/Type /DPart` dict with:
 *   /Parent        — parent DPart (omitted on root)
 *   /DParts        — array of child DPart refs or page refs
 *   /Start         — first page index in this subtree (computed)
 *   /End           — last page index in this subtree
 *   /DPM           — Document Part Metadata dict
 *   /NodeNameTree  — name-tree mapping local names → DPart refs
 *
 * @module pdf/extra/document-parts
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';

export const pdfDocumentParts = {
    name: 'pdfDocumentParts',
    dependencies: ['pdfErrors', 'pdfParser'],
    deps: [pdfErrors, pdfParser],
    factory(errors, parser) {
        const { ParseError } = errors;
        const { isType } = parser;

        const DPART_KNOWN = new Set([
            'Type', 'Parent', 'DParts', 'Start', 'End', 'DPM', 'NodeNameTree'
        ]);
        const ROOT_KNOWN = new Set([
            'Type', 'DPartRootNode', 'RecordLevel', 'NodeNameList'
        ]);

        function typeDPartRoot(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/dparts/root/not-dict',
                    '/DPartRoot must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'DPartRoot')) {
                throw new ParseError('pdf/extra/dparts/root/bad-type',
                    '/Type must be /DPartRoot when present',
                    { context: { actual: e.Type.value } });
            }
            if (!e.DPartRootNode) {
                throw new ParseError('pdf/extra/dparts/root/missing-node',
                    '/DPartRoot requires a /DPartRootNode entry');
            }
            const out = {
                rootNode:    e.DPartRootNode,
                recordLevel: isType(e.RecordLevel, 'int') ? e.RecordLevel.value : null,
                nodeNameList: toNameList(e.NodeNameList),
                raw: dict,
                _extras: {}
            };
            for (const k of Object.keys(e)) {
                if (!ROOT_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeDPart(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/dparts/node/not-dict',
                    '/DPart must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            if (e.Type && (e.Type.type !== 'name' || e.Type.value !== 'DPart')) {
                throw new ParseError('pdf/extra/dparts/node/bad-type',
                    '/Type must be /DPart when present',
                    { context: { actual: e.Type.value } });
            }
            const out = {
                parent:       e.Parent || null,
                dParts:       toRefArray(e.DParts),
                start:        isType(e.Start, 'int') ? e.Start.value : null,
                end:          isType(e.End,   'int') ? e.End.value   : null,
                dpm:          isType(e.DPM, 'dict') ? typeDPM(e.DPM) : null,
                nodeNameTree: e.NodeNameTree || null,
                raw:          dict,
                _extras:      {}
            };
            if (e.DPM && !isType(e.DPM, 'dict')) {
                throw new ParseError('pdf/extra/dparts/node/bad-dpm',
                    '/DPM must be a dictionary',
                    { context: { type: e.DPM.type } });
            }
            for (const k of Object.keys(e)) {
                if (!DPART_KNOWN.has(k)) out._extras[k] = e[k];
            }
            return out;
        }

        function typeDPM(dict) {
            if (!isType(dict, 'dict')) {
                throw new ParseError('pdf/extra/dparts/dpm/not-dict',
                    '/DPM must be a dictionary',
                    { context: { type: dict && dict.type } });
            }
            const e = dict.entries;
            const out = { entries: {}, raw: dict };
            for (const k of Object.keys(e)) out.entries[k] = e[k];
            return out;
        }

        function walkDParts(root, visit) {
            if (!root) return;
            if (typeof visit !== 'function') {
                throw new ParseError('pdf/extra/dparts/walk/bad-visit',
                    'walkDParts requires a visit callback');
            }
            visit(root);
            if (!root.dParts) return;
            for (const child of root.dParts) {
                if (isType(child, 'dict')) walkDParts(typeDPart(child), visit);
            }
        }

        function toRefArray(v) {
            if (!v) return null;
            if (v.type !== 'array') return null;
            return v.items.slice();
        }

        function toNameList(v) {
            if (!v) return null;
            if (v.type !== 'array') return null;
            const out = [];
            for (const it of v.items) {
                if (isType(it, 'name')) out.push(it.value);
                else out.push(it);
            }
            return out;
        }

        return { typeDPartRoot, typeDPart, typeDPM, walkDParts };
    }
};

