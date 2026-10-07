// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview PresentationML slide / slide layout / slide master shape
 * model — `<p:sp>` and the `<p:cSld>` content tree
 * (ECMA-376 part 1 §19.3).
 *
 * The three element types (slide, slide layout, slide master) share the
 * same body content : `<p:cSld>` containing a `<p:spTree>` of shapes,
 * group shapes, pictures, tables and charts. This module covers `<p:sp>`
 * (shapes with text bodies) — the dominant case — and preserves the
 * rest verbatim through `_extras`.
 *
 * Shape model :
 *
 * ```js
 * {
 *   type: 'shape',
 *   id?: number,
 *   name?: string,
 *   placeholder?: { type?, idx?, sz? },
 *   nvSpPr?: xmlNode,   // preserved if not built from name+id+placeholder
 *   spPr?: xmlNode,     // shape geometry / fill (preserved)
 *   style?: xmlNode,    // <p:style> (preserved)
 *   txBody?: textBodyObject,   // from drawingml.parseTextBody
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/pptx/slide
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawingml } from '../drawingml/drawingml.js';
import { pptxPicture } from './picture.js';
import { pptxTable } from './table.js';
import { pptxChart } from './chart.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptxSlide = {
    name: 'pptxSlide',
    dependencies: ['ooxmlErrors', 'xml', 'drawingml', 'pptxPicture', 'pptxTable',
                   'pptxChart', 'drawingmlShape', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, drawingml, pptxPicture, pptxTable, pptxChart, drawingmlShape, ooxmlShared],

    factory(errors, xml, dml, picMod, tblMod, chartMod, shapeMod, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const P_NS = NS.P;
        const A_NS = NS.A;
        const R_NS = NS.R;

        // --- Shape ---

        function parseShape(spEl) {
            const out = { type: 'shape' };
            const nvSpPr = xml.findChild(spEl, 'p:nvSpPr');
            if (nvSpPr) {
                const cNvPr = xml.findChild(nvSpPr, 'p:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.id = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.name = cNvPr.attrs.name;
                }
                const nvPr = xml.findChild(nvSpPr, 'p:nvPr');
                if (nvPr) {
                    const ph = xml.findChild(nvPr, 'p:ph');
                    if (ph) {
                        const phObj = {};
                        if (ph.attrs.type) phObj.type = ph.attrs.type;
                        if (ph.attrs.idx != null) phObj.idx = Number(ph.attrs.idx);
                        if (ph.attrs.sz) phObj.sz = ph.attrs.sz;
                        out.placeholder = phObj;
                    }
                }
                // Preserve full nvSpPr to keep cNvSpPr (locks etc.) verbatim.
                out.nvSpPr = nvSpPr;
            }
            const spPr = xml.findChild(spEl, 'p:spPr');
            if (spPr) {
                out.spPr = spPr;
                // Also expose typed shape properties for shapes that
                // carry preset geometry / fill / line — placeholders
                // typically don't, free-form shapes do.
                const typed = shapeMod.parseShapeProperties(spPr);
                if (typed) out.shapeProps = typed;
            }
            const styleEl = xml.findChild(spEl, 'p:style');
            if (styleEl) out.style = styleEl;
            const txBody = xml.findChild(spEl, 'p:txBody');
            if (txBody) out.txBody = dml.parseTextBody(txBody);
            return out;
        }

        function renderShape(shape) {
            const children = [];
            // Build nvSpPr from primitives if not provided verbatim.
            children.push(shape.nvSpPr || buildNvSpPr(shape));
            // Typed shapeProps wins over the verbatim spPr when both are
            // present — the user explicitly set the typed model. Fallback
            // chain : shapeProps → spPr → empty.
            if (shape.shapeProps) {
                children.push(shapeMod.renderShapeProperties(shape.shapeProps, 'p:spPr'));
            } else if (shape.spPr) {
                children.push(shape.spPr);
            } else {
                children.push(xml.el('p:spPr', {}));
            }
            if (shape.style) children.push(shape.style);
            if (shape.txBody) {
                children.push(dml.renderTextBody(shape.txBody, 'p:txBody'));
            }
            if (shape._extras) for (const ex of shape._extras) children.push(ex);
            return xml.el('p:sp', {}, children);
        }

        function buildNvSpPr(shape) {
            const cNvPrAttrs = {};
            cNvPrAttrs.id = String(shape.id != null ? shape.id : 2);
            cNvPrAttrs.name = shape.name || 'TextBox';
            const nvPrChildren = [];
            if (shape.placeholder) {
                const pa = {};
                if (shape.placeholder.type) pa.type = shape.placeholder.type;
                if (shape.placeholder.idx != null) pa.idx = String(shape.placeholder.idx);
                if (shape.placeholder.sz) pa.sz = shape.placeholder.sz;
                nvPrChildren.push(xml.el('p:ph', pa));
            }
            return xml.el('p:nvSpPr', {}, [
                xml.el('p:cNvPr', cNvPrAttrs),
                xml.el('p:cNvSpPr', {}, [xml.el('a:spLocks', { noGrp: '1' })]),
                xml.el('p:nvPr', {}, nvPrChildren)
            ]);
        }

        // --- spTree dispatch ---

        function parseSpTree(treeEl) {
            const shapes = [];
            const extras = [];
            for (const c of treeEl.children) {
                if (c.type !== 'element') continue;
                switch (c.name) {
                    case 'p:sp':
                        shapes.push(parseShape(c));
                        break;
                    case 'p:pic':
                        shapes.push(picMod.parsePicture(c));
                        break;
                    case 'p:graphicFrame': {
                        const tbl = tblMod.parseGraphicFrame(c);
                        if (tbl) { shapes.push(tbl); break; }
                        const chart = chartMod.parseGraphicFrame(c);
                        if (chart) { shapes.push(chart); break; }
                        // Other graphicFrame (SmartArt, OLE, …) —
                        // preserve verbatim.
                        shapes.push({ type: 'graphicFrame', node: c });
                        break;
                    }
                    case 'p:nvGrpSpPr':
                    case 'p:grpSpPr':
                        extras.push(c);
                        break;
                    default:
                        extras.push(c);
                }
            }
            return { shapes, extras };
        }

        function renderSpTree({ shapes, extras }) {
            const children = [];
            // Header siblings (nvGrpSpPr + grpSpPr) appear before shapes
            // — emit preserved extras first.
            const headExtras = (extras || []).filter(n =>
                n.name === 'p:nvGrpSpPr' || n.name === 'p:grpSpPr');
            const tailExtras = (extras || []).filter(n =>
                n.name !== 'p:nvGrpSpPr' && n.name !== 'p:grpSpPr');
            if (!headExtras.length) {
                children.push(xml.el('p:nvGrpSpPr', {}, [
                    xml.el('p:cNvPr', { id: '1', name: '' }),
                    xml.el('p:cNvGrpSpPr', {}),
                    xml.el('p:nvPr', {})
                ]));
                children.push(xml.el('p:grpSpPr', {}));
            } else {
                for (const ex of headExtras) children.push(ex);
            }
            for (const sp of shapes || []) {
                if (sp.type === 'shape')               children.push(renderShape(sp));
                else if (sp.type === 'picture')        children.push(picMod.renderPicture(sp));
                else if (sp.type === 'table')          children.push(tblMod.renderGraphicFrame(sp));
                else if (sp.type === 'chart')          children.push(chartMod.renderGraphicFrame(sp));
                else if (sp.type === 'graphicFrame' && sp.node) children.push(sp.node);
            }
            for (const ex of tailExtras) children.push(ex);
            return xml.el('p:spTree', {}, children);
        }

        // --- cSld (common slide data) ---

        function parseCSld(cSldEl) {
            const out = {};
            const extras = [];
            if (cSldEl.attrs.name) out.name = cSldEl.attrs.name;
            for (const c of cSldEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'p:bg')          out.bg = c;
                else if (c.name === 'p:spTree') {
                    const tree = parseSpTree(c);
                    out.shapes = tree.shapes;
                    if (tree.extras.length) out.spTreeExtras = tree.extras;
                } else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderCSld(content, defaultName) {
            const a = {};
            if (content.name) a.name = content.name;
            else if (defaultName) a.name = defaultName;
            const children = [];
            if (content.bg) children.push(content.bg);
            children.push(renderSpTree({
                shapes: content.shapes || [],
                extras: content.spTreeExtras
            }));
            if (content._extras) for (const ex of content._extras) children.push(ex);
            return xml.el('p:cSld', a, children);
        }

        // --- Slide-level parse/serialize ---

        function buildParser(rootTag, defaults) {
            return function parse(input) {
                let root;
                if (input && input.type === 'element') {
                    // Pre-parsed root (e.g. after MC processing).
                    root = input;
                } else {
                    const text = typeof input === 'string'
                        ? input
                        : decodeText(input);
                    root = xml.parse(text);
                }
                if (root.name !== rootTag) {
                    throw new ParseError(`pptx/${rootTag.replace(/^p:/, '')}-bad-root`, `pptx ${rootTag}: expected <${rootTag}>, got <${root.name}>`, { context: { expected: rootTag, elementName: root && root.name } });
                }
                const out = { type: defaults.type };
                const cSld = xml.findChild(root, 'p:cSld');
                if (cSld) Object.assign(out, parseCSld(cSld));
                const extras = [];
                for (const c of root.children) {
                    if (c.type !== 'element' || c.name === 'p:cSld') continue;
                    if (c.name === 'p:clrMapOvr')   out.clrMapOvr = c;
                    else if (c.name === 'p:clrMap') out.clrMap = c;
                    else if (c.name === 'p:sldLayoutIdLst')
                        out.layoutIds = parseSldLayoutIdLst(c);
                    else if (c.name === 'p:txStyles') out.txStyles = c;
                    else extras.push(c);
                }
                if (extras.length) out._extras = extras;
                return out;
            };
        }

        function buildSerializer(rootTag, defaultName, extraNs) {
            return function serialize(obj) {
                const ns = {
                    'xmlns:p': P_NS,
                    'xmlns:a': A_NS,
                    'xmlns:r': R_NS,
                    ...(extraNs || {})
                };
                const children = [renderCSld(obj, defaultName)];
                if (obj.clrMap)        children.push(obj.clrMap);
                if (obj.clrMapOvr)     children.push(obj.clrMapOvr);
                if (obj.layoutIds)     children.push(renderSldLayoutIdLst(obj.layoutIds));
                if (obj.txStyles)      children.push(obj.txStyles);
                if (obj._extras) for (const ex of obj._extras) children.push(ex);
                return xml.serialize(xml.el(rootTag, ns, children));
            };
        }

        // <p:sldLayoutIdLst> inside slide master.
        function parseSldLayoutIdLst(el) {
            return xml.findAll(el, 'p:sldLayoutId').map(c => ({
                id: c.attrs.id,
                rId: c.attrs['r:id']
            }));
        }

        function renderSldLayoutIdLst(layoutIds) {
            return xml.el('p:sldLayoutIdLst', {},
                layoutIds.map(li => xml.el('p:sldLayoutId',
                    { id: String(li.id), 'r:id': li.rId })));
        }

        const parseSlide       = buildParser('p:sld',       { type: 'slide' });
        const parseSlideLayout = buildParser('p:sldLayout', { type: 'slideLayout' });
        const parseSlideMaster = buildParser('p:sldMaster', { type: 'slideMaster' });

        const serializeSlide       = buildSerializer('p:sld', null);
        function serializeSlideLayout(obj) {
            const fn = buildSerializer('p:sldLayout',
                obj.cSldName || 'Title and Content',
                obj.layoutType ? {} : {});
            const xmlText = fn(obj);
            // Inject the `type` attribute on root if specified.
            if (obj.layoutType) {
                return xmlText.replace('<p:sldLayout',
                    `<p:sldLayout type="${obj.layoutType}"`);
            }
            return xmlText;
        }
        const serializeSlideMaster = buildSerializer('p:sldMaster', null);

        function slideBytes(obj)       { return encodeText(serializeSlide(obj)); }
        function slideLayoutBytes(obj) { return encodeText(serializeSlideLayout(obj)); }
        function slideMasterBytes(obj) { return encodeText(serializeSlideMaster(obj)); }

        // --- Convenience helpers ---

        /**
         * Build a slide from a high-level `{ title, body }` description.
         * `title` becomes a `<p:ph type="title"/>` shape ; each line of
         * `body` becomes a paragraph in a `<p:ph idx="1"/>` shape.
         */
        function fromTitleBody({ title, body }) {
            const shapes = [];
            if (title != null) {
                shapes.push({
                    type: 'shape', id: 2, name: 'Title 1',
                    placeholder: { type: 'title' },
                    txBody: dml.textBodyFromString(String(title))
                });
            }
            if (body && body.length) {
                shapes.push({
                    type: 'shape', id: 3, name: 'Content Placeholder 2',
                    placeholder: { idx: 1 },
                    txBody: {
                        paragraphs: body.map(line => ({
                            runs: [{ type: 'text', value: String(line) }]
                        }))
                    }
                });
            }
            return { type: 'slide', shapes };
        }

        function extractTitle(slide) {
            const sp = (slide.shapes || []).find(s =>
                s.placeholder && s.placeholder.type === 'title');
            if (!sp || !sp.txBody) return null;
            return sp.txBody.paragraphs.map(p =>
                p.runs.map(r => r.value || '').join('')).join('\n');
        }

        function extractBody(slide) {
            const sp = (slide.shapes || []).find(s =>
                s.placeholder && s.placeholder.idx != null);
            if (!sp || !sp.txBody) return [];
            return sp.txBody.paragraphs.map(p =>
                p.runs.map(r => r.value || '').join(''));
        }

        return {
            parseShape, renderShape,
            parseSlide, parseSlideLayout, parseSlideMaster,
            serializeSlide, serializeSlideLayout, serializeSlideMaster,
            slideBytes, slideLayoutBytes, slideMasterBytes,
            parseCSld, renderCSld,
            parseSpTree, renderSpTree,
            fromTitleBody, extractTitle, extractBody,

            // Constants used by orchestrator
            P_NS, A_NS, R_NS,
            REL_TYPE_SLIDE: REL_TYPE.SLIDE,
            REL_TYPE_SLIDE_LAYOUT: REL_TYPE.SLIDE_LAYOUT,
            REL_TYPE_SLIDE_MASTER: REL_TYPE.SLIDE_MASTER,
            CT_SLIDE: CT.SLIDE,
            CT_SLIDE_LAYOUT: CT.SLIDE_LAYOUT,
            CT_SLIDE_MASTER: CT.SLIDE_MASTER
        };
    }
};
