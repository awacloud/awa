// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview SpreadsheetML drawings — `xl/drawings/drawing*.xml`
 * (ECMA-376 part 1 §20.5).
 *
 * Excel anchors images, charts and shapes to a worksheet via a
 * separate **drawing part**. The worksheet references that part with
 * a `<drawing r:id=…/>` element ; the drawing part contains one or
 * more anchors (twoCell / oneCell / absolute), each wrapping one
 * graphical element (`<xdr:graphicFrame>` for charts/SmartArt,
 * `<xdr:pic>` for images, `<xdr:sp>` for shapes).
 *
 * The drawing part has its own rels file pointing to the actual
 * chart parts (`xl/charts/chart{N}.xml`) and image parts
 * (`xl/media/image{N}.<ext>`). The worksheet → drawing link is
 * separate from the drawing → chart/image links.
 *
 * Document model :
 *
 * ```js
 * {
 *   entries: [{
 *     type: 'chart' | 'picture' | 'shape' | 'graphicFrame',
 *     anchor: {
 *       kind: 'twoCell' | 'oneCell' | 'absolute',
 *       editAs?: 'oneCell' | 'absolute' | 'twoCell',
 *       from: { col, colOff, row, rowOff },
 *       to?:  { col, colOff, row, rowOff },   // twoCell only
 *       ext?: { cx, cy },                      // oneCell + absolute
 *       pos?: { x, y }                         // absolute only
 *     },
 *     // Per-type fields:
 *     graphicFrameName?, graphicFrameId?,
 *     chartRef?: string,           // r:id of the chart in the drawing part's rels
 *     embedRef?: string,           // r:id of the image
 *     picName?, picId?, description?, title?,
 *     prstGeom?: string,
 *     cx?, cy?, offsetX?, offsetY?,
 *     _node?: xmlNode              // for unsupported / preserved entries
 *   }],
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/xlsx/drawings
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { drawingml } from '../drawingml/drawingml.js';
import { ooxmlShared } from '../_shared/index.js';

export const xlsxDrawings = {
    name: 'xlsxDrawings',
    dependencies: ['ooxmlErrors', 'xml', 'drawingmlShape', 'drawingml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, drawingmlShape, drawingml, ooxmlShared],

    factory(errors, xml, shapeMod, dml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, encodeText, decodeText } = shared;

        const XDR_NS = NS.XDR;
        const A_NS = NS.A;
        const R_NS = NS.R;
        const REL_TYPE_DRAWING = REL_TYPE.DRAWING;
        const CT_DRAWING = CT.DRAWING;
        const CHART_URI = NS.C;

        // --- Anchor cell helpers ---

        function parseCellPos(el) {
            return {
                col: Number(xml.textContent(xml.findChild(el, 'xdr:col') || el) || 0),
                colOff: Number(xml.textContent(xml.findChild(el, 'xdr:colOff') || el) || 0),
                row: Number(xml.textContent(xml.findChild(el, 'xdr:row') || el) || 0),
                rowOff: Number(xml.textContent(xml.findChild(el, 'xdr:rowOff') || el) || 0)
            };
        }

        function renderCellPos(name, pos) {
            return xml.el(name, {}, [
                xml.el('xdr:col', {}, [xml.text(String(pos.col || 0))]),
                xml.el('xdr:colOff', {}, [xml.text(String(pos.colOff || 0))]),
                xml.el('xdr:row', {}, [xml.text(String(pos.row || 0))]),
                xml.el('xdr:rowOff', {}, [xml.text(String(pos.rowOff || 0))])
            ]);
        }

        function parseExt(el) {
            return { cx: Number(el.attrs.cx || 0), cy: Number(el.attrs.cy || 0) };
        }

        function renderExt(name, ext) {
            return xml.el(name, {
                cx: String(ext.cx || 0),
                cy: String(ext.cy || 0)
            });
        }

        // --- Anchor parse / render ---

        function parseAnchor(el) {
            const kind = el.name === 'xdr:twoCellAnchor' ? 'twoCell'
                       : el.name === 'xdr:oneCellAnchor' ? 'oneCell'
                       : el.name === 'xdr:absoluteAnchor' ? 'absolute'
                       : 'unknown';
            const out = { kind };
            if (el.attrs.editAs) out.editAs = el.attrs.editAs;
            const from = xml.findChild(el, 'xdr:from');
            if (from) out.from = parseCellPos(from);
            const to = xml.findChild(el, 'xdr:to');
            if (to) out.to = parseCellPos(to);
            const ext = xml.findChild(el, 'xdr:ext');
            if (ext) out.ext = parseExt(ext);
            const pos = xml.findChild(el, 'xdr:pos');
            if (pos) out.pos = { x: Number(pos.attrs.x || 0), y: Number(pos.attrs.y || 0) };
            return out;
        }

        function renderAnchor(anchor, content) {
            const tagByKind = {
                twoCell: 'xdr:twoCellAnchor',
                oneCell: 'xdr:oneCellAnchor',
                absolute: 'xdr:absoluteAnchor'
            };
            const tag = tagByKind[anchor.kind] || 'xdr:twoCellAnchor';
            const a = {};
            if (anchor.editAs) a.editAs = anchor.editAs;

            const children = [];
            if (anchor.kind === 'absolute') {
                children.push(xml.el('xdr:pos', {
                    x: String(anchor.pos ? anchor.pos.x : 0),
                    y: String(anchor.pos ? anchor.pos.y : 0)
                }));
                children.push(renderExt('xdr:ext', anchor.ext || { cx: 0, cy: 0 }));
            } else {
                children.push(renderCellPos('xdr:from', anchor.from || {}));
                if (anchor.kind === 'twoCell') {
                    children.push(renderCellPos('xdr:to', anchor.to || anchor.from || {}));
                } else {
                    children.push(renderExt('xdr:ext', anchor.ext || { cx: 0, cy: 0 }));
                }
            }
            children.push(content);
            children.push(xml.el('xdr:clientData', {}));
            return xml.el(tag, a, children);
        }

        // --- graphicFrame (chart, SmartArt, …) ---

        function parseGraphicFrame(gfEl) {
            const out = { type: 'graphicFrame' };
            const nv = xml.findChild(gfEl, 'xdr:nvGraphicFramePr');
            if (nv) {
                const cNvPr = xml.findChild(nv, 'xdr:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.graphicFrameId = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.graphicFrameName = cNvPr.attrs.name;
                }
            }
            const xfrm = xml.findChild(gfEl, 'xdr:xfrm');
            if (xfrm) {
                const off = xml.findChild(xfrm, 'a:off');
                const ext = xml.findChild(xfrm, 'a:ext');
                if (off) {
                    out.offsetX = Number(off.attrs.x || 0);
                    out.offsetY = Number(off.attrs.y || 0);
                }
                if (ext) {
                    out.cx = Number(ext.attrs.cx || 0);
                    out.cy = Number(ext.attrs.cy || 0);
                }
            }
            const graphic = xml.findChild(gfEl, 'a:graphic');
            if (graphic) {
                const gd = xml.findChild(graphic, 'a:graphicData');
                if (gd && gd.attrs.uri === CHART_URI) {
                    const chartEl = xml.findChild(gd, 'c:chart');
                    if (chartEl && chartEl.attrs['r:id']) {
                        out.type = 'chart';
                        out.chartRef = chartEl.attrs['r:id'];
                    }
                }
            }
            return out;
        }

        function renderGraphicFrame(entry) {
            const cNvPrAttrs = {
                id: String(entry.graphicFrameId != null ? entry.graphicFrameId : 2),
                name: entry.graphicFrameName || 'Chart'
            };
            const graphicChildren = [];
            if (entry.type === 'chart' && entry.chartRef) {
                graphicChildren.push(xml.el('a:graphicData', { uri: CHART_URI }, [
                    xml.el('c:chart', {
                        'xmlns:c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
                        'xmlns:r': R_NS,
                        'r:id': entry.chartRef
                    })
                ]));
            } else {
                // Unknown / preserved graphic data
                graphicChildren.push(xml.el('a:graphicData', { uri: '' }));
            }
            return xml.el('xdr:graphicFrame', { macro: '' }, [
                xml.el('xdr:nvGraphicFramePr', {}, [
                    xml.el('xdr:cNvPr', cNvPrAttrs),
                    xml.el('xdr:cNvGraphicFramePr', {})
                ]),
                xml.el('xdr:xfrm', {}, [
                    xml.el('a:off', {
                        x: String(entry.offsetX || 0),
                        y: String(entry.offsetY || 0)
                    }),
                    xml.el('a:ext', {
                        cx: String(entry.cx || 0),
                        cy: String(entry.cy || 0)
                    })
                ]),
                xml.el('a:graphic', {}, graphicChildren)
            ]);
        }

        // --- pic (image) ---

        function parsePic(picEl) {
            const out = { type: 'picture' };
            const nv = xml.findChild(picEl, 'xdr:nvPicPr');
            if (nv) {
                const cNvPr = xml.findChild(nv, 'xdr:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.picId = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.picName = cNvPr.attrs.name;
                    if (cNvPr.attrs.descr)      out.description = cNvPr.attrs.descr;
                    if (cNvPr.attrs.title)      out.title = cNvPr.attrs.title;
                }
            }
            const blipFill = xml.findChild(picEl, 'xdr:blipFill');
            if (blipFill) {
                const blip = xml.findChild(blipFill, 'a:blip');
                if (blip && blip.attrs['r:embed']) out.embedRef = blip.attrs['r:embed'];
            }
            const spPr = xml.findChild(picEl, 'xdr:spPr');
            if (spPr) {
                const xfrm = xml.findChild(spPr, 'a:xfrm');
                if (xfrm) {
                    const off = xml.findChild(xfrm, 'a:off');
                    const ext = xml.findChild(xfrm, 'a:ext');
                    if (off) {
                        out.offsetX = Number(off.attrs.x || 0);
                        out.offsetY = Number(off.attrs.y || 0);
                    }
                    if (ext) {
                        out.cx = Number(ext.attrs.cx || 0);
                        out.cy = Number(ext.attrs.cy || 0);
                    }
                }
                const prst = xml.findChild(spPr, 'a:prstGeom');
                if (prst && prst.attrs.prst) out.prstGeom = prst.attrs.prst;
            }
            return out;
        }

        function renderPic(entry) {
            const cNvPrAttrs = {
                id: String(entry.picId != null ? entry.picId : 2),
                name: entry.picName || 'Picture'
            };
            if (entry.description) cNvPrAttrs.descr = entry.description;
            if (entry.title)       cNvPrAttrs.title = entry.title;

            return xml.el('xdr:pic', {}, [
                xml.el('xdr:nvPicPr', {}, [
                    xml.el('xdr:cNvPr', cNvPrAttrs),
                    xml.el('xdr:cNvPicPr', {}, [
                        xml.el('a:picLocks', { noChangeAspect: '1' })
                    ])
                ]),
                xml.el('xdr:blipFill', {}, [
                    xml.el('a:blip', entry.embedRef ? { 'r:embed': entry.embedRef } : {}),
                    xml.el('a:stretch', {}, [xml.el('a:fillRect', {})])
                ]),
                xml.el('xdr:spPr', {}, [
                    xml.el('a:xfrm', {}, [
                        xml.el('a:off', {
                            x: String(entry.offsetX || 0),
                            y: String(entry.offsetY || 0)
                        }),
                        xml.el('a:ext', {
                            cx: String(entry.cx || 0),
                            cy: String(entry.cy || 0)
                        })
                    ]),
                    xml.el('a:prstGeom', { prst: entry.prstGeom || 'rect' }, [
                        xml.el('a:avLst', {})
                    ])
                ])
            ]);
        }

        // --- Shape (xdr:sp) ---

        function parseSp(spEl) {
            const out = { type: 'shape' };
            const nvSpPr = xml.findChild(spEl, 'xdr:nvSpPr');
            if (nvSpPr) {
                const cNvPr = xml.findChild(nvSpPr, 'xdr:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.id = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.name = cNvPr.attrs.name;
                    if (cNvPr.attrs.descr)      out.description = cNvPr.attrs.descr;
                }
            }
            // The xdr:spPr matches a:spPr structurally — drawingmlShape
            // parses it whatever the parent prefix (it just looks at the
            // a:* children).
            const spPr = xml.findChild(spEl, 'xdr:spPr');
            if (spPr) {
                const typed = shapeMod.parseShapeProperties(spPr);
                if (typed) out.shapeProps = typed;
            }
            const txBody = xml.findChild(spEl, 'xdr:txBody');
            if (txBody) out.txBody = dml.parseTextBody(txBody);
            return out;
        }

        function renderSp(entry) {
            const cNvPrAttrs = {
                id: String(entry.id != null ? entry.id : 2),
                name: entry.name || 'Shape'
            };
            if (entry.description) cNvPrAttrs.descr = entry.description;
            const children = [
                xml.el('xdr:nvSpPr', {}, [
                    xml.el('xdr:cNvPr', cNvPrAttrs),
                    xml.el('xdr:cNvSpPr', {})
                ])
            ];
            if (entry.shapeProps) {
                children.push(shapeMod.renderShapeProperties(entry.shapeProps, 'xdr:spPr'));
            } else {
                children.push(xml.el('xdr:spPr', {}));
            }
            if (entry.txBody) {
                children.push(dml.renderTextBody(entry.txBody, 'xdr:txBody'));
            }
            return xml.el('xdr:sp', { macro: '', textlink: '' }, children);
        }

        // --- Top-level parse / serialize ---

        function parseEntry(anchorEl) {
            const anchor = parseAnchor(anchorEl);
            // Find the wrapped graphical element.
            for (const c of anchorEl.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'xdr:graphicFrame') {
                    return Object.assign(parseGraphicFrame(c), { anchor });
                }
                if (c.name === 'xdr:pic') {
                    return Object.assign(parsePic(c), { anchor });
                }
                if (c.name === 'xdr:sp') {
                    return Object.assign(parseSp(c), { anchor });
                }
                if (c.name === 'xdr:cxnSp' || c.name === 'xdr:grpSp') {
                    return { type: 'shape', anchor, _node: c };
                }
            }
            return { type: 'graphicFrame', anchor };
        }

        function renderEntry(entry) {
            let content;
            if (entry.type === 'chart' || entry.type === 'graphicFrame') {
                content = renderGraphicFrame(entry);
            } else if (entry.type === 'picture') {
                content = renderPic(entry);
            } else if (entry.type === 'shape') {
                content = entry._node ? entry._node : renderSp(entry);
            } else if (entry._node) {
                content = entry._node;
            } else {
                content = renderGraphicFrame(entry);
            }
            return renderAnchor(entry.anchor || { kind: 'twoCell' }, content);
        }

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'xdr:wsDr') {
                throw new ParseError('xlsx/drawings-bad-root', `xlsx drawings: expected <xdr:wsDr>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const entries = [];
            const extras = [];
            for (const c of root.children) {
                if (c.type !== 'element') continue;
                if (c.name === 'xdr:twoCellAnchor'
                 || c.name === 'xdr:oneCellAnchor'
                 || c.name === 'xdr:absoluteAnchor') {
                    entries.push(parseEntry(c));
                } else {
                    extras.push(c);
                }
            }
            const out = { entries };
            if (extras.length) out._extras = extras;
            return out;
        }

        function serialize(obj) {
            const children = (obj.entries || []).map(renderEntry);
            if (obj._extras) for (const ex of obj._extras) children.push(ex);
            return xml.serialize(xml.el('xdr:wsDr',
                { 'xmlns:xdr': XDR_NS, 'xmlns:a': A_NS, 'xmlns:r': R_NS },
                children));
        }

        function bytesOf(obj) { return encodeText(serialize(obj)); }

        // --- Convenience anchor builders ---

        /**
         * Build a `twoCell` anchor from `(col, row)` start to
         * `(col + colSpan, row + rowSpan)`.
         */
        function twoCell(from, to) {
            return {
                kind: 'twoCell',
                editAs: 'oneCell',
                from: {
                    col: from.col, colOff: from.colOff || 0,
                    row: from.row, rowOff: from.rowOff || 0
                },
                to: {
                    col: to.col, colOff: to.colOff || 0,
                    row: to.row, rowOff: to.rowOff || 0
                }
            };
        }

        /** Build a `oneCell` anchor with explicit EMU extent. */
        function oneCell(from, ext) {
            return {
                kind: 'oneCell',
                from: {
                    col: from.col, colOff: from.colOff || 0,
                    row: from.row, rowOff: from.rowOff || 0
                },
                ext: { cx: ext.cx, cy: ext.cy }
            };
        }

        return {
            parse, serialize, bytesOf,
            parseAnchor, renderAnchor,
            parseGraphicFrame, renderGraphicFrame,
            parsePic, renderPic,
            twoCell, oneCell,
            REL_TYPE_DRAWING, CT_DRAWING, CHART_URI,
            XDR_NS, A_NS, R_NS
        };
    }
};
