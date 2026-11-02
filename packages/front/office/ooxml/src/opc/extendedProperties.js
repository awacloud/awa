// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Read the extended properties of an OPC package (ECMA-376
 * part 1 § 22.2): the part the package's root relationship of type
 * `…/extended-properties` (transitional) or `…/extendedProperties`
 * (strict) names (`docProps/app.xml` by convention), typed by local name —
 * the counts (`Pages`, `Words`, `Characters`, …) as non-negative integers,
 * the flags (`ScaleCrop`, `LinksUpToDate`, `SharedDoc`,
 * `HyperlinksChanged`) as booleans, the strings (`Application`,
 * `AppVersion`, `Company`, …) as text. A count or a flag whose value is
 * not one is left out; the vector properties (`HeadingPairs`,
 * `TitlesOfParts`, `HLinks`, `DigSig`) are not typed. Read-only: the
 * figures are the producing application's, stored at its last save.
 *
 * @module ooxml/opc/extendedProperties
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const opcExtendedProperties = {
    name: 'opcExtendedProperties',
    dependencies: ['ooxmlErrors', 'xml'],
    deps: [ooxmlErrors, xml],

    factory(errors, xml) {
        const { ParseError } = errors;
        const COUNTS = {
            Pages: 'pages', Words: 'words', Characters: 'characters', CharactersWithSpaces: 'charactersWithSpaces',
            Lines: 'lines', Paragraphs: 'paragraphs', Slides: 'slides', Notes: 'notes', HiddenSlides: 'hiddenSlides',
            MMClips: 'mmClips', TotalTime: 'totalTime', DocSecurity: 'docSecurity'
        };
        const FLAGS = {
            ScaleCrop: 'scaleCrop', LinksUpToDate: 'linksUpToDate', SharedDoc: 'sharedDoc', HyperlinksChanged: 'hyperlinksChanged'
        };
        const STRINGS = {
            Application: 'application', AppVersion: 'appVersion', Company: 'company', Manager: 'manager',
            Template: 'template', PresentationFormat: 'presentationFormat', HyperlinkBase: 'hyperlinkBase'
        };
        const localName = (name) => name.slice(name.indexOf(':') + 1);

        /**
         * The extended properties of a read package, or `null` when it names
         * no extended-properties part (or the part is missing).
         *
         * @param {{parts: Object<string, Uint8Array>, rels: Object<string, object[]>}} pkg
         *   A package as `opcPackage.read` returns it.
         * @returns {null | Object<string, number|boolean|string>}
         * @throws {ParseError} `opc/extended-properties-invalid` when the
         *   part is not XML or its root is not `Properties`.
         */
        function read(pkg) {
            const rels = (pkg && pkg.rels && pkg.rels['/']) || [];
            const rel = rels.find((r) => r && typeof r.Type === 'string'
                && /\/(?:extended-properties|extendedProperties)$/.test(r.Type) && r.TargetMode !== 'External');
            if (!rel || typeof rel.Target !== 'string') return null;
            const name = rel.Target.startsWith('/') ? rel.Target : '/' + rel.Target;
            const bytes = pkg.parts && pkg.parts[name];
            if (!bytes) return null;
            let root;
            try {
                root = xml.parse(new TextDecoder('utf-8').decode(bytes));
            } catch (e) {
                throw new ParseError('opc/extended-properties-invalid', 'OPC: the extended-properties part is not XML',
                    { context: { partName: name }, cause: e });
            }
            if (!root || root.type !== 'element' || localName(root.name) !== 'Properties') {
                throw new ParseError('opc/extended-properties-invalid', 'OPC: the extended-properties part has no Properties root',
                    { context: { partName: name, elementName: root && root.name } });
            }
            const out = {};
            for (const c of root.children || []) {
                if (c.type !== 'element') continue;
                const key = localName(c.name);
                const text = xml.textContent(c).trim();
                if (COUNTS[key] !== undefined) {
                    if (/^\d+$/.test(text) && Number.isSafeInteger(Number(text))) out[COUNTS[key]] = Number(text);
                } else if (FLAGS[key] !== undefined) {
                    if (text === 'true' || text === '1') out[FLAGS[key]] = true;
                    else if (text === 'false' || text === '0') out[FLAGS[key]] = false;
                } else if (STRINGS[key] !== undefined) {
                    out[STRINGS[key]] = xml.textContent(c);
                }
            }
            return out;
        }

        return { read };
    }
};
