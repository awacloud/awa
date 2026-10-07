// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview DrawingML shape properties — `<a:prstGeom>` (preset
 * geometry), `<a:xfrm>` (transform), simple `<a:solidFill>` and
 * `<a:ln>`. ECMA-376 part 1 §20.1.7 + §20.1.9 + §20.1.8.
 *
 * Cross-format : the same `<a:…>` markup appears inside :
 * - pptx slides via `<p:sp>` (placeholder shapes + free-form shapes)
 * - docx via `<wps:wsp>` inside `<a:graphicData>` (Word inline shape)
 * - xlsx drawings via `<xdr:sp>`
 *
 * This module models the **shape properties** as a typed object. The
 * shape's container (`<p:sp>` / `<wps:wsp>` / `<xdr:sp>`) is wired by
 * the host module ; this module focuses on the spPr content shared
 * by all hosts.
 *
 * Typed model :
 *
 * ```js
 * shapeProps := {
 *     geom?: string,              // 'rect' | 'roundRect' | 'ellipse' | …
 *     avLst?: [{ name, fmla }],   // adjustable parameters
 *     cx?, cy?,                   // EMU dimensions
 *     offsetX?, offsetY?,         // EMU position
 *     rotation?: number,          // 60000ths of a degree
 *     flipH?: boolean,
 *     flipV?: boolean,
 *     fill?:
 *       | 'none'
 *       | { color: 'RRGGBB' }
 *       | { schemeColor: string },
 *     line?: {
 *         width?: number,         // EMU
 *         color?: 'RRGGBB',
 *         dash?: 'solid'|'dash'|'dot'|'dashDot'|...,
 *         cap?: 'flat'|'rnd'|'sq',
 *         compound?: 'sng'|'dbl'|'thickThin'|'thinThick'|'tri'
 *     } | 'none',
 *     _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/drawingml/shape
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const drawingmlShape = {
    name: 'drawingmlShape',
    dependencies: ['xml', 'ooxmlShared'],
    deps: [xml, ooxmlShared],

    factory(xml, shared) {
        const { NS } = shared;
        const A_NS = NS.A;

        // --- Color helpers (subset of xlsxStyles.parseColor) ---

        function parseColorChild(parent) {
            // <…><a:srgbClr val="..."/></…> or <a:schemeClr val=".."/>
            for (const c of parent.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:srgbClr')   return { rgb: c.attrs.val };
                if (c.name === 'a:schemeClr') return { schemeColor: c.attrs.val };
            }
            return null;
        }

        function renderSrgbClr(rgb) {
            return xml.el('a:srgbClr', { val: String(rgb).replace(/^#/, '') });
        }

        function renderSchemeClr(name) {
            return xml.el('a:schemeClr', { val: name });
        }

        function renderColorChild(color) {
            if (!color) return null;
            if (color.rgb)         return renderSrgbClr(color.rgb);
            if (color.schemeColor) return renderSchemeClr(color.schemeColor);
            return null;
        }

        // --- prstGeom + avLst ---

        function parsePrstGeom(prstEl) {
            if (!prstEl) return undefined;
            const out = { geom: prstEl.attrs.prst };
            const avLst = xml.findChild(prstEl, 'a:avLst');
            if (avLst) {
                const guides = [];
                for (const g of xml.findAll(avLst, 'a:gd')) {
                    guides.push({ name: g.attrs.name, fmla: g.attrs.fmla });
                }
                if (guides.length) out.avLst = guides;
            }
            return out;
        }

        function renderPrstGeom(props) {
            const avChildren = (props.avLst || []).map(g =>
                xml.el('a:gd', { name: g.name, fmla: g.fmla }));
            return xml.el('a:prstGeom', { prst: props.geom },
                [xml.el('a:avLst', {}, avChildren)]);
        }

        // --- xfrm ---

        function parseXfrm(xfrmEl) {
            if (!xfrmEl) return {};
            const out = {};
            if (xfrmEl.attrs.rot != null)   out.rotation = Number(xfrmEl.attrs.rot);
            if (xfrmEl.attrs.flipH === '1') out.flipH = true;
            if (xfrmEl.attrs.flipV === '1') out.flipV = true;
            const off = xml.findChild(xfrmEl, 'a:off');
            const ext = xml.findChild(xfrmEl, 'a:ext');
            if (off) {
                if (off.attrs.x != null) out.offsetX = Number(off.attrs.x);
                if (off.attrs.y != null) out.offsetY = Number(off.attrs.y);
            }
            if (ext) {
                if (ext.attrs.cx != null) out.cx = Number(ext.attrs.cx);
                if (ext.attrs.cy != null) out.cy = Number(ext.attrs.cy);
            }
            return out;
        }

        function renderXfrm(props) {
            const a = {};
            if (props.rotation != null) a.rot = String(props.rotation);
            if (props.flipH)            a.flipH = '1';
            if (props.flipV)            a.flipV = '1';
            return xml.el('a:xfrm', a, [
                xml.el('a:off', {
                    x: String(props.offsetX || 0),
                    y: String(props.offsetY || 0)
                }),
                xml.el('a:ext', {
                    cx: String(props.cx || 0),
                    cy: String(props.cy || 0)
                })
            ]);
        }

        // --- Fill ---

        function parseFill(spPrEl) {
            // First child fill-like element wins ; supported : solidFill, noFill,
            // others preserved verbatim.
            for (const c of spPrEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'a:noFill')    return 'none';
                if (c.name === 'a:solidFill') {
                    const color = parseColorChild(c);
                    if (color)            return color;
                }
            }
            return undefined;
        }

        function renderFill(fill) {
            if (fill === 'none') return xml.el('a:noFill', {});
            if (typeof fill === 'object' && fill) {
                const color = renderColorChild(fill);
                if (color) return xml.el('a:solidFill', {}, [color]);
            }
            return null;
        }

        // --- Line ---

        function parseLine(lnEl) {
            if (!lnEl) return undefined;
            const out = {};
            if (lnEl.attrs.w != null)   out.width = Number(lnEl.attrs.w);
            if (lnEl.attrs.cap)         out.cap = lnEl.attrs.cap;
            if (lnEl.attrs.cmpd)        out.compound = lnEl.attrs.cmpd;
            // Color from <a:solidFill> child.
            const sf = xml.findChild(lnEl, 'a:solidFill');
            if (sf) {
                const c = parseColorChild(sf);
                if (c && c.rgb) out.color = c.rgb;
            }
            // Dash from <a:prstDash w:val="..."/>
            const dash = xml.findChild(lnEl, 'a:prstDash');
            if (dash) out.dash = dash.attrs.val;
            // <a:noFill/> means line has no fill (transparent).
            if (xml.findChild(lnEl, 'a:noFill')) out.color = null;
            return out;
        }

        function renderLine(line) {
            if (line === 'none') {
                return xml.el('a:ln', {}, [xml.el('a:noFill', {})]);
            }
            if (!line || typeof line !== 'object') return null;
            const a = {};
            if (line.width != null) a.w = String(line.width);
            if (line.cap)           a.cap = line.cap;
            if (line.compound)      a.cmpd = line.compound;
            const children = [];
            if (line.color === null) {
                children.push(xml.el('a:noFill', {}));
            } else if (line.color) {
                children.push(xml.el('a:solidFill', {},
                    [renderSrgbClr(line.color)]));
            }
            if (line.dash) {
                children.push(xml.el('a:prstDash', { val: line.dash }));
            }
            return xml.el('a:ln', a, children);
        }

        // --- Top-level shapeProps from spPr ---

        function parseShapeProperties(spPrEl) {
            if (!spPrEl) return undefined;
            const out = {};
            const xfrmEl = xml.findChild(spPrEl, 'a:xfrm');
            Object.assign(out, parseXfrm(xfrmEl));

            const prst = xml.findChild(spPrEl, 'a:prstGeom');
            if (prst) {
                const geom = parsePrstGeom(prst);
                if (geom) Object.assign(out, geom);
            }

            const fill = parseFill(spPrEl);
            if (fill !== undefined) out.fill = fill;

            const ln = xml.findChild(spPrEl, 'a:ln');
            if (ln) {
                const lineProps = parseLine(ln);
                if (lineProps !== undefined) out.line = lineProps;
            }

            // Preserve unknown children so render can re-emit them.
            // gradFill / blipFill / pattFill / custGeom aren't typed yet —
            // they fall through to _extras so a roundtrip stays fidel.
            const known = new Set(['a:xfrm', 'a:prstGeom',
                                    'a:solidFill', 'a:noFill', 'a:ln']);
            const extras = [];
            for (const c of spPrEl.children) {
                if (c.type !== 'element') continue;
                if (!known.has(c.name)) extras.push(c);
            }
            if (extras.length) out._extras = extras;

            return Object.keys(out).length ? out : undefined;
        }

        /**
         * Render shape properties as a `<…:spPr>` element with the given
         * tag (typically `'p:spPr'` for pptx, `'wps:spPr'` for docx wps,
         * `'xdr:spPr'` for xlsx).
         */
        function renderShapeProperties(props, tag = 'p:spPr') {
            if (!props) return null;
            const children = [];
            // xfrm only emitted if any positioning info present.
            if (props.cx != null || props.cy != null
                || props.offsetX != null || props.offsetY != null
                || props.rotation != null || props.flipH || props.flipV) {
                children.push(renderXfrm(props));
            }
            if (props.geom) {
                children.push(renderPrstGeom(props));
            }
            const fillEl = renderFill(props.fill);
            if (fillEl) children.push(fillEl);
            const lineEl = renderLine(props.line);
            if (lineEl) children.push(lineEl);
            if (props._extras) for (const ex of props._extras) children.push(ex);
            return xml.el(tag, {}, children);
        }

        // --- EMU helpers (shared) ---

        const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;

        // --- Builders ---

        /**
         * Build typed shape properties from intuitive options. Sizes
         * accept numbers (EMU) or strings (`'2in'`, `'5cm'`, `'200px'`).
         */
        function shapeProps(opts = {}) {
            const out = {};
            if (opts.geom)      out.geom = opts.geom;
            if (opts.cx != null) out.cx = toEmu(opts.cx);
            if (opts.cy != null) out.cy = toEmu(opts.cy);
            if (opts.offsetX != null) out.offsetX = toEmu(opts.offsetX);
            if (opts.offsetY != null) out.offsetY = toEmu(opts.offsetY);
            if (opts.rotation != null) out.rotation = opts.rotation;
            if (opts.flipH) out.flipH = true;
            if (opts.flipV) out.flipV = true;
            if (opts.fill !== undefined) {
                if (opts.fill === 'none' || opts.fill === null) out.fill = 'none';
                else if (typeof opts.fill === 'string') out.fill = { rgb: opts.fill };
                else if (opts.fill && opts.fill.rgb) out.fill = { rgb: opts.fill.rgb };
                else if (opts.fill && opts.fill.schemeColor) out.fill = { schemeColor: opts.fill.schemeColor };
            }
            if (opts.line !== undefined) {
                if (opts.line === 'none' || opts.line === null) out.line = 'none';
                else                                              out.line = { ...opts.line };
            }
            return out;
        }

        // --- Common preset geometry names (subset) ---

        const PRESETS = Object.freeze({
            rect: 'rect',
            roundRect: 'roundRect',
            ellipse: 'ellipse',
            triangle: 'triangle',
            rtTriangle: 'rtTriangle',
            parallelogram: 'parallelogram',
            trapezoid: 'trapezoid',
            diamond: 'diamond',
            pentagon: 'pentagon',
            hexagon: 'hexagon',
            heptagon: 'heptagon',
            octagon: 'octagon',
            star5: 'star5',
            star6: 'star6',
            star8: 'star8',
            // Arrows
            rightArrow: 'rightArrow',
            leftArrow: 'leftArrow',
            upArrow: 'upArrow',
            downArrow: 'downArrow',
            leftRightArrow: 'leftRightArrow',
            upDownArrow: 'upDownArrow',
            // Callouts
            wedgeRectCallout: 'wedgeRectCallout',
            wedgeRoundRectCallout: 'wedgeRoundRectCallout',
            wedgeEllipseCallout: 'wedgeEllipseCallout',
            cloudCallout: 'cloudCallout',
            // Lines / connectors
            line: 'line',
            bentConnector2: 'bentConnector2',
            bentConnector3: 'bentConnector3',
            curvedConnector2: 'curvedConnector2',
            curvedConnector3: 'curvedConnector3',
            // Stars / banners
            ribbon: 'ribbon',
            wave: 'wave',
            doubleWave: 'doubleWave',
            cloud: 'cloud',
            sun: 'sun',
            moon: 'moon',
            heart: 'heart',
            lightningBolt: 'lightningBolt'
        });

        return {
            parseShapeProperties, renderShapeProperties,
            parsePrstGeom, renderPrstGeom,
            parseXfrm, renderXfrm,
            parseFill, renderFill,
            parseLine, renderLine,
            shapeProps,
            toEmu, EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
            PRESETS,
            A_NS
        };
    }
};
