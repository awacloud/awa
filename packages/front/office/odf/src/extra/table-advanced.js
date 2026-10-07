// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed support for advanced ODF table
 * features.
 *
 * Recognised elements (each parsed into a recursive
 * `{ kind, attrs, children: [...] }` tree at this scope) :
 *
 *   table:table-template, table:database-range, table:database-source-query,
 *   table:database-source-sql, table:database-source-table,
 *   table:filter, table:filter-and, table:filter-or, table:filter-condition,
 *   table:filter-set-item, table:scenario,
 *   table:sort, table:sort-by, table:sort-groups,
 *   table:subtotal-rules, table:subtotal-rule, table:subtotal-field,
 *   table:cell-range-source, table:cell-content-change,
 *   table:data-pilot-table + sub (data-pilot-field, data-pilot-member,
 *   data-pilot-level, data-pilot-members, data-pilot-display-info,
 *   data-pilot-sort-info, data-pilot-layout-info,
 *   data-pilot-field-reference, data-pilot-group, data-pilot-group-member,
 *   data-pilot-groups, data-pilot-subtotal, data-pilot-subtotals).
 *
 * Hook : `hydrateTable` / `dehydrateTable` promotes/demotes those nodes
 * via `_extras` on the typed table model.
 *
 * @module odf/extra/table-advanced
 */


import { xml } from '@awacloud/fw/io/codec/xml.js';

export const tableAdvanced = {
    name: 'tableAdvanced',
    dependencies: ['xml'],
    deps: [xml],

    factory(xml) {
        const ADV_NAMES = new Set([
            'table:table-template',
            'table:database-range',
            'table:database-source-query',
            'table:database-source-sql',
            'table:database-source-table',
            'table:filter',
            'table:filter-and',
            'table:filter-or',
            'table:filter-condition',
            'table:filter-set-item',
            'table:scenario',
            'table:sort',
            'table:sort-by',
            'table:sort-groups',
            'table:subtotal-rules',
            'table:subtotal-rule',
            'table:subtotal-field',
            'table:cell-range-source',
            'table:cell-content-change',
            'table:data-pilot-table',
            'table:data-pilot-field',
            'table:data-pilot-member',
            'table:data-pilot-members',
            'table:data-pilot-level',
            'table:data-pilot-display-info',
            'table:data-pilot-sort-info',
            'table:data-pilot-layout-info',
            'table:data-pilot-field-reference',
            'table:data-pilot-group',
            'table:data-pilot-group-member',
            'table:data-pilot-groups',
            'table:data-pilot-subtotal',
            'table:data-pilot-subtotals'
        ]);


        function parseNode(el) {
            const out = { kind: el.name, attrs: { ...(el.attrs || {}) }, children: [] };
            for (const c of el.children || []) {
                if (c.type !== 'element') continue;
                out.children.push(parseNode(c));
            }
            return out;
        }

        function renderNode(n) {
            const kids = (n.children || []).map(renderNode);
            return xml.el(n.kind, { ...(n.attrs || {}) }, kids);
        }

        function isAdvancedName(name) { return ADV_NAMES.has(name); }

        function hydrateTable(t) {
            if (!t || !t._extras) return t;
            const extras = Array.isArray(t._extras) ? t._extras
                : (t._extras.children || []);
            if (!extras.length) return t;
            const remaining = [];
            const adv = t.advanced || [];
            for (const c of extras) {
                if (c && c.type === 'element' && ADV_NAMES.has(c.name)) {
                    adv.push(parseNode(c));
                } else {
                    remaining.push(c);
                }
            }
            if (adv.length) t.advanced = adv;
            if (Array.isArray(t._extras)) {
                if (remaining.length) t._extras = remaining;
                else delete t._extras;
            } else {
                if (remaining.length) t._extras.children = remaining;
                else delete t._extras.children;
                if (!Object.keys(t._extras).length) delete t._extras;
            }
            return t;
        }

        function dehydrateTable(t) {
            if (!t || !t.advanced || !t.advanced.length) return t;
            const out = { ...t };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const a of out.advanced) extras.push(renderNode(a));
            delete out.advanced;
            if (Array.isArray(t._extras) || !t._extras) out._extras = extras;
            else out._extras = { ...t._extras, children: extras };
            return out;
        }

        return {
            parseNode, renderNode, isAdvancedName,
            hydrateTable, dehydrateTable,
            ADV_NAMES
        };
    }
};
