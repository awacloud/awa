// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML structural elements — runs, hyperlinks,
 * paragraphs, tables, and section properties.
 *
 * Each structural element has a `parse<Name>` and `render<Name>` pair that
 * round-trip the XML. Unknown children of containers are preserved in
 * `_extras` so future additions can layer on without losing fidelity.
 *
 * **Document model** :
 *
 * ```js
 * document := { type: 'document',
 *               body: [paragraph | table],
 *               sectPr?: SectionProperties }
 *
 * paragraph := { type: 'paragraph',
 *                pPr?: ParagraphProperties,
 *                children: [run | hyperlink],
 *                _extras?: [xmlNode] }
 *
 * run := { type: 'run',
 *          rPr?: RunProperties,
 *          children: [textRun | breakRun | tabRun] }
 *
 * textRun := { type: 'text', value: string }
 * breakRun := { type: 'break', kind?: 'page'|'column'|'line' }
 * tabRun  := { type: 'tab' }
 *
 * hyperlink := { type: 'hyperlink',
 *                rId?: string, anchor?: string,
 *                target?: string, external?: boolean,
 *                children: [run] }
 *                // target / external: set by docx.read when the rId resolves
 *                // in the node's part, consumed by docx.write
 *
 * table := { type: 'table',
 *            tblPr?: TableProperties,   // typed: style, width, borders, cellMargins
 *                                       // (see docxProperties; the rest of
 *                                       // <w:tblPr> lives in tblPr._extras)
 *            _extras?: [xmlNode],       // <w:tblGrid> etc., verbatim
 *            rows: [{ type: 'row',
 *                     cells: [{ type: 'cell',
 *                               children: [paragraph|table] }] }] }
 * ```
 *
 * @module ooxml/docx/structure
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { docxProperties } from './properties.js';
import { docxDrawing } from './drawing.js';
import { ooxmlMath } from '../math/math.js';

export const docxStructure = {
    name: 'docxStructure',
    dependencies: ['xml', 'docxProperties', 'docxDrawing', 'ooxmlMath'],
    deps: [xml, docxProperties, docxDrawing, ooxmlMath],

    factory(xml, props, drawingMod, mathMod) {
        // --- Run children: text, break, tab, references, deletion text ---

        function parseRunChildren(rEl) {
            const out = [];
            for (const c of rEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:t':
                        out.push({ type: 'text', value: xml.textContent(c) });
                        break;
                    case 'w:delText':
                        // Used inside <w:del> — same payload, different element.
                        out.push({ type: 'delText', value: xml.textContent(c) });
                        break;
                    case 'w:br': {
                        const kind = c.attrs['w:type'];
                        out.push(kind ? { type: 'break', kind } : { type: 'break' });
                        break;
                    }
                    case 'w:tab':
                        out.push({ type: 'tab' });
                        break;
                    case 'w:noBreakHyphen':
                        out.push({ type: 'noBreakHyphen' });
                        break;
                    case 'w:softHyphen':
                        out.push({ type: 'softHyphen' });
                        break;
                    case 'w:commentReference':
                        out.push({ type: 'commentReference', id: c.attrs['w:id'] });
                        break;
                    case 'w:footnoteReference':
                        out.push({ type: 'footnoteReference', id: c.attrs['w:id'] });
                        break;
                    case 'w:endnoteReference':
                        out.push({ type: 'endnoteReference', id: c.attrs['w:id'] });
                        break;
                    case 'w:drawing':
                        out.push(drawingMod.parseDrawing(c));
                        break;
                    case 'w:fldChar': {
                        const f = { type: 'fldChar',
                                     kind: c.attrs['w:fldCharType'] };
                        if (c.attrs['w:dirty'])
                            f.dirty = c.attrs['w:dirty'] === '1';
                        out.push(f);
                        break;
                    }
                    case 'w:instrText':
                        out.push({ type: 'instrText',
                                    value: xml.textContent(c) });
                        break;
                    case 'w:rPr':
                        // handled at run level
                        break;
                    default:
                        out.push({ type: 'unknown', node: c });
                }
            }
            return out;
        }

        function renderRunChildren(children) {
            const out = [];
            for (const ch of children || []) {
                switch (ch.type) {
                    case 'text':
                        out.push(xml.el('w:t', { 'xml:space': 'preserve' },
                            [xml.text(ch.value || '')]));
                        break;
                    case 'delText':
                        out.push(xml.el('w:delText', { 'xml:space': 'preserve' },
                            [xml.text(ch.value || '')]));
                        break;
                    case 'break':
                        out.push(ch.kind
                            ? xml.el('w:br', { 'w:type': ch.kind })
                            : xml.el('w:br', {}));
                        break;
                    case 'tab':
                        out.push(xml.el('w:tab', {}));
                        break;
                    case 'noBreakHyphen':
                        out.push(xml.el('w:noBreakHyphen', {}));
                        break;
                    case 'softHyphen':
                        out.push(xml.el('w:softHyphen', {}));
                        break;
                    case 'commentReference':
                        out.push(xml.el('w:commentReference', { 'w:id': String(ch.id) }));
                        break;
                    case 'footnoteReference':
                        out.push(xml.el('w:footnoteReference', { 'w:id': String(ch.id) }));
                        break;
                    case 'endnoteReference':
                        out.push(xml.el('w:endnoteReference', { 'w:id': String(ch.id) }));
                        break;
                    case 'drawing':
                        out.push(drawingMod.renderDrawing(ch));
                        break;
                    case 'fldChar': {
                        const a = { 'w:fldCharType': ch.kind };
                        if (ch.dirty) a['w:dirty'] = '1';
                        out.push(xml.el('w:fldChar', a));
                        break;
                    }
                    case 'instrText':
                        out.push(xml.el('w:instrText',
                            { 'xml:space': 'preserve' },
                            [xml.text(ch.value || '')]));
                        break;
                    case 'unknown':
                        if (ch.node) out.push(ch.node);
                        break;
                }
            }
            return out;
        }

        // --- Run ---

        function parseRun(rEl) {
            const rPrEl = xml.findChild(rEl, 'w:rPr');
            const rPr = props.parseRunProperties(rPrEl);
            return {
                type: 'run',
                ...(rPr ? { rPr } : {}),
                children: parseRunChildren(rEl)
            };
        }

        function renderRun(run) {
            const children = [];
            const rPrEl = props.renderRunProperties(run.rPr);
            if (rPrEl) children.push(rPrEl);
            children.push(...renderRunChildren(run.children));
            return xml.el('w:r', {}, children);
        }

        // --- Hyperlink ---
        // <w:hyperlink r:id="rIdN"> or <w:hyperlink w:anchor="bookmark"> wraps runs.

        function parseHyperlink(hEl) {
            const out = { type: 'hyperlink', children: [] };
            if (hEl.attrs['r:id'])     out.rId = hEl.attrs['r:id'];
            if (hEl.attrs['w:anchor']) out.anchor = hEl.attrs['w:anchor'];
            for (const c of hEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:r') out.children.push(parseRun(c));
            }
            return out;
        }

        function renderHyperlink(h) {
            const attrs = {};
            if (h.rId)    attrs['r:id'] = h.rId;
            if (h.anchor) attrs['w:anchor'] = h.anchor;
            return xml.el('w:hyperlink', attrs,
                (h.children || []).map(renderRun));
        }

        // --- Structured Document Tags (SDT, content controls) ---
        // ECMA-376 §17.5.2. <w:sdt> can wrap inline content (in a
        // paragraph) or block content (at body level). The content model
        // differs (runs vs. paragraphs/tables) but the wrapper is
        // identical.

        /**
         * CT_OnOff truth value (ECMA-376 `ST_OnOff`): an absent `w:val`,
         * `1`, `true` and `on` all mean on.
         */
        function isOn(val) {
            return val == null || val === '1' || val === 'true' || val === 'on';
        }

        function parseSdtProperties(pPrEl) {
            if (!pPrEl) return undefined;
            const out = {};
            const extras = [];
            for (const c of pPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:alias':         out.alias = c.attrs['w:val']; break;
                    case 'w:tag':           out.tag = c.attrs['w:val']; break;
                    case 'w:id':            out.id = Number(c.attrs['w:val']); break;
                    case 'w:showingPlcHdr': out.showingPlcHdr = true; break;
                    case 'w:dataBinding': {
                        const db = {};
                        if (c.attrs['w:xpath']) db.xpath = c.attrs['w:xpath'];
                        if (c.attrs['w:prefixMappings']) db.prefixMappings = c.attrs['w:prefixMappings'];
                        if (c.attrs['w:storeItemID']) db.storeItemID = c.attrs['w:storeItemID'];
                        out.dataBinding = db;
                        break;
                    }
                    case 'w:text':          out.kind = 'text'; break;
                    case 'w:richText':      out.kind = 'richText'; break;
                    case 'w:dropDownList':  out.kind = 'dropDownList'; out._kindNode = c; break;
                    case 'w:comboBox':      out.kind = 'comboBox'; out._kindNode = c; break;
                    case 'w:date':          out.kind = 'date'; out._kindNode = c; break;
                    case 'w:checkbox':      out.kind = 'checkbox'; out._kindNode = c; break;
                    case 'w:picture':       out.kind = 'picture'; break;
                    // Repeating sections are a Word 2012 extension
                    // ([MS-DOCX] 2.5.1.10 / 2.5.1.11 / 2.5.3.8): the
                    // title and the insert/delete lock are CHILD
                    // elements of <w15:repeatingSection>.
                    case 'w15:repeatingSection': {
                        out.kind = 'repeatingSection';
                        for (const g of c.children || []) {
                            if (g.type !== 'element') continue;
                            if (g.name === 'w15:sectionTitle'
                                && g.attrs['w:val'] != null) {
                                out.sectionTitle = g.attrs['w:val'];
                            } else if (g.name === 'w15:doNotAllowInsertDeleteSection'
                                && isOn(g.attrs['w:val'])) {
                                out.doNotAllowInsertDeleteSection = true;
                            }
                        }
                        break;
                    }
                    case 'w15:repeatingSectionItem':
                        out.kind = 'repeatingSectionItem';
                        break;
                    // Legacy main-namespace form this module wrote before
                    // it emitted the w15 elements: still read.
                    case 'w:repeatingSection':
                        out.kind = 'repeatingSection';
                        if (c.attrs['w:sectionTitle']) {
                            out.sectionTitle = c.attrs['w:sectionTitle'];
                        }
                        break;
                    case 'w:repeatingSectionItem':
                        out.kind = 'repeatingSectionItem';
                        break;
                    default:                extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderSdtProperties(props) {
            if (!props) return null;
            const children = [];
            if (props.alias != null)
                children.push(xml.el('w:alias', { 'w:val': props.alias }));
            if (props.tag != null)
                children.push(xml.el('w:tag', { 'w:val': props.tag }));
            if (props.id != null)
                children.push(xml.el('w:id', { 'w:val': String(props.id) }));
            if (props.showingPlcHdr)
                children.push(xml.el('w:showingPlcHdr', {}));
            if (props.dataBinding) {
                const a = {};
                if (props.dataBinding.prefixMappings)
                    a['w:prefixMappings'] = props.dataBinding.prefixMappings;
                if (props.dataBinding.xpath)
                    a['w:xpath'] = props.dataBinding.xpath;
                if (props.dataBinding.storeItemID)
                    a['w:storeItemID'] = props.dataBinding.storeItemID;
                children.push(xml.el('w:dataBinding', a));
            }
            if (props.kind === 'text')         children.push(xml.el('w:text', {}));
            else if (props.kind === 'richText') children.push(xml.el('w:richText', {}));
            else if (props.kind === 'picture')  children.push(xml.el('w:picture', {}));
            else if (props.kind === 'repeatingSection') {
                // Schema order: sectionTitle, then the lock.
                const rs = [];
                if (props.sectionTitle) {
                    rs.push(xml.el('w15:sectionTitle',
                        { 'w:val': props.sectionTitle }));
                }
                if (props.doNotAllowInsertDeleteSection) {
                    rs.push(xml.el('w15:doNotAllowInsertDeleteSection', {}));
                }
                children.push(xml.el('w15:repeatingSection', {}, rs));
            }
            else if (props.kind === 'repeatingSectionItem') {
                children.push(xml.el('w15:repeatingSectionItem', {}));
            }
            else if (props._kindNode)           children.push(props._kindNode);
            if (props._extras) for (const ex of props._extras) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:sdtPr', {}, children);
        }

        function parseSdt(sdtEl, isBlock) {
            const sdtPrEl = xml.findChild(sdtEl, 'w:sdtPr');
            const sdtContentEl = xml.findChild(sdtEl, 'w:sdtContent');
            const out = { type: isBlock ? 'blockSdt' : 'sdt', children: [] };
            const props = parseSdtProperties(sdtPrEl);
            if (props) out.properties = props;
            if (sdtContentEl) {
                if (isBlock) {
                    // Body-level content : paragraphs, tables, nested sdt.
                    for (const c of sdtContentEl.children) {
                        if (c.type !== 'element') continue;
                        if (c.name === 'w:p')          out.children.push(parseParagraph(c));
                        else if (c.name === 'w:tbl')   out.children.push(parseTable(c));
                        else if (c.name === 'w:sdt')   out.children.push(parseSdt(c, true));
                    }
                } else {
                    // Inline content : runs, hyperlinks, nested sdt.
                    for (const c of sdtContentEl.children) {
                        if (c.type !== 'element') continue;
                        if (c.name === 'w:r')           out.children.push(parseRun(c));
                        else if (c.name === 'w:hyperlink') out.children.push(parseHyperlink(c));
                        else if (c.name === 'w:sdt')    out.children.push(parseSdt(c, false));
                    }
                }
            }
            return out;
        }

        function renderSdt(sdt) {
            const sdtChildren = [];
            const propsEl = renderSdtProperties(sdt.properties);
            if (propsEl) sdtChildren.push(propsEl);
            const isBlock = sdt.type === 'blockSdt';
            const contentChildren = [];
            for (const c of sdt.children || []) {
                if (isBlock) {
                    if (c.type === 'paragraph')      contentChildren.push(renderParagraph(c));
                    else if (c.type === 'table')     contentChildren.push(renderTable(c));
                    else if (c.type === 'blockSdt')  contentChildren.push(renderSdt(c));
                } else {
                    if (c.type === 'run')             contentChildren.push(renderRun(c));
                    else if (c.type === 'hyperlink')  contentChildren.push(renderHyperlink(c));
                    else if (c.type === 'sdt')        contentChildren.push(renderSdt(c));
                }
            }
            sdtChildren.push(xml.el('w:sdtContent', {}, contentChildren));
            return xml.el('w:sdt', {}, sdtChildren);
        }

        // --- Paragraph ---

        function parseParagraph(pEl) {
            const pPrEl = xml.findChild(pEl, 'w:pPr');
            const pPr = props.parseParagraphProperties(pPrEl);
            const children = [];
            const extras = [];
            for (const c of pEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:pPr') continue;
                switch (c.name) {
                    case 'w:r':
                        children.push(parseRun(c));
                        break;
                    case 'w:hyperlink':
                        children.push(parseHyperlink(c));
                        break;
                    case 'w:bookmarkStart':
                        children.push({
                            type: 'bookmarkStart',
                            id: c.attrs['w:id'],
                            name: c.attrs['w:name']
                        });
                        break;
                    case 'w:bookmarkEnd':
                        children.push({ type: 'bookmarkEnd', id: c.attrs['w:id'] });
                        break;
                    case 'w:commentRangeStart':
                        children.push({ type: 'commentRangeStart', id: c.attrs['w:id'] });
                        break;
                    case 'w:commentRangeEnd':
                        children.push({ type: 'commentRangeEnd', id: c.attrs['w:id'] });
                        break;
                    case 'w:ins':
                        children.push(parseRevision(c, 'ins'));
                        break;
                    case 'w:del':
                        children.push(parseRevision(c, 'del'));
                        break;
                    case 'w:sdt':
                        children.push(parseSdt(c, false));
                        break;
                    case 'm:oMath':
                        children.push(mathMod.parseOMath(c));
                        break;
                    case 'w:fldSimple': {
                        const f = {
                            type: 'fldSimple',
                            instr: c.attrs['w:instr'] || '',
                            children: []
                        };
                        if (c.attrs['w:dirty'])
                            f.dirty = c.attrs['w:dirty'] === '1';
                        for (const cc of c.children) {
                            if (cc.type !== 'element') continue;
                            if (cc.name === 'w:r')         f.children.push(parseRun(cc));
                            else if (cc.name === 'w:hyperlink') f.children.push(parseHyperlink(cc));
                        }
                        children.push(f);
                        break;
                    }
                    default:
                        extras.push(c);
                }
            }
            const out = { type: 'paragraph', children };
            if (pPr) out.pPr = pPr;
            if (extras.length) out._extras = extras;
            return out;
        }

        // <w:ins> / <w:del> — tracked change wrappers around runs.
        // ECMA-376 part 1 §17.13.5.10–12.
        function parseRevision(el, kind) {
            const out = {
                type: kind,
                id: el.attrs['w:id'],
                children: []
            };
            if (el.attrs['w:author']) out.author = el.attrs['w:author'];
            if (el.attrs['w:date'])   out.date = el.attrs['w:date'];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:r') out.children.push(parseRun(c));
            }
            return out;
        }

        function renderRevision(rev) {
            const attrs = {};
            if (rev.id != null)  attrs['w:id'] = String(rev.id);
            if (rev.author)      attrs['w:author'] = rev.author;
            if (rev.date)        attrs['w:date'] = rev.date;
            const tag = rev.type === 'del' ? 'w:del' : 'w:ins';
            return xml.el(tag, attrs, (rev.children || []).map(renderRun));
        }

        function renderParagraph(p) {
            const children = [];
            const pPrEl = props.renderParagraphProperties(p.pPr);
            if (pPrEl) children.push(pPrEl);
            for (const c of p.children || []) {
                switch (c.type) {
                    case 'run':       children.push(renderRun(c)); break;
                    case 'hyperlink': children.push(renderHyperlink(c)); break;
                    case 'ins':
                    case 'del':       children.push(renderRevision(c)); break;
                    case 'sdt':       children.push(renderSdt(c)); break;
                    case 'oMath':     children.push(mathMod.renderOMath(c)); break;
                    case 'fldSimple': {
                        const a = { 'w:instr': c.instr || '' };
                        if (c.dirty) a['w:dirty'] = '1';
                        const inner = (c.children || []).map(ch => {
                            if (ch.type === 'run') return renderRun(ch);
                            if (ch.type === 'hyperlink') return renderHyperlink(ch);
                            return null;
                        }).filter(Boolean);
                        children.push(xml.el('w:fldSimple', a, inner));
                        break;
                    }
                    case 'bookmarkStart': {
                        const a = { 'w:id': String(c.id) };
                        if (c.name) a['w:name'] = c.name;
                        children.push(xml.el('w:bookmarkStart', a));
                        break;
                    }
                    case 'bookmarkEnd':
                        children.push(xml.el('w:bookmarkEnd', { 'w:id': String(c.id) }));
                        break;
                    case 'commentRangeStart':
                        children.push(xml.el('w:commentRangeStart', { 'w:id': String(c.id) }));
                        break;
                    case 'commentRangeEnd':
                        children.push(xml.el('w:commentRangeEnd', { 'w:id': String(c.id) }));
                        break;
                }
            }
            if (p._extras) for (const ex of p._extras) children.push(ex);
            return xml.el('w:p', {}, children);
        }

        // --- Table ---

        function parseCell(tcEl) {
            // <w:tc>: <w:tcPr/>?, then block-level content (paragraphs / nested tables)
            const tcPrEl = xml.findChild(tcEl, 'w:tcPr');
            const tcPr = tcPrEl ? parseCellProperties(tcPrEl) : undefined;
            const children = [];
            const extras = [];
            for (const c of tcEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tcPr') continue;
                if (c.name === 'w:p')        children.push(parseParagraph(c));
                else if (c.name === 'w:tbl') children.push(parseTable(c));
                else extras.push(c);
            }
            const out = { type: 'cell', children };
            if (tcPr) out.tcPr = tcPr;
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderCell(c) {
            const children = [];
            const tcPrEl = renderCellProperties(c.tcPr);
            if (tcPrEl) children.push(tcPrEl);
            for (const ch of c.children || []) {
                if (ch.type === 'paragraph') children.push(renderParagraph(ch));
                else if (ch.type === 'table') children.push(renderTable(ch));
            }
            if (c._extras) for (const ex of c._extras) children.push(ex);
            // A cell must contain at least one paragraph per ECMA-376.
            if (!children.some(n => n.name === 'w:p')) {
                children.push(xml.el('w:p', {}));
            }
            return xml.el('w:tc', {}, children);
        }

        function parseCellProperties(tcPrEl) {
            const out = {};
            const extras = [];
            for (const c of tcPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:tcW':
                        out.width = { w: c.attrs['w:w'], type: c.attrs['w:type'] };
                        break;
                    case 'w:gridSpan':
                        out.gridSpan = Number(c.attrs['w:val']);
                        break;
                    case 'w:vMerge':
                        out.vMerge = c.attrs['w:val'] || 'continue';
                        break;
                    default:
                        extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return Object.keys(out).length ? out : undefined;
        }

        function renderCellProperties(tcPr) {
            if (!tcPr) return null;
            const children = [];
            if (tcPr.width) {
                children.push(xml.el('w:tcW', {
                    'w:w': String(tcPr.width.w ?? ''),
                    'w:type': tcPr.width.type || 'dxa'
                }));
            }
            if (tcPr.gridSpan != null) {
                children.push(xml.el('w:gridSpan', { 'w:val': String(tcPr.gridSpan) }));
            }
            if (tcPr.vMerge) {
                children.push(tcPr.vMerge === 'continue'
                    ? xml.el('w:vMerge', {})
                    : xml.el('w:vMerge', { 'w:val': tcPr.vMerge }));
            }
            if (tcPr._extras) for (const ex of tcPr._extras) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:tcPr', {}, children);
        }

        function parseRow(trEl) {
            const cells = [];
            const extras = [];
            for (const c of trEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tc') cells.push(parseCell(c));
                else if (c.name === 'w:trPr') extras.push(c); // not modelled yet
                else extras.push(c);
            }
            const out = { type: 'row', cells };
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderRow(row) {
            const children = [];
            for (const c of row.cells || []) children.push(renderCell(c));
            if (row._extras) for (const ex of row._extras) children.push(ex);
            return xml.el('w:tr', {}, children);
        }

        function parseTable(tblEl) {
            const rows = [];
            const extras = [];
            const out = { type: 'table', rows };
            for (const c of tblEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tr') rows.push(parseRow(c));
                else if (c.name === 'w:tblPr') {
                    const tp = props.parseTableProperties(c);
                    if (tp !== undefined) out.tblPr = tp;
                    else extras.push(c); // childless tblPr — preserved verbatim
                }
                else extras.push(c); // tblGrid — preserved verbatim
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderTable(t) {
            const children = [];
            // Typed tblPr first, then any preserved tblGrid (both precede the rows).
            const tblPrEl = props.renderTableProperties(t.tblPr);
            if (tblPrEl) children.push(tblPrEl);
            if (t._extras) for (const ex of t._extras) children.push(ex);
            for (const r of t.rows || []) children.push(renderRow(r));
            return xml.el('w:tbl', {}, children);
        }

        // --- Section properties (page setup) ---
        // ECMA-376 part 1 §17.6 — `<w:sectPr>` lives at the end of <w:body>.

        const SECT_KNOWN = new Set([
            'w:pgSz', 'w:pgMar', 'w:type',
            'w:headerReference', 'w:footerReference',
            'w:titlePg'
        ]);

        function parseSection(sectPrEl) {
            const out = {};
            const extras = [];
            for (const c of sectPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:pgSz':
                        out.pageSize = {};
                        if (c.attrs['w:w']) out.pageSize.w = Number(c.attrs['w:w']);
                        if (c.attrs['w:h']) out.pageSize.h = Number(c.attrs['w:h']);
                        if (c.attrs['w:orient']) out.pageSize.orient = c.attrs['w:orient'];
                        break;
                    case 'w:pgMar':
                        out.pageMargin = {};
                        for (const k of ['top', 'right', 'bottom', 'left',
                                         'header', 'footer', 'gutter']) {
                            const a = c.attrs['w:' + k];
                            if (a != null) out.pageMargin[k] = Number(a);
                        }
                        break;
                    case 'w:type':
                        out.type = c.attrs['w:val'];
                        break;
                    case 'w:headerReference':
                        out.headerReferences = out.headerReferences || [];
                        out.headerReferences.push({
                            type: c.attrs['w:type'] || 'default',
                            rId: c.attrs['r:id']
                        });
                        break;
                    case 'w:footerReference':
                        out.footerReferences = out.footerReferences || [];
                        out.footerReferences.push({
                            type: c.attrs['w:type'] || 'default',
                            rId: c.attrs['r:id']
                        });
                        break;
                    case 'w:titlePg':
                        out.titlePg = true;
                        break;
                    default:
                        if (!SECT_KNOWN.has(c.name)) extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return Object.keys(out).length ? out : undefined;
        }

        function renderSection(sect) {
            if (!sect) return null;
            const children = [];
            // Header / footer references first per the schema.
            for (const ref of sect.headerReferences || []) {
                children.push(xml.el('w:headerReference',
                    { 'w:type': ref.type || 'default', 'r:id': ref.rId }));
            }
            for (const ref of sect.footerReferences || []) {
                children.push(xml.el('w:footerReference',
                    { 'w:type': ref.type || 'default', 'r:id': ref.rId }));
            }
            if (sect.type) {
                children.push(xml.el('w:type', { 'w:val': sect.type }));
            }
            if (sect.pageSize) {
                const a = {};
                if (sect.pageSize.w != null) a['w:w'] = String(sect.pageSize.w);
                if (sect.pageSize.h != null) a['w:h'] = String(sect.pageSize.h);
                if (sect.pageSize.orient) a['w:orient'] = sect.pageSize.orient;
                children.push(xml.el('w:pgSz', a));
            }
            if (sect.pageMargin) {
                const a = {};
                for (const k of ['top', 'right', 'bottom', 'left',
                                 'header', 'footer', 'gutter']) {
                    if (sect.pageMargin[k] != null) {
                        a['w:' + k] = String(sect.pageMargin[k]);
                    }
                }
                children.push(xml.el('w:pgMar', a));
            }
            if (sect.titlePg) {
                children.push(xml.el('w:titlePg', {}));
            }
            if (sect._extras) for (const ex of sect._extras) children.push(ex);
            if (!children.length) return null;
            return xml.el('w:sectPr', {}, children);
        }

        // --- Body dispatch ---

        function parseBody(bodyEl) {
            const body = [];
            let sectPr;
            const extras = [];
            for (const c of bodyEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:p':         body.push(parseParagraph(c)); break;
                    case 'w:tbl':       body.push(parseTable(c)); break;
                    case 'w:sdt':       body.push(parseSdt(c, true)); break;
                    case 'm:oMathPara': body.push(mathMod.parseOMathPara(c)); break;
                    case 'w:sectPr':    sectPr = parseSection(c); break;
                    default:            extras.push(c);
                }
            }
            return { body, sectPr, extras };
        }

        function renderBodyChildren(doc) {
            const children = [];
            for (const node of doc.body || []) {
                if (node.type === 'paragraph')      children.push(renderParagraph(node));
                else if (node.type === 'table')     children.push(renderTable(node));
                else if (node.type === 'blockSdt')  children.push(renderSdt(node));
                else if (node.type === 'oMathPara') children.push(mathMod.renderOMathPara(node));
            }
            if (doc._extras) for (const ex of doc._extras) children.push(ex);
            const sect = renderSection(doc.sectPr);
            if (sect) children.push(sect);
            return children;
        }

        return {
            parseRun, renderRun,
            parseHyperlink, renderHyperlink,
            parseParagraph, renderParagraph,
            parseTable, renderTable,
            parseRow, renderRow,
            parseCell, renderCell,
            parseSection, renderSection,
            parseSdt, renderSdt,
            parseSdtProperties, renderSdtProperties,
            parseBody, renderBodyChildren
        };
    }
};
