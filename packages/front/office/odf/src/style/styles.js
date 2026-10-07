// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `styles.xml`.
 *
 * Root: `<office:document-styles>` with three structural children:
 * `<office:styles>`, `<office:automatic-styles>`, `<office:master-styles>`.
 *
 * On READ each container's contents are preserved as a flat array of
 * raw XML element nodes — no deep typing (`parse` stays raw).
 *
 * Model: `{ styles, automaticStyles, masterStyles, _extras? }` where
 * each first three fields are arrays of element nodes. On WRITE an entry
 * may also be a typed named-style SPEC (`{ name, family, displayName?,
 * parentStyleName?, nextStyleName?, defaultOutlineLevel?, class?,
 * properties?, _extras? }`), rendered by `namedStyle(spec)`; raw element
 * entries are serialised verbatim, byte-identical to before.
 *
 * @module odf/style/styles
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfStyles = {
    name: 'odfStyles',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        const { ParseError, ContractError } = errors;
        const { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared;
        const OFFICE_NS = ODF_NS.OFFICE;
        const STYLE_NS = ODF_NS.STYLE;
        const TEXT_NS = ODF_NS.TEXT;
        const FO_NS = ODF_NS.FO;
        const SVG_NS = ODF_NS.SVG;
        const TABLE_NS = ODF_NS.TABLE;

        function parse(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'styles',
                { part: 'styles.xml', module: 'styles' });
            if (root.name !== 'office:document-styles') {
                throw new ParseError('odf/parse-error/styles',
                    `styles: unexpected root <${root.name}>`,
                    { context: { part: 'styles.xml', module: 'styles' } });
            }
            const out = { styles: [], automaticStyles: [], masterStyles: [] };
            const extras = [];
            for (const c of root.children || []) {
                if (c.type !== 'element') continue;
                if (c.name === 'office:styles') {
                    for (const k of c.children || []) {
                        if (k.type === 'element') out.styles.push(k);
                    }
                } else if (c.name === 'office:automatic-styles') {
                    for (const k of c.children || []) {
                        if (k.type === 'element') out.automaticStyles.push(k);
                    }
                } else if (c.name === 'office:master-styles') {
                    for (const k of c.children || []) {
                        if (k.type === 'element') out.masterStyles.push(k);
                    }
                } else {
                    extras.push(c);
                }
            }
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Mirror of `styleAutomatic`'s `PROP_TAGS`, keyed the other way
         * (properties key → element tag), in the fixed emission order.
         * This factory is capture-free and declares
         * `[odfErrors, odfShared, xml]`, so the shared pure mapping is
         * duplicated here rather than imported (`fw/no-factory-capture`).
         * A drift test pins it against the live `styleAutomatic` module.
         */
        const PROP_ORDER = [
            ['paragraph',   'style:paragraph-properties'],
            ['text',        'style:text-properties'],
            ['table',       'style:table-properties'],
            ['tableColumn', 'style:table-column-properties'],
            ['tableRow',    'style:table-row-properties'],
            ['tableCell',   'style:table-cell-properties'],
            ['graphic',     'style:graphic-properties']
        ];

        /** Spec field → `style:style` attribute, in emission order. */
        const SPEC_ATTRS = [
            ['name',                'style:name'],
            ['displayName',         'style:display-name'],
            ['family',              'style:family'],
            ['parentStyleName',     'style:parent-style-name'],
            ['nextStyleName',       'style:next-style-name'],
            ['defaultOutlineLevel', 'style:default-outline-level'],
            ['class',               'style:class']
        ];

        function badSpec(spec) {
            return new ContractError('odf/contract-error/styles',
                'styles: named style needs a string name and family',
                { context: { module: 'styles', spec } });
        }

        /**
         * Render ONE typed named-style spec to a `<style:style>` element.
         *
         * Attributes: `style:name`, `style:display-name`, `style:family`,
         * `style:parent-style-name`, `style:next-style-name`,
         * `style:default-outline-level`, `style:class`, then
         * `_extras.attrs` verbatim. Children: one properties element per
         * present `properties` key (paragraph, text, table, tableColumn,
         * tableRow, tableCell, graphic), then `_extras.children`.
         *
         * @param {object} spec
         * @returns {object} raw `style:style` element node
         * @throws {ContractError} when `name` or `family` is not a string
         */
        function namedStyle(spec) {
            if (!spec || typeof spec !== 'object'
                || typeof spec.name !== 'string'
                || typeof spec.family !== 'string') {
                throw badSpec(spec);
            }
            const attrs = {};
            for (const [field, attr] of SPEC_ATTRS) {
                const v = spec[field];
                if (v === undefined || v === null) continue;
                attrs[attr] = String(v);
            }
            const xa = spec._extras && spec._extras.attrs;
            if (xa) for (const k of Object.keys(xa)) attrs[k] = xa[k];
            const children = [];
            const props = spec.properties || {};
            for (const [key, tag] of PROP_ORDER) {
                if (props[key] === undefined || props[key] === null) continue;
                children.push(xml.el(tag, { ...props[key] }, []));
            }
            const xc = spec._extras && spec._extras.children;
            if (xc) for (const c of xc) children.push(c);
            return xml.el('style:style', attrs, children);
        }

        /** Raw element → verbatim; typed spec → `namedStyle`; else throw. */
        function bucketEntries(list) {
            const out = [];
            for (const entry of list || []) {
                if (entry && entry.type === 'element') out.push(entry);
                else if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
                    out.push(namedStyle(entry));
                } else {
                    throw badSpec(entry);
                }
            }
            return out;
        }

        /**
         * Render a styles model to `styles.xml` text (with prolog). The root
         * declares every namespace prefix the output uses: its own six, then
         * `opts.namespaces` (the source part's declarations), then the known
         * table; a prefix none of them resolves throws
         * `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} [styles]
         * @param {object} [opts] — `{ namespaces? }` prefix → URI map
         * @returns {string}
         */
        function serialize(styles, opts) {
            const s = styles || { styles: [], automaticStyles: [], masterStyles: [] };
            const children = [
                xml.el('office:styles', {}, bucketEntries(s.styles)),
                xml.el('office:automatic-styles', {}, bucketEntries(s.automaticStyles)),
                xml.el('office:master-styles', {}, bucketEntries(s.masterStyles))
            ];
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            const root = xml.el('office:document-styles', {
                'xmlns:office': OFFICE_NS,
                'xmlns:style': STYLE_NS,
                'xmlns:text': TEXT_NS,
                'xmlns:fo': FO_NS,
                'xmlns:svg': SVG_NS,
                'xmlns:table': TABLE_NS,
                'office:version': ODF_VERSION
            }, children);
            declareNamespaces(root, { carried: (opts && opts.namespaces) || {},
                part: 'styles.xml', module: 'styles' });
            return xml.serialize(root);
        }

        function empty() {
            return { styles: [], automaticStyles: [], masterStyles: [] };
        }

        return { parse, serialize, namedStyle, empty,
                 OFFICE_NS, STYLE_NS, TEXT_NS, FO_NS, SVG_NS, TABLE_NS };
    }
};
