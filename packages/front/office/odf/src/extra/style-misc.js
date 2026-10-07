// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : passthrough typed coverage for any
 * residual `style:*` element. See `_misc-helper.js`.
 *
 * @module odf/extra/style-misc
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfMiscHelper } from './_misc-helper.js';

export const styleMisc = {
    name: 'styleMisc',
    dependencies: ['xml', 'odfMiscHelper'],
    deps: [xml, odfMiscHelper],

    factory(xml, odfMiscHelper) {
        const ELEMENTS = new Set([
            'style:style', 'style:default-style', 'style:default-page-layout',
            'style:font-face', 'style:handout-master',
            'style:presentation-page-layout', 'style:tab-stop', 'style:tab-stops',
            'style:drop-cap', 'style:background-image', 'style:list-level-properties',
            'style:list-level-label-alignment', 'style:text-properties',
            'style:paragraph-properties', 'style:graphic-properties',
            'style:table-properties', 'style:table-column-properties',
            'style:table-row-properties', 'style:table-cell-properties',
            'style:section-properties', 'style:ruby-properties',
            'style:header-style', 'style:footer-style', 'style:header-footer-properties',
            'style:column', 'style:columns', 'style:column-sep', 'style:footnote-sep',
            'style:layout-grid-properties', 'style:map', 'style:region-left',
            'style:region-center', 'style:region-right', 'style:chart-properties'
        ]);

        const h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, 'style:');

        function hydrateStyles(s) {
            if (!s || !s._extras) return s;
            const extras = Array.isArray(s._extras) ? s._extras : (s._extras.children || []);
            if (!extras.length) return s;
            const remaining = [];
            const promoted = s.styleNodes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(h.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) s.styleNodes = promoted;
            if (Array.isArray(s._extras)) {
                if (remaining.length) s._extras = remaining; else delete s._extras;
            } else {
                if (remaining.length) s._extras.children = remaining; else delete s._extras.children;
                if (!Object.keys(s._extras).length) delete s._extras;
            }
            return s;
        }

        function dehydrateStyles(s) {
            if (!s || !s.styleNodes || !s.styleNodes.length) return s;
            const out = { ...s };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.styleNodes) {
                if (n && n._passthrough) extras.push(h.renderElement(n));
            }
            delete out.styleNodes;
            if (Array.isArray(s._extras) || !s._extras) out._extras = extras;
            else out._extras = { ...s._extras, children: extras };
            return out;
        }

        return { ...h, _passthrough: true, hydrateStyles, dehydrateStyles };
    }
};
