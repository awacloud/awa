// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Marked-content scanner per ISO 32000-2:2020 §14.6.
 *
 * Walks an operator list produced by `pdfContentStream.parseContentStream`
 * and extracts marked-content sequences delimited by `BMC` / `BDC` /
 * `EMC`. Each entry records its tag, properties (the inline dict or the
 * /Properties name resolved by the caller from the page resources), the
 * `MCID` (if any) and the inclusive op-index range.
 *
 * Also exposes `resolveMcidToStruct(pageRef, mcid, parentTree, resolveRef)`
 * which combines a page's `/StructParents` key with the document
 * `/ParentTree` to find the owning StructElem ref of a given MCID.
 *
 * @module pdf/tagged/markedContent
 */

/**
 * Module factory.
 */
import { pdfErrors } from '../errors.js';
import { pdfParser } from '../syntax/parser.js';
import { pdfParentTree } from './parentTree.js';

export const pdfMarkedContent = {
    name: 'pdfMarkedContent',
    dependencies: ['pdfErrors', 'pdfParser', 'pdfParentTree'],
    deps: [pdfErrors, pdfParser, pdfParentTree],
    factory(errors, parser, parentTree) {
        const { ParseError } = errors;
        const { isType } = parser;
        const { lookupParent } = parentTree;

        function extractMcids(opsList) {
            if (!Array.isArray(opsList)) {
                throw new ParseError('pdf/tagged/marked-content/bad-ops',
                    'extractMcids expects an array of ops',
                    { context: { typeof: typeof opsList } });
            }
            const out = [];
            const stack = [];
            for (let i = 0; i < opsList.length; i++) {
                const op = opsList[i];
                if (!op || typeof op.op !== 'string') continue;
                if (op.op === 'BMC') {
                    stack.push(openEntry(op, i, null));
                } else if (op.op === 'BDC') {
                    stack.push(openEntry(op, i, op.args[1] || null));
                } else if (op.op === 'EMC') {
                    if (stack.length === 0) {
                        throw new ParseError('pdf/tagged/marked-content/unmatched-emc',
                            'EMC without matching BMC/BDC',
                            { context: { index: i } });
                    }
                    const e = stack.pop();
                    e.end = i;
                    out.push(e);
                }
            }
            if (stack.length > 0) {
                throw new ParseError('pdf/tagged/marked-content/unterminated',
                    'BMC/BDC without matching EMC',
                    { context: { open: stack.length } });
            }
            out.sort((a, b) => a.start - b.start);
            return out;
        }

        function openEntry(op, index, properties) {
            const tag = op.args[0];
            if (!tag || tag.type !== 'name') {
                throw new ParseError('pdf/tagged/marked-content/bad-tag',
                    'marked-content tag must be a name',
                    { context: { index, kind: tag && tag.type } });
            }
            return {
                tag: tag.value,
                start: index,
                end: -1,
                mcid: readMcid(properties),
                properties
            };
        }

        function readMcid(properties) {
            if (!properties || properties.type !== 'dict') return null;
            const m = properties.entries.MCID;
            if (!m) return null;
            if (m.type !== 'int' && m.type !== 'real') return null;
            return m.value | 0;
        }

        function resolveMcidToStruct(pageDict, mcid, pTree, resolveRef) {
            if (!isType(pageDict, 'dict')) {
                throw new ParseError('pdf/tagged/marked-content/bad-page',
                    'page must be a dict',
                    { context: { kind: pageDict && pageDict.type } });
            }
            const sp = pageDict.entries.StructParents;
            if (!sp || (sp.type !== 'int' && sp.type !== 'real')) {
                return null;
            }
            const found = lookupParent(pTree, sp.value | 0, resolveRef);
            if (!found) return null;
            let arr = found;
            if (arr.type === 'ref') arr = resolveRef(arr);
            if (!arr || arr.type !== 'array') {
                throw new ParseError('pdf/tagged/marked-content/bad-entry',
                    'page /ParentTree entry must be an array indexed by MCID',
                    { context: { kind: arr && arr.type } });
            }
            const item = arr.items[mcid | 0];
            if (!item) return null;
            return item;
        }

        return { extractMcids, resolveMcidToStruct };
    }
};
