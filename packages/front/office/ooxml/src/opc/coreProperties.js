// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Read the core properties of an OPC package (ECMA-376 part 2
 * § 11): the part the package's root relationship of type
 * `…/metadata/core-properties` names (`docProps/core.xml` by convention),
 * typed into its fifteen string fields — `dc:title`, `dc:subject`,
 * `dc:creator`, `cp:keywords`, `dc:description`, `cp:lastModifiedBy`,
 * `cp:revision`, `cp:category`, `cp:contentStatus`, `dc:language`,
 * `dc:identifier`, `cp:version`, `dcterms:created`, `dcterms:modified`,
 * `cp:lastPrinted` — each matched by its local name, present when the
 * element is (its text, an empty element `''`). Dates stay strings, as
 * written. Read-only.
 *
 * @module ooxml/opc/coreProperties
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const opcCoreProperties = {
    name: 'opcCoreProperties',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;
        const FIELDS = new Set([
            'title', 'subject', 'creator', 'keywords', 'description', 'lastModifiedBy', 'revision',
            'category', 'contentStatus', 'language', 'identifier', 'version', 'created', 'modified', 'lastPrinted'
        ]);
        const localName = (name) => name.slice(name.indexOf(':') + 1);

        /**
         * The core properties of a read package, or `null` when it names
         * no core-properties part (or the part is missing).
         *
         * @param {{parts: Object<string, Uint8Array>, rels: Object<string, object[]>}} pkg
         *   A package as `opcPackage.read` returns it.
         * @returns {null | Object<string, string>}
         * @throws {ParseError} `opc/core-properties-invalid` when the part
         *   is not XML or its root is not `coreProperties`.
         */
        function read(pkg) {
            const rels = (pkg && pkg.rels && pkg.rels['/']) || [];
            const rel = rels.find((r) => r && typeof r.Type === 'string' && /\/metadata\/core-properties$/.test(r.Type)
                && r.TargetMode !== 'External');
            if (!rel || typeof rel.Target !== 'string') return null;
            const name = rel.Target.startsWith('/') ? rel.Target : '/' + rel.Target;
            const bytes = pkg.parts && pkg.parts[name];
            if (!bytes) return null;
            let root;
            try {
                root = xml.parse(new TextDecoder('utf-8').decode(bytes));
            } catch (e) {
                throw new ParseError('opc/core-properties-invalid', 'OPC: the core-properties part is not XML',
                    { context: { partName: name }, cause: e });
            }
            if (!root || root.type !== 'element' || localName(root.name) !== 'coreProperties') {
                throw new ParseError('opc/core-properties-invalid', 'OPC: the core-properties part has no coreProperties root',
                    { context: { partName: name, elementName: root && root.name } });
            }
            const out = {};
            for (const c of root.children || []) {
                if (c.type !== 'element') continue;
                const key = localName(c.name);
                if (FIELDS.has(key) && out[key] === undefined) out[key] = xml.textContent(c);
            }
            return out;
        }

        return { read };
    }
};
