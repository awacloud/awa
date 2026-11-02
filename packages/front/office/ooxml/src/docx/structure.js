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
 *                tgtFrame?, tooltip?, docLocation?: string,
 *                history?: boolean,     // w:history, ST_OnOff
 *                target?: string, external?: boolean,
 *                children: [inline],     // typed like a paragraph's
 *                _extras?: [xmlNode] }   // any other child, verbatim
 *                // target / external: set by docx.read when the rId resolves
 *                // in the node's part, consumed by docx.write
 *
 * table := { type: 'table',
 *            tblPr?: TableProperties,   // typed: style, width, borders, cellMargins
 *                                       // (see docxProperties; the rest of
 *                                       // <w:tblPr> lives in tblPr._extras)
 *            _extras?: [xmlNode],       // <w:tblGrid> etc., verbatim
 *            rows: [{ type: 'row',
 *                     sdt?: [SdtWrapper],  // the content controls around it
 *                     cells: [{ type: 'cell',
 *                               sdt?: [SdtWrapper],
 *                               children: [paragraph|table|marker] }] }] }
 *
 * marker := bookmarkStart | bookmarkEnd | commentRangeStart
 *         | commentRangeEnd | rangeMarker   // inline, or between blocks
 * bookmarkStart := { type: 'bookmarkStart', id, name?,
 *                    colFirst?, colLast?: number, displacedByCustomXml? }
 * bookmarkEnd | commentRangeStart | commentRangeEnd
 *              := { type, id, displacedByCustomXml? }
 *
 * SdtWrapper := { group: number,          // unique within the row / table
 *                 properties?: SdtProperties,
 *                 _extras?: [xmlNode],    // <w:sdtEndPr>, verbatim
 *                 _contentExtras?: [xmlNode] }
 * ```
 *
 * A cell inside a row-level `w:sdt` (CT_SdtCell), or a row inside a
 * table-level one (CT_SdtRow), is read in place among its siblings and
 * carries `sdt`, the controls around it, outermost first; the write puts
 * consecutive items of one control back inside one `w:sdt`.
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
        // Schema order (ECMA-376 Part 1); a hand-wired docxProperties without
        // the ordering helper writes children in the old order.
        const orderSeq = props.sequence ? props.sequence : () => null;
        const ordered = (children, seq) => (seq && props.orderBySequence ? props.orderBySequence(children, seq) : children);
        const SECT_SEQ = orderSeq([
            ['w:headerReference', 'w:footerReference'], 'w:footnotePr', 'w:endnotePr', 'w:type',
            'w:pgSz', 'w:pgMar', 'w:paperSrc', 'w:pgBorders', 'w:lnNumType', 'w:pgNumType',
            'w:cols', 'w:formProt', 'w:vAlign', 'w:noEndnote', 'w:titlePg', 'w:textDirection',
            'w:bidi', 'w:rtlGutter', 'w:docGrid', 'w:printerSettings', 'w:sectPrChange'
        ]);
        const TCPR_SEQ = orderSeq([
            'w:cnfStyle', 'w:tcW', 'w:gridSpan', 'w:hMerge', 'w:vMerge', 'w:tcBorders', 'w:shd',
            'w:noWrap', 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark',
            'w:headers', 'w:cellIns', 'w:cellDel', 'w:cellMerge', 'w:tcPrChange'
        ]);
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
                        const br = kind ? { type: 'break', kind } : { type: 'break' };
                        if (c.attrs['w:clear'] != null) br.clear = c.attrs['w:clear'];
                        out.push(br);
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
                    case 'w:endnoteReference': {
                        const ref = { type: c.name.slice(2), id: c.attrs['w:id'] };
                        if (c.attrs['w:customMarkFollows'] != null) ref.customMarkFollows = isOn(c.attrs['w:customMarkFollows']);
                        out.push(ref);
                        break;
                    }
                    case 'w:drawing':
                        out.push(drawingMod.parseDrawing(c));
                        break;
                    case 'w:fldChar': {
                        const f = { type: 'fldChar',
                                     kind: c.attrs['w:fldCharType'] };
                        if (c.attrs['w:dirty'])
                            f.dirty = c.attrs['w:dirty'] === '1';
                        if (c.attrs['w:fldLock'] !== undefined && isOn(c.attrs['w:fldLock']))
                            f.fldLock = true;
                        // `w:ffData` / `w:fldData` / `w:numberingChange`, verbatim.
                        const kept = c.children.filter(k => k.type === 'element');
                        if (kept.length) f._extras = kept;
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
                    case 'break': {
                        const a = ch.kind ? { 'w:type': ch.kind } : {};
                        if (ch.clear != null) a['w:clear'] = String(ch.clear);
                        out.push(xml.el('w:br', a));
                        break;
                    }
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
                    case 'endnoteReference': {
                        const a = {};
                        if (ch.customMarkFollows != null) a['w:customMarkFollows'] = ch.customMarkFollows ? '1' : '0';
                        a['w:id'] = String(ch.id);
                        out.push(xml.el('w:' + ch.type, a));
                        break;
                    }
                    case 'drawing':
                        out.push(drawingMod.renderDrawing(ch));
                        break;
                    case 'fldChar': {
                        const a = { 'w:fldCharType': ch.kind };
                        if (ch.dirty) a['w:dirty'] = '1';
                        if (ch.fldLock) a['w:fldLock'] = '1';
                        out.push(xml.el('w:fldChar', a, ch._extras || []));
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
            // A read `<w:rPr/>` is an empty object: written back empty.
            if (rPrEl) children.push(rPrEl);
            else if (run.rPr && typeof run.rPr === 'object') children.push(xml.el('w:rPr', {}, []));
            children.push(...renderRunChildren(run.children));
            return xml.el('w:r', {}, children);
        }

        // --- Hyperlink ---
        // <w:hyperlink r:id="rIdN"> or <w:hyperlink w:anchor="bookmark">
        // holds a paragraph's content (CT_Hyperlink, EG_PContent): typed
        // like a paragraph's, any other element kept verbatim in the
        // hyperlink's own `_extras`.

        const HYPERLINK_STRINGS = [['tgtFrame', 'w:tgtFrame'], ['tooltip', 'w:tooltip'], ['docLocation', 'w:docLocation']];

        function parseHyperlink(hEl) {
            const out = { type: 'hyperlink', children: [] };
            if (hEl.attrs['r:id'])     out.rId = hEl.attrs['r:id'];
            if (hEl.attrs['w:anchor']) out.anchor = hEl.attrs['w:anchor'];
            // CT_Hyperlink's other attributes: the strings, then w:history
            // (ST_OnOff).
            for (const [k, a] of HYPERLINK_STRINGS) if (hEl.attrs[a] != null) out[k] = hEl.attrs[a];
            if (hEl.attrs['w:history'] != null) out.history = isOn(hEl.attrs['w:history']);
            const extras = [];
            for (const c of hEl.children) {
                if (c.type !== 'element') continue;
                const node = parseInline(c);
                if (node) out.children.push(node);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderHyperlink(h) {
            const attrs = {};
            if (h.rId)    attrs['r:id'] = h.rId;
            if (h.anchor) attrs['w:anchor'] = h.anchor;
            for (const [k, a] of HYPERLINK_STRINGS) if (h[k] != null) attrs[a] = String(h[k]);
            if (h.history != null) attrs['w:history'] = h.history ? '1' : '0';
            const children = renderInlines(h.children);
            if (h._extras) for (const ex of h._extras) children.push(ex);
            return xml.el('w:hyperlink', attrs, children);
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
                    case 'w:showingPlcHdr': out.showingPlcHdr = isOn(c.attrs['w:val']); break;
                    case 'w:dataBinding': {
                        const db = {};
                        if (c.attrs['w:xpath']) db.xpath = c.attrs['w:xpath'];
                        if (c.attrs['w:prefixMappings']) db.prefixMappings = c.attrs['w:prefixMappings'];
                        if (c.attrs['w:storeItemID']) db.storeItemID = c.attrs['w:storeItemID'];
                        out.dataBinding = db;
                        break;
                    }
                    case 'w:text':
                        out.kind = 'text';
                        // Its attributes (w:multiLine) ride on the element.
                        if (Object.keys(c.attrs).length) out._kindNode = c;
                        break;
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
            if (props.showingPlcHdr != null)
                children.push(xml.el('w:showingPlcHdr', props.showingPlcHdr ? {} : { 'w:val': '0' }));
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
            if (props.kind === 'text')         children.push(props._kindNode || xml.el('w:text', {}));
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
            // The control's other children (w:sdtEndPr), verbatim.
            const own = sdtEl.children.filter((c) => c.type === 'element'
                && c.name !== 'w:sdtPr' && c.name !== 'w:sdtContent');
            if (own.length) out._extras = own;
            if (sdtContentEl) {
                if (isBlock) {
                    // Body-level content: paragraphs, tables, nested
                    // sdt and markers; any other child kept verbatim.
                    const extras = [];
                    for (const c of sdtContentEl.children) {
                        if (c.type !== 'element') continue;
                        const marker = parseMarker(c);
                        if (c.name === 'w:p')          out.children.push(parseParagraph(c));
                        else if (c.name === 'w:tbl')   out.children.push(parseTable(c));
                        else if (c.name === 'w:sdt')   out.children.push(parseSdt(c, true));
                        else if (marker)               out.children.push(marker);
                        else extras.push(c);
                    }
                    if (extras.length) out._contentExtras = extras;
                } else {
                    // Inline content, typed as a paragraph's children; any
                    // other child (w:proofErr …) kept verbatim after them.
                    const extras = [];
                    for (const c of sdtContentEl.children) {
                        if (c.type !== 'element') continue;
                        const node = parseInline(c);
                        if (node) out.children.push(node);
                        else extras.push(c);
                    }
                    if (extras.length) out._contentExtras = extras;
                }
            }
            return out;
        }

        function renderSdt(sdt) {
            const sdtChildren = [];
            const propsEl = renderSdtProperties(sdt.properties);
            if (propsEl) sdtChildren.push(propsEl);
            if (sdt._extras) sdtChildren.push(...sdt._extras);
            const isBlock = sdt.type === 'blockSdt';
            let contentChildren = [];
            if (isBlock) {
                for (const c of sdt.children || []) {
                    if (c.type === 'paragraph')      contentChildren.push(renderParagraph(c));
                    else if (c.type === 'table')     contentChildren.push(renderTable(c));
                    else if (c.type === 'blockSdt')  contentChildren.push(renderSdt(c));
                    else {
                        const marker = renderMarker(c);
                        if (marker) contentChildren.push(marker);
                    }
                }
            } else {
                contentChildren = renderInlines(sdt.children || []);
            }
            if (sdt._contentExtras) contentChildren.push(...sdt._contentExtras);
            sdtChildren.push(xml.el('w:sdtContent', {}, contentChildren));
            return xml.el('w:sdt', {}, sdtChildren);
        }

        // --- Paragraph ---

        // Revision wrappers and their model types: ECMA-376 Part 1
        // § 17.13.5 (w:ins, w:del) and § 17.13.5.22–23 (w:moveFrom, w:moveTo).
        const REVISION_TAGS = { 'w:ins': 'ins', 'w:del': 'del', 'w:moveFrom': 'moveFrom', 'w:moveTo': 'moveTo' };
        const REVISION_ELEMENTS = { ins: 'w:ins', del: 'w:del', moveFrom: 'w:moveFrom', moveTo: 'w:moveTo' };

        // The range markup with no node type of its own: the revision range
        // markers (ECMA-376 Part 1 § 17.13.5: the move ranges and the custom
        // XML revision ranges), the permission ranges (§ 17.13.7) and the
        // proofing marks (§ 17.13.8). Range markup may sit among a
        // paragraph's runs or between blocks; each is one typed
        // `rangeMarker` node, its attributes verbatim, at its place.
        const RANGE_MARKERS = new Set([
            'w:moveFromRangeStart', 'w:moveFromRangeEnd', 'w:moveToRangeStart', 'w:moveToRangeEnd',
            'w:customXmlInsRangeStart', 'w:customXmlInsRangeEnd', 'w:customXmlDelRangeStart', 'w:customXmlDelRangeEnd',
            'w:customXmlMoveFromRangeStart', 'w:customXmlMoveFromRangeEnd',
            'w:customXmlMoveToRangeStart', 'w:customXmlMoveToRangeEnd',
            'w:permStart', 'w:permEnd', 'w:proofErr'
        ]);

        // The bookmark and comment range markers (CT_Bookmark,
        // CT_MarkupRange): typed nodes, inline or between blocks.
        const MARKER_TYPES = {
            'w:bookmarkStart': 'bookmarkStart', 'w:bookmarkEnd': 'bookmarkEnd',
            'w:commentRangeStart': 'commentRangeStart', 'w:commentRangeEnd': 'commentRangeEnd'
        };
        const MARKER_ELEMENTS = Object.fromEntries(Object.entries(MARKER_TYPES).map(([k, v]) => [v, k]));

        /** A bookmark / comment range marker or range markup, typed; `null` for any other element. */
        function parseMarker(c) {
            if (RANGE_MARKERS.has(c.name)) return parseRangeMarker(c);
            const type = MARKER_TYPES[c.name];
            if (!type) return null;
            const a = c.attrs;
            const out = { type, id: a['w:id'] };
            if (type === 'bookmarkStart') {
                out.name = a['w:name'];
                if (a['w:colFirst'] !== undefined) out.colFirst = Number(a['w:colFirst']);
                if (a['w:colLast'] !== undefined) out.colLast = Number(a['w:colLast']);
            }
            if (a['w:displacedByCustomXml'] !== undefined) out.displacedByCustomXml = a['w:displacedByCustomXml'];
            return out;
        }

        /** The element of a marker node, or `null` for any other node. */
        function renderMarker(m) {
            if (m.type === 'rangeMarker') return renderRangeMarker(m);
            const name = MARKER_ELEMENTS[m.type];
            if (!name) return null;
            const a = { 'w:id': String(m.id) };
            if (m.type === 'bookmarkStart') {
                if (m.name) a['w:name'] = m.name;
                if (m.colFirst != null) a['w:colFirst'] = String(m.colFirst);
                if (m.colLast != null) a['w:colLast'] = String(m.colLast);
            }
            if (m.displacedByCustomXml) a['w:displacedByCustomXml'] = m.displacedByCustomXml;
            return xml.el(name, a);
        }

        function parseRangeMarker(el) {
            return { type: 'rangeMarker', name: el.name.slice(2), attrs: { ...el.attrs } };
        }

        function renderRangeMarker(m) {
            return xml.el('w:' + m.name, { ...(m.attrs || {}) }, []);
        }

        /**
         * One inline child of a paragraph or of a revision, typed, or
         * `null` for an element the model does not type (the caller keeps
         * it verbatim in its own `_extras`).
         */
        function parseInline(c) {
            const marker = parseMarker(c);
            if (marker) return marker;
            switch (c.name) {
                case 'w:r':
                    return parseRun(c);
                case 'w:hyperlink':
                    return parseHyperlink(c);
                case 'w:ins':
                case 'w:del':
                case 'w:moveFrom':
                case 'w:moveTo':
                    return parseRevision(c, REVISION_TAGS[c.name]);
                case 'w:sdt':
                    return parseSdt(c, false);
                case 'm:oMath':
                    return mathMod.parseOMath(c);
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
                    return f;
                }
                default:
                    return null;
            }
        }

        function parseParagraph(pEl) {
            const pPrEl = xml.findChild(pEl, 'w:pPr');
            const pPr = props.parseParagraphProperties(pPrEl);
            const children = [];
            const extras = [];
            for (const c of pEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:pPr') continue;
                const node = parseInline(c);
                if (node) children.push(node);
                else extras.push(c);
            }
            const out = { type: 'paragraph', children };
            if (pPr) out.pPr = pPr;
            if (extras.length) out._extras = extras;
            readIds(pEl, out);
            return out;
        }

        // --- Word's paragraph and row ids (w14:paraId, w14:textId) ---

        // The `w14` ids of a `w:p` / `w:tr`, when the read kept them (the
        // `extensions: 'keep'` read; the default one drops `w14`).
        function readIds(el, out) {
            const a = el.attrs || {};
            if (a['w14:paraId'] != null) out.paraId = a['w14:paraId'];
            if (a['w14:textId'] != null) out.textId = a['w14:textId'];
        }

        // The paraIds the part being written already carries, set by
        // `docx.write` around each part (`withParaIds`); null outside a write.
        let paraIdsWritten = null;

        /**
         * Run `fn` as the render of one part: a `paraId` an earlier paragraph
         * or row of the part carries is not written again.
         */
        function withParaIds(fn) {
            const before = paraIdsWritten;
            paraIdsWritten = new Set();
            try { return fn(); } finally { paraIdsWritten = before; }
        }

        // The attributes of a `w:p` / `w:tr` its node's ids give.
        function idAttrs(node) {
            const attrs = {};
            const id = node.paraId;
            if (id != null && !(paraIdsWritten && paraIdsWritten.has(String(id)))) {
                attrs['w14:paraId'] = String(id);
                if (paraIdsWritten) paraIdsWritten.add(String(id));
            }
            if (node.textId != null) attrs['w14:textId'] = String(node.textId);
            return attrs;
        }

        // <w:ins> / <w:del> / <w:moveFrom> / <w:moveTo> — tracked change
        // wrappers. Their children are a paragraph's inline content
        // (ECMA-376 Part 1 § 17.13.5): typed like a paragraph's, any other
        // element kept verbatim in the revision's own `_extras`.
        function parseRevision(el, kind) {
            const out = {
                type: kind,
                id: el.attrs['w:id'],
                children: []
            };
            // w:author is required (CT_TrackChange): an empty one is kept.
            if (el.attrs['w:author'] !== undefined) out.author = el.attrs['w:author'];
            if (el.attrs['w:date'])   out.date = el.attrs['w:date'];
            const extras = [];
            for (const c of el.children) {
                if (c.type !== 'element') continue;
                const node = parseInline(c);
                if (node) out.children.push(node);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderRevision(rev) {
            const attrs = {};
            if (rev.id != null)  attrs['w:id'] = String(rev.id);
            if (typeof rev.author === 'string') attrs['w:author'] = rev.author;
            if (rev.date)        attrs['w:date'] = rev.date;
            const children = renderInlines(rev.children);
            if (rev._extras) for (const ex of rev._extras) children.push(ex);
            return xml.el(REVISION_ELEMENTS[rev.type] || 'w:ins', attrs, children);
        }

        /** The elements of a paragraph's or a revision's typed inline children; an unknown type writes nothing. */
        function renderInlines(nodes) {
            const children = [];
            for (const c of nodes || []) {
                switch (c.type) {
                    case 'run':       children.push(renderRun(c)); break;
                    case 'hyperlink': children.push(renderHyperlink(c)); break;
                    case 'ins':
                    case 'del':
                    case 'moveFrom':
                    case 'moveTo':    children.push(renderRevision(c)); break;
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
                    case 'bookmarkStart':
                    case 'bookmarkEnd':
                    case 'commentRangeStart':
                    case 'commentRangeEnd':
                    case 'rangeMarker':
                        children.push(renderMarker(c));
                        break;
                }
            }
            return children;
        }

        function renderParagraph(p) {
            const children = [];
            const pPrEl = props.renderParagraphProperties(p.pPr);
            // A read `<w:pPr/>` is an empty object: written back empty.
            if (pPrEl) children.push(pPrEl);
            else if (p.pPr && typeof p.pPr === 'object') children.push(xml.el('w:pPr', {}, []));
            children.push(...renderInlines(p.children));
            if (p._extras) for (const ex of p._extras) children.push(ex);
            return xml.el('w:p', idAttrs(p), children);
        }

        // --- Table ---

        function parseCell(tcEl) {
            // <w:tc>: <w:tcPr/>?, then block-level content (paragraphs, nested
            // tables, block-level controls, markers)
            const tcPrEl = xml.findChild(tcEl, 'w:tcPr');
            const tcPr = tcPrEl ? parseCellProperties(tcPrEl) : undefined;
            const children = [];
            const extras = [];
            for (const c of tcEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tcPr') continue;
                const marker = parseMarker(c);
                if (c.name === 'w:p')        children.push(parseParagraph(c));
                else if (c.name === 'w:tbl') children.push(parseTable(c));
                else if (c.name === 'w:sdt') children.push(parseSdt(c, true));
                else if (marker)             children.push(marker);
                else extras.push(c);
            }
            const out = { type: 'cell', children };
            if (tcPr) out.tcPr = tcPr;
            if (extras.length) out._extras = extras;
            return out;
        }

        // Block-level content of a cell (EG_BlockLevelElts).
        const CELL_BLOCKS = new Set(['w:p', 'w:tbl', 'w:sdt', 'w:customXml', 'w:altChunk']);

        function renderCell(c) {
            const children = [];
            const tcPrEl = renderCellProperties(c.tcPr);
            if (tcPrEl) children.push(tcPrEl);
            for (const ch of c.children || []) {
                if (ch.type === 'paragraph') children.push(renderParagraph(ch));
                else if (ch.type === 'table') children.push(renderTable(ch));
                else if (ch.type === 'blockSdt') children.push(renderSdt(ch));
                else {
                    const marker = renderMarker(ch);
                    if (marker) children.push(marker);
                }
            }
            if (c._extras) for (const ex of c._extras) children.push(ex);
            // A cell must contain block-level content per ECMA-376: an
            // empty paragraph when none is typed or kept verbatim.
            if (!children.some(n => n && CELL_BLOCKS.has(n.name))) {
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
            return xml.el('w:tcPr', {}, ordered(children, TCPR_SEQ));
        }

        // --- Content controls around cells and rows ---
        // A row-level `w:sdt` (CT_SdtCell) wraps cells, a table-level one
        // (CT_SdtRow) wraps rows. Their items are read in place, each
        // carrying `sdt`: the controls around it, outermost first, as
        // `{ group, properties?, _extras?, _contentExtras? }` (`group`
        // unique within the row or table, in the order the controls open;
        // the items of one control share one wrapper). `_extras` keeps the
        // control's other children (`w:sdtEndPr`), `_contentExtras` the
        // content children that are neither an item nor a control. A
        // control that wraps no item stays raw where it was.

        /**
         * Read the items of `children` (`w:tc` or `w:tr`, by `itemName`)
         * into `items`, descending into content controls; any other child
         * goes to `extras`.
         */
        function readWrapped(children, itemName, parseItem, items, extras) {
            let group = 0;
            const walk = (kids, chain, sink) => {
                for (const c of kids) {
                    if (c.type !== 'element') continue;
                    if (c.name === itemName) {
                        const item = parseItem(c);
                        if (chain.length) item.sdt = chain.slice();
                        items.push(item);
                    } else if (c.name === 'w:sdt') {
                        const ctl = { group: group++ };
                        const pr = parseSdtProperties(xml.findChild(c, 'w:sdtPr'));
                        if (pr) ctl.properties = pr;
                        const own = c.children.filter(k => k.type === 'element'
                            && k.name !== 'w:sdtPr' && k.name !== 'w:sdtContent');
                        if (own.length) ctl._extras = own;
                        const content = xml.findChild(c, 'w:sdtContent');
                        const inner = [];
                        const before = items.length;
                        walk(content ? content.children : [], [...chain, ctl], inner);
                        if (items.length === before) sink.push(c);
                        else if (inner.length) ctl._contentExtras = inner;
                    } else {
                        sink.push(c);
                    }
                }
            };
            walk(children, [], extras);
        }

        /**
         * Render `items` into `out`: consecutive items whose `sdt` lists
         * share a control at a level are written inside one `w:sdt`.
         */
        function renderWrapped(items, renderItem, out) {
            const stack = [];
            const target = () => (stack.length ? stack[stack.length - 1].content : out);
            const close = () => {
                const { ctl, content } = stack.pop();
                const kids = [];
                const pr = renderSdtProperties(ctl.properties);
                if (pr) kids.push(pr);
                if (ctl._extras) kids.push(...ctl._extras);
                kids.push(xml.el('w:sdtContent', {}, [...content, ...(ctl._contentExtras || [])]));
                target().push(xml.el('w:sdt', {}, kids));
            };
            for (const it of items) {
                const chain = Array.isArray(it && it.sdt) ? it.sdt : [];
                let k = 0;
                while (k < stack.length && k < chain.length && chain[k]
                    && stack[k].ctl.group === chain[k].group) k++;
                while (stack.length > k) close();
                for (; k < chain.length; k++) if (chain[k]) stack.push({ ctl: chain[k], content: [] });
                target().push(renderItem(it));
            }
            while (stack.length) close();
        }

        function parseRow(trEl) {
            const cells = [];
            const extras = [];
            readWrapped(trEl.children, 'w:tc', parseCell, cells, extras);
            const out = { type: 'row', cells };
            if (extras.length) out._extras = extras;
            readIds(trEl, out);
            return out;
        }

        // CT_Row: tblPrEx and trPr precede the cells; every other preserved
        // element (bookmarks, custom XML, ...) follows them.
        function renderRow(row) {
            const extras = row._extras || [];
            const head = name => extras.filter(ex => ex && ex.name === name);
            const children = [...head('w:tblPrEx'), ...head('w:trPr')];
            renderWrapped(row.cells || [], renderCell, children);
            for (const ex of extras) if (!(ex && (ex.name === 'w:tblPrEx' || ex.name === 'w:trPr'))) children.push(ex);
            return xml.el('w:tr', idAttrs(row), children);
        }

        function parseTable(tblEl) {
            const rows = [];
            const extras = [];
            const out = { type: 'table', rows };
            const rest = [];
            for (const c of tblEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'w:tblPr') {
                    const tp = props.parseTableProperties(c);
                    if (tp !== undefined) out.tblPr = tp;
                    else extras.push(c); // childless tblPr — preserved verbatim
                }
                else rest.push(c);
            }
            // Rows, those inside a content control included; tblGrid and
            // any other element preserved verbatim.
            readWrapped(rest, 'w:tr', parseRow, rows, extras);
            if (extras.length) out._extras = extras;
            return out;
        }

        /**
         * The `w:tblGrid` of a table that carries none (CT_Tbl requires
         * it): one `w:gridCol` per grid column — the widest row, a cell
         * counting its `tcPr.gridSpan`. Each column gets `w:w` only when
         * the first span-free row as wide as the grid gives every cell a
         * `dxa` width; the attribute is optional otherwise.
         */
        function renderGrid(rows) {
            const span = c => Math.max(1, Number(c && c.tcPr && c.tcPr.gridSpan) || 1);
            let n = 0;
            for (const r of rows) n = Math.max(n, (r.cells || []).reduce((sum, c) => sum + span(c), 0));
            const dxa = c => {
                const w = c && c.tcPr && c.tcPr.width;
                const v = w ? Number(w.w) : NaN;
                return w && (w.type || 'dxa') === 'dxa' && Number.isFinite(v) && v >= 0 ? String(v) : null;
            };
            const sized = rows.map(r => r.cells || []).find(cs => cs.length === n
                && cs.every(c => span(c) === 1 && dxa(c) !== null));
            const cols = [];
            for (let i = 0; i < n; i++) {
                cols.push(xml.el('w:gridCol', sized ? { 'w:w': dxa(sized[i]) } : {}));
            }
            return xml.el('w:tblGrid', {}, cols);
        }

        function renderTable(t) {
            // CT_Tbl opens with w:tblPr then w:tblGrid, both required: the
            // typed tblPr (else a preserved childless one, else an empty
            // one), then the preserved grid (else one derived from the
            // rows), then the other preserved elements, then the rows.
            const extras = t._extras || [];
            const keptPr = extras.find(ex => ex && ex.name === 'w:tblPr');
            const keptGrid = extras.find(ex => ex && ex.name === 'w:tblGrid');
            const tblPrEl = props.renderTableProperties(t.tblPr);
            const pr = tblPrEl || keptPr || xml.el('w:tblPr', {}, []);
            const children = [pr, keptGrid || renderGrid(t.rows || [])];
            for (const ex of extras) if (ex !== pr && ex !== keptGrid) children.push(ex);
            renderWrapped(t.rows || [], renderRow, children);
            return xml.el('w:tbl', {}, children);
        }

        // --- Section properties (page setup) ---
        // ECMA-376 part 1 §17.6 — `<w:sectPr>` lives at the end of <w:body>.

        const SECT_KNOWN = new Set([
            'w:pgSz', 'w:pgMar', 'w:type',
            'w:headerReference', 'w:footerReference',
            'w:titlePg'
        ]);

        // Twips per unit of an ST_UniversalMeasure (§22.9.2.15).
        const UNIT_TWIPS = { in: 1440, pt: 20, pc: 240, pi: 240, cm: 1440 / 2.54, mm: 144 / 2.54 };
        const UNIVERSAL_MEASURE = /^(-?[0-9]+(?:\.[0-9]+)?)(mm|cm|in|pt|pc|pi)$/;

        /**
         * An ST_TwipsMeasure / ST_SignedTwipsMeasure attribute in twips: an
         * integer as written, a universal measure (`612pt`, `2.54cm`, as
         * strict OOXML writes them) converted and rounded; any other value
         * read by `Number` as before.
         */
        function twipsMeasure(v) {
            const m = UNIVERSAL_MEASURE.exec(v);
            return m ? Math.round(Number(m[1]) * UNIT_TWIPS[m[2]]) : Number(v);
        }

        function parseSection(sectPrEl) {
            const out = {};
            const extras = [];
            for (const c of sectPrEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:pgSz':
                        out.pageSize = {};
                        if (c.attrs['w:w']) out.pageSize.w = twipsMeasure(c.attrs['w:w']);
                        if (c.attrs['w:h']) out.pageSize.h = twipsMeasure(c.attrs['w:h']);
                        if (c.attrs['w:orient']) out.pageSize.orient = c.attrs['w:orient'];
                        if (c.attrs['w:code'] != null && c.attrs['w:code'] !== '') out.pageSize.code = Number(c.attrs['w:code']);
                        break;
                    case 'w:pgMar':
                        out.pageMargin = {};
                        for (const k of ['top', 'right', 'bottom', 'left',
                                         'header', 'footer', 'gutter']) {
                            const a = c.attrs['w:' + k];
                            if (a != null) out.pageMargin[k] = twipsMeasure(a);
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
            // An empty <w:sectPr/> reads as an empty object, written back.
            return out;
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
                if (sect.pageSize.code != null) a['w:code'] = String(sect.pageSize.code);
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
            return xml.el('w:sectPr', {}, children.length ? ordered(children, SECT_SEQ) : []);
        }

        // --- Body dispatch ---

        // Block math: the schema puts m:oMathPara inside a w:p (EG_PContent),
        // as Word writes a display equation. A w:p with no w:pPr whose only
        // element child is one m:oMathPara is the body-level oMathPara node.
        function blockMathOf(pEl) {
            let math = null;
            for (const c of pEl.children) {
                if (c.type !== 'element') continue;
                if (c.name !== 'm:oMathPara' || math) return null;
                math = c;
            }
            return math;
        }

        function parseBody(bodyEl) {
            const body = [];
            let sectPr;
            const extras = [];
            for (const c of bodyEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'w:p': {
                        const math = blockMathOf(c);
                        // A paragraph holding only a display equation: its
                        // ids ride on the equation, written on its `w:p`.
                        const node = math ? mathMod.parseOMathPara(math) : parseParagraph(c);
                        if (math) readIds(c, node);
                        body.push(node);
                        break;
                    }
                    case 'w:tbl':       body.push(parseTable(c)); break;
                    case 'w:sdt':       body.push(parseSdt(c, true)); break;
                    case 'm:oMathPara': body.push(mathMod.parseOMathPara(c)); break;
                    case 'w:sectPr':    sectPr = parseSection(c); break;
                    default: {
                        const marker = parseMarker(c);
                        if (marker) body.push(marker);
                        else extras.push(c);
                    }
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
                else if (node.type === 'oMathPara') children.push(xml.el('w:p', idAttrs(node), [mathMod.renderOMathPara(node)]));
                else {
                    const marker = renderMarker(node);
                    if (marker) children.push(marker);
                }
            }
            if (doc._extras) for (const ex of doc._extras) children.push(ex);
            const sect = renderSection(doc.sectPr);
            if (sect) children.push(sect);
            return children;
        }

        return {
            parseRun, renderRun,
            parseHyperlink, renderHyperlink,
            parseParagraph, renderParagraph, withParaIds,
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
