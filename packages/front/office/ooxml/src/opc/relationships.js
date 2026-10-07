// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse / serialize `*.rels` files (OPC, ECMA-376 part 2 §9).
 *
 * Each part may have an associated relationships part at
 * `<dir>/_rels/<filename>.rels` describing typed links to other parts. The
 * package itself uses `_rels/.rels` to declare top-level relationships
 * (typically pointing at the document's main part).
 *
 * @module ooxml/opc/relationships
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const opcRelationships = {
    name: 'opcRelationships',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;

        const NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
        /**
         * Parse a `.rels` document.
         *
         * @param {string} text
         * @returns {Array<{Id:string, Type:string, Target:string, TargetMode?:string}>}
         */
        function parse(text) {
            const root = xml.parse(text);
            if (root.name !== 'Relationships') {
                throw new ParseError('opc/relationships-bad-root', `OPC: expected <Relationships>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const out = [];
            for (const c of root.children) {
                if (c.type !== 'element' || c.name !== 'Relationship') continue;
                const r = {
                    Id: c.attrs.Id,
                    Type: c.attrs.Type,
                    Target: c.attrs.Target
                };
                if (c.attrs.TargetMode) r.TargetMode = c.attrs.TargetMode;
                out.push(r);
            }
            return out;
        }

        /**
         * Serialize a list of relationships to XML.
         *
         * @param {Array} rels
         * @returns {string}
         */
        function serialize(rels) {
            const children = (rels || []).map(r => {
                const attrs = {
                    Id: r.Id,
                    Type: r.Type,
                    Target: r.Target
                };
                if (r.TargetMode) attrs.TargetMode = r.TargetMode;
                return xml.el('Relationship', attrs);
            });
            return xml.serialize(xml.el('Relationships', { xmlns: NS }, children));
        }

        /**
         * Path of the `.rels` file for a given absolute part name. The package
         * itself (root) maps to `_rels/.rels`.
         *
         * @param {string} partName absolute part path beginning with `/`,
         *                          or empty string for the package root
         * @returns {string} ZIP path of the rels file (no leading `/`)
         */
        function relsPathFor(partName) {
            if (!partName || partName === '/') return '_rels/.rels';
            const clean = partName.replace(/^\//, '');
            const slash = clean.lastIndexOf('/');
            const dir = slash < 0 ? '' : clean.slice(0, slash + 1);
            const file = slash < 0 ? clean : clean.slice(slash + 1);
            return `${dir}_rels/${file}.rels`;
        }

        /**
         * Resolve a relationship Target against its source part name
         * (handles both absolute `/...` and relative targets).
         *
         * @param {string} sourcePart absolute part name of the source
         * @param {string} target Target attribute as stored in the rels file
         * @returns {string} absolute part name of the target
         */
        function resolveTarget(sourcePart, target) {
            if (target.startsWith('/')) return target;
            const src = sourcePart.replace(/^\//, '');
            const slash = src.lastIndexOf('/');
            const baseDir = slash < 0 ? '' : src.slice(0, slash + 1);
            const segments = (baseDir + target).split('/');
            const out = [];
            for (const seg of segments) {
                if (!seg || seg === '.') continue;
                if (seg === '..') out.pop();
                else out.push(seg);
            }
            return '/' + out.join('/');
        }

        return { parse, serialize, relsPathFor, resolveTarget, NS };
    }
};
