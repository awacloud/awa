// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `settings.xml`.
 *
 * Root: `<office:document-settings>` → `<office:settings>` →
 * zero or more `<config:config-item-set>`.
 *
 * Each item-set is preserved as a raw XML element node — no
 * deep typing, just preserve-and-emit.
 *
 * Model: `{ itemSets: [<element>...], _extras? }`.
 *
 * @module odf/settings/settings
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';

export const odfSettings = {
    name: 'odfSettings',
    dependencies: ['odfErrors', 'odfShared', 'xml'],
    deps: [odfErrors, odfShared, xml],

    factory(errors, shared, xml) {
        const { ParseError } = errors;
        const { ODF_NS, ODF_VERSION, parseXmlOrThrow, declareNamespaces } = shared;
        const OFFICE_NS = ODF_NS.OFFICE;
        const CONFIG_NS = ODF_NS.CONFIG;

        function parse(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'settings',
                { part: 'settings.xml', module: 'settings' });
            if (root.name !== 'office:document-settings') {
                throw new ParseError('odf/parse-error/settings',
                    `settings: unexpected root <${root.name}>`,
                    { context: { part: 'settings.xml', module: 'settings' } });
            }
            const settingsEl = xml.findChild(root, 'office:settings');
            const itemSets = [];
            const extras = [];
            if (settingsEl) {
                for (const c of settingsEl.children || []) {
                    if (c.type !== 'element') continue;
                    if (c.name === 'config:config-item-set') itemSets.push(c);
                    else extras.push(c);
                }
            }
            const out = { itemSets };
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Render a settings model to `settings.xml` text (with prolog). The
         * root declares every namespace prefix the output uses: its own two,
         * then `opts.namespaces` (the source part's declarations), then the
         * known table; a prefix none of them resolves throws
         * `RenderError('odf/render-error/namespace')`.
         *
         * @param {object} [settings]
         * @param {object} [opts] — `{ namespaces? }` prefix → URI map
         * @returns {string}
         */
        function serialize(settings, opts) {
            const s = settings || { itemSets: [] };
            const children = (s.itemSets || []).slice();
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            const settingsEl = xml.el('office:settings', {}, children);
            const root = xml.el('office:document-settings', {
                'xmlns:office': OFFICE_NS,
                'xmlns:config': CONFIG_NS,
                'office:version': ODF_VERSION
            }, [settingsEl]);
            declareNamespaces(root, { carried: (opts && opts.namespaces) || {},
                part: 'settings.xml', module: 'settings' });
            return xml.serialize(root);
        }

        function empty() {
            return { itemSets: [] };
        }

        return { parse, serialize, empty, OFFICE_NS, CONFIG_NS };
    }
};
