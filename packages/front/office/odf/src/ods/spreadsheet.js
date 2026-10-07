// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Parse/render `<office:spreadsheet>` — the body element
 * of an `.ods` `content.xml`.
 *
 * Model:
 *
 * ```js
 * {
 *   tables: [ ...tableModel ],
 *   namedExpressions?: [ ...rawXmlElements ],
 *   dataValidations?: [ ...rawXmlElements ],
 *   _extras?: { children: [ ...rawXmlElements ] }
 * }
 * ```
 *
 * Only tables are typed — `table:named-expressions` and
 * `table:content-validations` are preserved as raw XML.
 *
 * @module odf/ods/spreadsheet
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { tableTable } from '../table/table.js';

export const spreadsheet = {
    name: 'spreadsheet',
    dependencies: ['xml', 'tableTable'],
    deps: [xml, tableTable],

    factory(xml, tableMod) {

        /**
         * Parse an `<office:spreadsheet>` element.
         *
         * @param {object} el
         * @returns {object}
         */
        function parseSpreadsheet(el) {
            const out = { tables: [] };
            const extras = [];
            for (const c of el && el.children || []) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'table:table':
                        out.tables.push(tableMod.parseTable(c));
                        break;
                    case 'table:named-expressions': {
                        const kids = [];
                        for (const k of c.children || []) {
                            if (k.type === 'element') kids.push(k);
                        }
                        out.namedExpressions = kids;
                        break;
                    }
                    case 'table:content-validations': {
                        const kids = [];
                        for (const k of c.children || []) {
                            if (k.type === 'element') kids.push(k);
                        }
                        out.dataValidations = kids;
                        break;
                    }
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = { children: extras };
            return out;
        }

        /**
         * Render a spreadsheet model to an `<office:spreadsheet>` element.
         *
         * @param {object} s
         * @returns {object}
         */
        function renderSpreadsheet(s) {
            const children = [];
            if (s.namedExpressions && s.namedExpressions.length) {
                children.push(xml.el('table:named-expressions', {},
                    s.namedExpressions.slice()));
            }
            if (s.dataValidations && s.dataValidations.length) {
                children.push(xml.el('table:content-validations', {},
                    s.dataValidations.slice()));
            }
            for (const t of s.tables || []) {
                children.push(tableMod.renderTable(t));
            }
            if (s._extras && s._extras.children) {
                for (const c of s._extras.children) children.push(c);
            }
            return xml.el('office:spreadsheet', {}, children);
        }

        function empty() { return { tables: [] }; }

        return { parseSpreadsheet, renderSpreadsheet, empty };
    }
};
