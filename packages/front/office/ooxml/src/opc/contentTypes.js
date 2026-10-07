// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse / serialize `[Content_Types].xml` (OPC, ECMA-376 part 2 §10).
 *
 * The Content Types stream maps every part of the package to a MIME type via
 * two rules — `<Default Extension=… ContentType=…/>` (per file extension) and
 * `<Override PartName=… ContentType=…/>` (per absolute part path).
 *
 * @module ooxml/opc/contentTypes
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const opcContentTypes = {
    name: 'opcContentTypes',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;

        const NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
        /**
         * Parse `[Content_Types].xml` into a structured object.
         *
         * @param {string} text
         * @returns {{ defaults: Object<string,string>,
         *            overrides: Object<string,string> }}
         */
        function parse(text) {
            const root = xml.parse(text);
            if (root.name !== 'Types') {
                throw new ParseError('opc/content-types-bad-root', `OPC: expected <Types>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const defaults = {};
            const overrides = {};
            for (const child of root.children) {
                if (child.type !== 'element') continue;
                if (child.name === 'Default') {
                    defaults[child.attrs.Extension] = child.attrs.ContentType;
                } else if (child.name === 'Override') {
                    overrides[child.attrs.PartName] = child.attrs.ContentType;
                }
            }
            return { defaults, overrides };
        }

        /**
         * Serialize a structured content-types object to XML.
         *
         * @param {{ defaults: Object<string,string>,
         *           overrides: Object<string,string> }} types
         * @returns {string}
         */
        function serialize(types) {
            const children = [];
            for (const ext of Object.keys(types.defaults || {})) {
                children.push(xml.el('Default', {
                    Extension: ext,
                    ContentType: types.defaults[ext]
                }));
            }
            for (const part of Object.keys(types.overrides || {})) {
                children.push(xml.el('Override', {
                    PartName: part,
                    ContentType: types.overrides[part]
                }));
            }
            return xml.serialize(xml.el('Types', { xmlns: NS }, children));
        }

        /**
         * Resolve the content type of an absolute part name (`/word/document.xml`).
         * Overrides take precedence over the per-extension default.
         *
         * @param {{defaults, overrides}} types
         * @param {string} partName absolute part name beginning with `/`
         * @returns {string|null}
         */
        function lookup(types, partName) {
            if (types.overrides && types.overrides[partName]) {
                return types.overrides[partName];
            }
            const dot = partName.lastIndexOf('.');
            if (dot < 0) return null;
            const ext = partName.slice(dot + 1).toLowerCase();
            return (types.defaults && types.defaults[ext]) || null;
        }

        return { parse, serialize, lookup, NS };
    }
};
