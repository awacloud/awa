// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in catch-all : passthrough typed coverage for any
 * residual `table:*` element. See `_misc-helper.js`.
 *
 * @module odf/extra/table-misc
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfMiscHelper } from './_misc-helper.js';

export const tableMisc = {
    name: 'tableMisc',
    dependencies: ['xml', 'odfMiscHelper'],
    deps: [xml, odfMiscHelper],

    factory(xml, odfMiscHelper) {
        const ELEMENTS = new Set([
            'table:title', 'table:desc', 'table:source-cell-range', 'table:source-service',
            'table:label-range', 'table:label-ranges', 'table:named-expression',
            'table:named-range', 'table:named-expressions', 'table:dependencies',
            'table:dependency', 'table:operation', 'table:tracked-changes',
            'table:cell-content-change', 'table:cell-content-deletion',
            'table:cell-address', 'table:deletion', 'table:insertion',
            'table:movement', 'table:movement-cut-off', 'table:change-deletion',
            'table:change-track-table-cell', 'table:previous', 'table:detective',
            'table:operation-list', 'table:highlighted-range', 'table:consolidation',
            'table:body', 'table:shapes', 'table:cell-range-source',
            'table:database-source-sql', 'table:database-source-table',
            'table:database-source-query', 'table:content-validations',
            'table:content-validation', 'table:error-message', 'table:error-macro',
            'table:help-message'
        ]);

        const h = odfMiscHelper.buildMiscPassthrough(ELEMENTS, 'table:');

        function hydrateTable(t) {
            if (!t || !t._extras) return t;
            const extras = Array.isArray(t._extras) ? t._extras : (t._extras.children || []);
            if (!extras.length) return t;
            const remaining = [];
            const promoted = t.tableNodes || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ELEMENTS.has(c.name)) {
                    promoted.push(h.parseElement(c));
                } else { remaining.push(c); }
            }
            if (promoted.length) t.tableNodes = promoted;
            if (Array.isArray(t._extras)) {
                if (remaining.length) t._extras = remaining; else delete t._extras;
            } else {
                if (remaining.length) t._extras.children = remaining; else delete t._extras.children;
                if (!Object.keys(t._extras).length) delete t._extras;
            }
            return t;
        }

        function dehydrateTable(t) {
            if (!t || !t.tableNodes || !t.tableNodes.length) return t;
            const out = { ...t };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.tableNodes) {
                if (n && n._passthrough) extras.push(h.renderElement(n));
            }
            delete out.tableNodes;
            if (Array.isArray(t._extras) || !t._extras) out._extras = extras;
            else out._extras = { ...t._extras, children: extras };
            return out;
        }

        return { ...h, _passthrough: true, hydrateTable, dehydrateTable };
    }
};
