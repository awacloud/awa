// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `meta.xml`.
 *
 * Root: `<office:document-meta>` containing `<office:meta>` with the
 * standard Dublin Core + ODF metadata fields.
 *
 * Model: `{ title?, creator?, date?, generator?, initialCreator?, creationDate?, _extras? }`.
 *
 * @module odf/meta/meta
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfMeta = {
    name: 'odfMeta',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        const { ParseError } = errors;
        const { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared;
        const OFFICE_NS = ODF_NS.OFFICE;
        const META_NS = ODF_NS.META;
        const DC_NS = ODF_NS.DC;

        // Note: the meta module discriminates six core elements
        // (`dc:title`, `dc:creator`, `dc:date`, `meta:generator`,
        //  `meta:initial-creator`, `meta:creation-date`) into typed
        // fields. Every other child of `<office:meta>` is preserved
        // verbatim in `_extras.children` for roundtrip fidelity.
        // Deeper typing of the remaining meta:* / dc:* set is provided
        // opt-in by the `metaExtended` extension.

        function parse(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'meta',
                { part: 'meta.xml', module: 'meta' });
            if (root.name !== 'office:document-meta') {
                throw new ParseError('odf/parse-error/meta',
                    `meta: unexpected root <${root.name}>`,
                    { context: { part: 'meta.xml', module: 'meta' } });
            }
            const metaEl = xml.findChild(root, 'office:meta');
            const out = {};
            const extras = [];
            if (metaEl) {
                for (const c of metaEl.children || []) {
                    if (c.type !== 'element') continue;
                    switch (c.name) {
                        case 'dc:title': out.title = xml.textContent(c); break;
                        case 'dc:creator': out.creator = xml.textContent(c); break;
                        case 'dc:date': out.date = xml.textContent(c); break;
                        case 'meta:generator': out.generator = xml.textContent(c); break;
                        case 'meta:initial-creator': out.initialCreator = xml.textContent(c); break;
                        case 'meta:creation-date': out.creationDate = xml.textContent(c); break;
                        default: extras.push(c);
                    }
                }
            }
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Render a meta model to `meta.xml` text (with prolog). The root
         * declares every namespace prefix the output uses: its own three,
         * then `opts.namespaces` (the source part's declarations), then the
         * known table; a prefix none of them resolves throws
         * `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} [meta]
         * @param {object} [opts] — `{ namespaces? }` prefix → URI map
         * @returns {string}
         */
        function serialize(meta, opts) {
            const m = meta || {};
            const children = [];
            if (m.title != null)         children.push(xml.el('dc:title', {}, [xml.text(String(m.title))]));
            if (m.creator != null)       children.push(xml.el('dc:creator', {}, [xml.text(String(m.creator))]));
            if (m.date != null)          children.push(xml.el('dc:date', {}, [xml.text(String(m.date))]));
            if (m.generator != null)     children.push(xml.el('meta:generator', {}, [xml.text(String(m.generator))]));
            if (m.initialCreator != null) children.push(xml.el('meta:initial-creator', {}, [xml.text(String(m.initialCreator))]));
            if (m.creationDate != null)  children.push(xml.el('meta:creation-date', {}, [xml.text(String(m.creationDate))]));
            if (m._extras && m._extras.children) {
                for (const c of m._extras.children) children.push(c);
            }
            const metaEl = xml.el('office:meta', {}, children);
            const root = xml.el('office:document-meta', {
                'xmlns:office': OFFICE_NS,
                'xmlns:meta': META_NS,
                'xmlns:dc': DC_NS,
                'office:version': ODF_VERSION
            }, [metaEl]);
            declareNamespaces(root, { carried: (opts && opts.namespaces) || {},
                part: 'meta.xml', module: 'meta' });
            return xml.serialize(root);
        }

        function empty() {
            return { generator: '@awacloud/odf' };
        }

        return { parse, serialize, empty, OFFICE_NS, META_NS, DC_NS };
    }
};
