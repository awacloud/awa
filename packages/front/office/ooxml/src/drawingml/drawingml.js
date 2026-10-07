// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @typedef {Object} Drawing
 *   Typed contract for the `<w:drawing>` / `<xdr:twoCellAnchor>` payload
 *   exchanged between `docx`, `xlsx`, `pptx` orchestrators and the
 *   `drawingml` / `drawingmlChart` / `drawingmlShape` modules. The same shape
 *   is used at every container level so the walker (`walkAllDrawings`) can
 *   collect rIds uniformly.
 *
 *   @property {'inline'|'anchor'} [placement] — wrapping mode (WML)
 *   @property {string} [embedRef] — r:embed rId targeting an image part
 *   @property {string} [chartRef] — r:id rId targeting a chart part
 *   @property {string} [kind] — `'image'` (default) or `'chart'`
 *   @property {{ data: Uint8Array, contentType: string,
 *                rId?: string, fileName?: string }} [image]
 *   @property {object} [chart] — chartSpec from `drawingmlChart.parse`
 *   @property {object} [shape] — geometry preset from `drawingmlShape`
 *   @property {object} [txbxContent] — textbox content (paragraphs)
 *                                      nested in DrawingML shapes; walked
 *                                      by docx.walkAllDrawings
 *   @property {object} [altContent] — MC fallback branch (verbatim)
 *   @property {{cx: number, cy: number}} [size] — EMU extents
 *   @property {Array} [_extras] — passthrough XML for unknown children
 */

/**
 * @fileoverview DrawingML — shared graphics namespace (ECMA-376 part 1 §20).
 *
 * Provides EMU helpers + a typed model for **text bodies**
 * (`<a:txBody>` / `<p:txBody>`) used by pptx slides, charts, and
 * inline shapes in docx/xlsx.
 *
 * Text body model :
 *
 * ```js
 * {
 *   bodyPr?: xmlNode,    // <a:bodyPr/> preserved verbatim
 *   lstStyle?: xmlNode,  // <a:lstStyle/> preserved verbatim
 *   paragraphs: [{
 *     pPr?: {
 *       level?: number,           // <a:pPr lvl="N"/>
 *       align?: 'l'|'ctr'|'r'|'just'|'dist',  // algn
 *       indent?: number,
 *       marL?: number,
 *       bullet?: 'none' | { char: string } | { autoNumType: string },
 *       _extras?: [xmlNode]
 *     },
 *     runs: [textRun | breakRun | fieldRun],
 *     _extras?: [xmlNode]
 *   }]
 * }
 *
 * textRun  := { type: 'text', value: string, rPr?: RunProperties }
 * breakRun := { type: 'break', rPr?: RunProperties }
 * fieldRun := { type: 'field', id: string, fieldType?: string,
 *               value?: string, rPr?: RunProperties }
 *
 * RunProperties := {
 *   lang?, size?, bold?, italic?, underline?, strike?, baseline?,
 *   color?: string,        // 'RRGGBB' (hex, no #)
 *   font?: string,         // <a:latin typeface="..."/>
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/drawingml
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlMath } from '../math/math.js';
import { ooxmlShared } from '../_shared/index.js';

export const drawingml = {
    name: 'drawingml',
    dependencies: ['xml', 'ooxmlMath', 'ooxmlShared'],
    deps: [xml, ooxmlMath, ooxmlShared],

    factory(xml, mathMod, shared) {
        const { NS, EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT,
                inchesToEmu, cmToEmu, ptToEmu,
                readBoolAttr, writeBoolAttr } = shared;
        const A_NS = NS.A;

        // Build `<a:srgbClr val="RRGGBB"/>` — delegate to the shared
        // DML color codec to maintain a single canonical builder
        // across factories.
        const srgbClr = shared.createDmlColorCodec(xml).srgbClr;

        // --- RunProperties (<a:rPr>) ---

        function parseRunProperties(rPrEl) {
            if (!rPrEl) return undefined;
            const a = rPrEl.attrs;
            const out = {};
            if (a.lang)     out.lang = a.lang;
            if (a.sz != null) out.size = Number(a.sz);
            if (a.b != null) out.bold = readBoolAttr(a.b);
            if (a.i != null) out.italic = readBoolAttr(a.i);
            if (a.strike)   out.strike = a.strike;
            if (a.u)        out.underline = a.u;
            if (a.baseline != null) out.baseline = Number(a.baseline);
            const extras = [];
            for (const c of rPrEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:solidFill') {
                    const cl = c.children.find(n => n.type === 'element' && n.name === 'a:srgbClr');
                    if (cl) out.color = cl.attrs.val;
                    else extras.push(c);
                } else if (c.name === 'a:latin') {
                    out.font = c.attrs.typeface;
                } else {
                    extras.push(c);
                }
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderRunProperties(rPr) {
            if (!rPr) return null;
            const a = {};
            if (rPr.lang)             a.lang = rPr.lang;
            if (rPr.size != null)     a.sz = String(rPr.size);
            if (rPr.bold != null)     a.b = writeBoolAttr(rPr.bold);
            if (rPr.italic != null)   a.i = writeBoolAttr(rPr.italic);
            if (rPr.strike)           a.strike = rPr.strike;
            if (rPr.underline)        a.u = rPr.underline;
            if (rPr.baseline != null) a.baseline = String(rPr.baseline);
            const children = [];
            if (rPr.color) {
                children.push(xml.el('a:solidFill', {}, [srgbClr(rPr.color)]));
            }
            if (rPr.font) {
                children.push(xml.el('a:latin', { typeface: rPr.font }));
            }
            if (rPr._extras) for (const ex of rPr._extras) children.push(ex);
            return xml.el('a:rPr', a, children);
        }

        // --- ParagraphProperties (<a:pPr>) ---

        function parseParagraphProperties(pPrEl) {
            if (!pPrEl) return undefined;
            const a = pPrEl.attrs;
            const out = {};
            if (a.lvl != null)    out.level = Number(a.lvl);
            if (a.algn)           out.align = a.algn;
            if (a.indent != null) out.indent = Number(a.indent);
            if (a.marL != null)   out.marL = Number(a.marL);
            const extras = [];
            for (const c of pPrEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:buNone')         out.bullet = 'none';
                else if (c.name === 'a:buChar')    out.bullet = { char: c.attrs.char };
                else if (c.name === 'a:buAutoNum') out.bullet = { autoNumType: c.attrs.type };
                else if (c.name === 'a:defRPr')    out.defRPr = parseRunProperties(c);
                else extras.push(c);
            }
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderParagraphProperties(pPr) {
            if (!pPr) return null;
            const a = {};
            if (pPr.level != null)  a.lvl = String(pPr.level);
            if (pPr.align)          a.algn = pPr.align;
            if (pPr.indent != null) a.indent = String(pPr.indent);
            if (pPr.marL != null)   a.marL = String(pPr.marL);
            const children = [];
            if (pPr.bullet === 'none') {
                children.push(xml.el('a:buNone', {}));
            } else if (pPr.bullet && pPr.bullet.char) {
                children.push(xml.el('a:buChar', { char: pPr.bullet.char }));
            } else if (pPr.bullet && pPr.bullet.autoNumType) {
                children.push(xml.el('a:buAutoNum', { type: pPr.bullet.autoNumType }));
            }
            if (pPr.defRPr) {
                const dpr = renderRunProperties(pPr.defRPr);
                if (dpr) {
                    // Tag name should be a:defRPr — relabel.
                    children.push(xml.el('a:defRPr', dpr.attrs, dpr.children));
                }
            }
            if (pPr._extras) for (const ex of pPr._extras) children.push(ex);
            if (!Object.keys(a).length && !children.length) return null;
            return xml.el('a:pPr', a, children);
        }

        // --- Run / Paragraph ---

        function parseRun(rEl) {
            const rPrEl = xml.findChild(rEl, 'a:rPr');
            const tEl = xml.findChild(rEl, 'a:t');
            const out = { type: 'text', value: tEl ? xml.textContent(tEl) : '' };
            const rPr = parseRunProperties(rPrEl);
            if (rPr) out.rPr = rPr;
            return out;
        }

        function renderRun(run) {
            const children = [];
            const rPrEl = renderRunProperties(run.rPr);
            if (rPrEl) children.push(rPrEl);
            children.push(xml.el('a:t', {}, [xml.text(run.value || '')]));
            return xml.el('a:r', {}, children);
        }

        function parseField(fEl) {
            const out = {
                type: 'field',
                id: fEl.attrs.id
            };
            if (fEl.attrs.type) out.fieldType = fEl.attrs.type;
            const rPrEl = xml.findChild(fEl, 'a:rPr');
            const tEl = xml.findChild(fEl, 'a:t');
            const rPr = parseRunProperties(rPrEl);
            if (rPr) out.rPr = rPr;
            if (tEl) out.value = xml.textContent(tEl);
            return out;
        }

        function renderField(f) {
            const a = { id: f.id };
            if (f.fieldType) a.type = f.fieldType;
            const children = [];
            const rPrEl = renderRunProperties(f.rPr);
            if (rPrEl) children.push(rPrEl);
            if (f.value != null) children.push(xml.el('a:t', {}, [xml.text(f.value)]));
            return xml.el('a:fld', a, children);
        }

        function parseBreak(brEl) {
            const out = { type: 'break' };
            const rPrEl = xml.findChild(brEl, 'a:rPr');
            const rPr = parseRunProperties(rPrEl);
            if (rPr) out.rPr = rPr;
            return out;
        }

        function renderBreak(b) {
            const rPrEl = renderRunProperties(b.rPr);
            return xml.el('a:br', {}, rPrEl ? [rPrEl] : []);
        }

        function parseParagraph(pEl) {
            const pPrEl = xml.findChild(pEl, 'a:pPr');
            const pPr = parseParagraphProperties(pPrEl);
            const runs = [];
            const extras = [];
            for (const c of pEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:pPr') continue;
                if (c.name === 'a:r')        runs.push(parseRun(c));
                else if (c.name === 'a:br')  runs.push(parseBreak(c));
                else if (c.name === 'a:fld') runs.push(parseField(c));
                else if (c.name === 'm:oMath' && mathMod) {
                    runs.push(mathMod.parseOMath(c));
                }
                else if (c.name === 'a:endParaRPr') {
                    // tail rPr — preserve verbatim.
                    extras.push(c);
                } else extras.push(c);
            }
            const out = { runs };
            if (pPr) out.pPr = pPr;
            if (extras.length) out._extras = extras;
            return out;
        }

        function renderParagraph(p) {
            const children = [];
            const pPrEl = renderParagraphProperties(p.pPr);
            if (pPrEl) children.push(pPrEl);
            for (const r of p.runs || []) {
                if (r.type === 'text')       children.push(renderRun(r));
                else if (r.type === 'break') children.push(renderBreak(r));
                else if (r.type === 'field') children.push(renderField(r));
                else if (r.type === 'oMath' && mathMod) {
                    children.push(mathMod.renderOMath(r));
                }
            }
            if (p._extras) for (const ex of p._extras) children.push(ex);
            return xml.el('a:p', {}, children);
        }

        // --- Text body (<a:txBody> or <p:txBody>) ---

        function parseTextBody(tbEl) {
            const out = { paragraphs: [] };
            for (const c of tbEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:bodyPr')         out.bodyPr = c;
                else if (c.name === 'a:lstStyle')  out.lstStyle = c;
                else if (c.name === 'a:p')         out.paragraphs.push(parseParagraph(c));
            }
            return out;
        }

        /**
         * Render a text body with the given root tag (`a:txBody` for
         * generic DrawingML, `p:txBody` for pptx slides, etc.).
         */
        function renderTextBody(tb, rootTag = 'a:txBody') {
            const children = [];
            children.push(tb.bodyPr  || xml.el('a:bodyPr',  {}));
            children.push(tb.lstStyle || xml.el('a:lstStyle', {}));
            for (const p of tb.paragraphs || []) {
                children.push(renderParagraph(p));
            }
            return xml.el(rootTag, {}, children);
        }

        /** Convenience: build a single-paragraph text body. */
        function textBodyFromString(text, rPr) {
            const run = { type: 'text', value: text };
            if (rPr) run.rPr = rPr;
            return { paragraphs: [{ runs: [run] }] };
        }

        /** Single-paragraph `<a:p>` containing one text run. */
        function textParagraph(text) {
            return xml.el('a:p', {}, [
                xml.el('a:r', {}, [
                    xml.el('a:t', {}, [xml.text(text)])
                ])
            ]);
        }

        return {
            A_NS, EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT,
            inchesToEmu, cmToEmu, ptToEmu,
            srgbClr, textParagraph, textBodyFromString,

            parseRunProperties, renderRunProperties,
            parseParagraphProperties, renderParagraphProperties,
            parseRun, renderRun,
            parseBreak, renderBreak,
            parseField, renderField,
            parseParagraph, renderParagraph,
            parseTextBody, renderTextBody
        };
    }
};
