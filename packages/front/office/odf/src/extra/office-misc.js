// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : passthrough typed coverage for any
 * residual `office:*` element not typed by the core. See `_misc-helper.js`.
 *
 * @module odf/extra/office-misc
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfMiscHelper } from './_misc-helper.js';

export const officeMisc = {
    name: 'officeMisc',
    dependencies: ['xml', 'odfMiscHelper'],
    deps: [xml, odfMiscHelper],

    factory(xml, odfMiscHelper) {
        const ELEMENTS = new Set([
            'office:annotation', 'office:annotation-end', 'office:body',
            'office:change-info', 'office:chart', 'office:database',
            'office:dde-source', 'office:document', 'office:document-content',
            'office:document-meta', 'office:document-settings', 'office:document-styles',
            'office:drawing', 'office:event-listeners', 'office:font-face-decls',
            'office:forms', 'office:image', 'office:master-styles',
            'office:meta', 'office:presentation', 'office:script', 'office:scripts',
            'office:spreadsheet', 'office:styles', 'office:text', 'office:value',
            'office:annotation-ref'
        ]);

        const h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, 'office:');

        function hydrateMetadata(m) {
            if (!m || !m._extras) return m;
            const extras = Array.isArray(m._extras) ? m._extras : (m._extras.children || []);
            if (!extras.length) return m;
            const remaining = [];
            const promoted = m.officeNodes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(h.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) m.officeNodes = promoted;
            if (Array.isArray(m._extras)) {
                if (remaining.length) m._extras = remaining; else delete m._extras;
            } else {
                if (remaining.length) m._extras.children = remaining; else delete m._extras.children;
                if (!Object.keys(m._extras).length) delete m._extras;
            }
            return m;
        }

        function dehydrateMetadata(m) {
            if (!m || !m.officeNodes || !m.officeNodes.length) return m;
            const out = { ...m };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.officeNodes) {
                if (n && n._passthrough) extras.push(h.renderElement(n));
            }
            delete out.officeNodes;
            if (Array.isArray(m._extras) || !m._extras) out._extras = extras;
            else out._extras = { ...m._extras, children: extras };
            return out;
        }

        return { ...h, _passthrough: true, hydrateMetadata, dehydrateMetadata };
    }
};
