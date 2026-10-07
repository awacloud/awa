// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview OpenDocument Spreadsheet (.ods) reader/writer — orchestrator.
 *
 * Builds a minimal valid `.ods` from a typed spreadsheet tree:
 *
 * - `mimetype` (STORED) — `application/vnd.oasis.opendocument.spreadsheet`
 * - `META-INF/manifest.xml`
 * - `content.xml` — `<office:document-content>` → optional
 *   `<office:automatic-styles>` → `<office:body>` →
 *   `<office:spreadsheet>` → typed tables.
 * - `styles.xml`, `meta.xml`, `settings.xml` — minimal
 *
 * Result of `read()` :
 *
 * ```js
 * { mimetype, spreadsheet: { tables, … }, automaticStyles?, meta?, settings?, styles?, package }
 * ```
 *
 * **Round-trip.** `write(read(x))` carries what the model does not
 * regenerate: every part of `doc.package` other than `content.xml` and the
 * three sidecars is re-emitted byte-for-byte with the media type the source
 * manifest declared (`application/octet-stream` when it declared none),
 * and the source manifest's directory entries are re-declared. The
 * sidecars come from `opts.*`, else `doc.meta` / `doc.settings` /
 * `doc.styles`, else an empty model; `meta:generator` is rewritten to this
 * library unless `opts.meta.generator` is given. Precedence: a regenerated
 * part always wins, then a part the writer supplied, then the carried
 * copy. Delete from `doc.package.parts` (or delete `doc.package`) to drop
 * carried material.
 *
 * @module odf/ods/ods
 */

import { odfErrors } from '../errors.js';
import { odfShared } from '../_shared/index.js';
import { pkgPackage } from '../pkg/package.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { pkgMimetype } from '../pkg/mimetype.js';
import { pkgManifest } from '../pkg/manifest.js';
import { odfMeta } from '../meta/meta.js';
import { odfSettings } from '../settings/settings.js';
import { odfStyles } from '../style/styles.js';
import { spreadsheet } from './spreadsheet.js';
import { styleAutomatic } from '../style/automaticStyles.js';
import { tableTable } from '../table/table.js';
import { tableRow } from '../table/row.js';
import { tableCell } from '../table/cell.js';
import { textParagraph } from '../text/paragraph.js';
import { odsWalker } from './ods-walker.js';

export const ods = {
    name: 'ods',
    dependencies: [
        'odfErrors', 'odfShared',
        'pkgPackage', 'xml', 'pkgMimetype', 'pkgManifest',
        'odfMeta', 'odfSettings', 'odfStyles',
        'spreadsheet', 'styleAutomatic',
        'tableTable', 'tableRow', 'tableCell', 'textParagraph', 'odsWalker'
    ],
    deps: [odfErrors, odfShared, pkgPackage, xml, pkgMimetype, pkgManifest, odfMeta, odfSettings, odfStyles, spreadsheet, styleAutomatic, tableTable, tableRow, tableCell, textParagraph, odsWalker],

    factory(errors, shared, pkg, xml, mimetypeMod, manifestMod, metaMod, settingsMod, stylesMod,
            spreadsheetMod, automaticMod, tableMod, rowMod, cellMod, paraMod, walkerMod) {
        const { ParseError, ContractError } = errors;
        const { ODF_NS, ODF_VERSION, CT, encodeText,
                parseXmlOrThrow, readSidecars, writeSidecars, carryParts,
                sourceNamespaces, declareNamespaces } = shared;
        // unused-dep guards (referenced for runtime registration only)
        void mimetypeMod;

        const CT_ODS = CT.ODS;
        const CT_XML = CT.XML;

        const walker = walkerMod.createWalker();

        /**
         * Read a `.ods` byte stream into a typed document model.
         *
         * @param {Uint8Array} bytes
         * @param {object} [opts] forwarded to pkgPackage.read — { maxParts?, maxUncompressed?, maxRatio? }
         * @returns {object}
         */
        function read(bytes, opts) {
            const p = pkg.read(bytes, opts);
            if (p.mimetype !== CT_ODS) {
                throw new ParseError('odf/parse-error/ods',
                    `ods: unexpected mimetype "${p.mimetype}"`,
                    { context: { expected: CT_ODS, module: 'ods' } });
            }
            const contentBytes = p.parts['content.xml'];
            if (!contentBytes) {
                throw new ParseError('odf/parse-error/ods',
                    'ods: missing content.xml',
                    { context: { part: 'content.xml', module: 'ods' } });
            }
            const parsed = parseContent(shared.decodeText(contentBytes));

            const result = {
                mimetype: p.mimetype,
                spreadsheet: parsed.spreadsheet,
                package: p
            };
            if (parsed.automaticStyles) result.automaticStyles = parsed.automaticStyles;

            readSidecars(result, p, { metaMod, settingsMod, stylesMod });
            walker.applyHydrate(result);
            return result;
        }

        function parseContent(xmlString) {
            const root = parseXmlOrThrow(xmlString, 'ods',
                { part: 'content.xml', module: 'ods' });
            if (root.name !== 'office:document-content') {
                throw new ParseError('odf/parse-error/ods',
                    `ods: unexpected content root <${root.name}>`,
                    { context: { part: 'content.xml', module: 'ods' } });
            }
            const autoEl = xml.findChild(root, 'office:automatic-styles');
            const bodyEl = xml.findChild(root, 'office:body');
            if (!bodyEl) throw new ParseError('odf/parse-error/ods',
                'ods: missing <office:body> in content.xml',
                { context: { part: 'content.xml', module: 'ods' } });
            const ssEl = xml.findChild(bodyEl, 'office:spreadsheet');
            const sheet = ssEl ? spreadsheetMod.parseSpreadsheet(ssEl) : spreadsheetMod.empty();
            const out = { spreadsheet: sheet };
            if (autoEl) out.automaticStyles = automaticMod.parse(autoEl);
            return out;
        }

        /**
         * Write a typed document tree to `.ods` bytes.
         *
         * @param {object} doc
         * @param {object} [opts]
         * @returns {Uint8Array}
         */
        function write(doc, opts) {
            if (!doc) {
                throw new ContractError('odf/contract-error/ods',
                    'ods: write needs a document',
                    { context: { module: 'ods', argument: 'doc' } });
            }
            opts = opts || {};
            if (walker.hasExtensions) {
                const dehydrated = {
                    spreadsheet: doc.spreadsheet,
                    meta: opts.meta || doc.meta,
                    settings: opts.settings || doc.settings,
                    styles: opts.styles || doc.styles
                };
                walker.applyDehydrate(dehydrated);
                if (dehydrated.spreadsheet !== undefined) doc = { ...doc, spreadsheet: dehydrated.spreadsheet };
                if (dehydrated.meta !== undefined) opts = { ...opts, meta: dehydrated.meta };
                if (dehydrated.settings !== undefined) opts = { ...opts, settings: dehydrated.settings };
                if (dehydrated.styles !== undefined) opts = { ...opts, styles: dehydrated.styles };
            }
            const p = pkg.empty(CT_ODS);

            const contentXml = renderContent(doc);
            pkg.setPart(p, 'content.xml', encodeText(contentXml), CT_XML);

            writeSidecars(p, doc, opts,
                { pkg, metaMod, settingsMod, stylesMod }, CT_XML);

            carryParts(p, doc.package, { pkg, manifestMod });

            return pkg.write(p);
        }

        function renderContent(doc) {
            const sheet = doc.spreadsheet || { tables: doc.tables || [] };
            const ssEl = spreadsheetMod.renderSpreadsheet(sheet);
            const bodyEl = xml.el('office:body', {}, [ssEl]);
            const children = [];
            if (doc.automaticStyles) {
                children.push(automaticMod.render(doc.automaticStyles));
            }
            children.push(bodyEl);
            const root = xml.el('office:document-content', {
                'xmlns:office': ODF_NS.OFFICE,
                'xmlns:text':   ODF_NS.TEXT,
                'xmlns:style':  ODF_NS.STYLE,
                'xmlns:table':  ODF_NS.TABLE,
                'xmlns:draw':   ODF_NS.DRAW,
                'xmlns:fo':     ODF_NS.FO,
                'xmlns:svg':    ODF_NS.SVG,
                'xmlns:number': ODF_NS.NUMBER,
                'xmlns:of':     ODF_NS.OF,
                'xmlns:xlink':  ODF_NS.XLINK,
                'office:version': ODF_VERSION
            }, children);
            declareNamespaces(root, { carried: sourceNamespaces(doc.package, 'content.xml'),
                part: 'content.xml', module: 'ods' });
            return xml.serialize(root);
        }

        // --- Convenience helpers ---

        function empty() {
            return { spreadsheet: { tables: [sheet('Sheet1', [])] } };
        }

        /**
         * Build a `{ type: 'table', name, rows }` from a 2-D array of
         * primitives (or pre-built cell models).
         *
         * @param {string} name
         * @param {Array<Array<*>>} rows
         * @returns {object}
         */
        function sheet(name, rows) {
            const out = { type: 'table', name, columns: [], rows: [] };
            for (const r of rows || []) {
                out.rows.push({ type: 'row', cells: (r || []).map(v => cell(v)) });
            }
            return out;
        }

        /**
         * Build a document from a list of sheets. Each sheet is either a
         * pre-built table model or `{ name, rows }`.
         */
        function fromArrays(sheets) {
            const tables = [];
            for (const s of sheets || []) {
                if (s && s.type === 'table') tables.push(s);
                else if (s) tables.push(sheet(s.name || 'Sheet', s.rows || []));
            }
            return { spreadsheet: { tables } };
        }

        /**
         * Build a single cell from a JS primitive (or pass-through model).
         *
         * @param {*} value
         * @param {object} [opts]
         * @returns {object}
         */
        function cell(value, opts) {
            if (value && typeof value === 'object' && value.type === 'cell') return value;
            opts = opts || {};
            const c = { type: 'cell', children: [] };
            if (value == null || value === '') return c;
            if (typeof value === 'number' && Number.isFinite(value)) {
                c.valueType = 'float';
                c.value = String(value);
                c.children.push(paraMod.renderParagraph(paraMod.paragraph(String(value))));
            } else if (typeof value === 'boolean') {
                c.valueType = 'boolean';
                c.value = value ? 'true' : 'false';
                c.children.push(paraMod.renderParagraph(paraMod.paragraph(value ? 'TRUE' : 'FALSE')));
            } else if (value instanceof Date) {
                c.valueType = 'date';
                c.value = value.toISOString().slice(0, 19);
                c.children.push(paraMod.renderParagraph(paraMod.paragraph(c.value)));
            } else {
                c.valueType = 'string';
                c.value = String(value);
                c.children.push(paraMod.renderParagraph(paraMod.paragraph(String(value))));
            }
            if (opts.styleName) c.styleName = opts.styleName;
            if (opts.formula) c.formula = opts.formula;
            return c;
        }

        /** Concat the visible text of every sheet, tab-separated cells, one row per line. */
        function toText(doc) {
            const lines = [];
            const tables = (doc && doc.spreadsheet && doc.spreadsheet.tables) || [];
            for (const t of tables) {
                for (const r of t.rows || []) {
                    const cells = (r.cells || []).map(c => c.value != null ? String(c.value) : '');
                    lines.push(cells.join('\t'));
                }
            }
            return lines.join('\n');
        }

        // unused dep guards (referenced for runtime registration only)
        void tableMod; void rowMod; void cellMod;

        const api = {
            read, write, empty, sheet, fromArrays, cell, toText, CT_ODS,
            use(...extensions) { walker.use(...extensions); return api; },
            get hasExtensions() { return walker.hasExtensions; }
        };
        return api;
    }
};
