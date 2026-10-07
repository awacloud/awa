// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview WordprocessingML drawings — `<w:drawing>` (ECMA-376
 * part 1 §17.3.3 + §20.4 wordprocessingDrawing namespace).
 *
 * `<w:drawing>` wraps either `<wp:inline>` (image flowing inline with
 * text, like a character) or `<wp:anchor>` (floating with positioning).
 * Both contain an `<a:graphic>` whose `<a:graphicData>` hosts a
 * `<pic:pic>` with `<a:blip r:embed="rId…"/>` referencing the binary
 * image part.
 *
 * **Inline** is the dominant case and fully modelled. **Anchor**
 * positioning attributes and wrap rules are preserved verbatim
 * through `_extras` for round-trip fidelity.
 *
 * Document model :
 *
 * ```js
 * {
 *   type: 'drawing',
 *   mode: 'inline' | 'anchor',
 *   cx: number,          // width in EMU
 *   cy: number,           // height in EMU
 *   docId?: number,       // <wp:docPr id=…>
 *   docName?: string,     // <wp:docPr name=…>
 *   description?: string, // <wp:docPr descr=…> (alt text)
 *   title?: string,
 *   distT?, distB?, distL?, distR?,
 *   embedRef?: string,    // r:id of the image — auto-assigned on write
 *   prstGeom?: string,    // 'rect' | 'roundRect' | … (default 'rect')
 *   image?: {
 *     data?: Uint8Array,        // bytes of the image file
 *     contentType?: string,     // sniffed if absent
 *     rId?: string              // alias of embedRef
 *   },
 *   anchorAttrs?: { ... },      // preserved attrs of <wp:anchor>
 *   anchorChildren?: [xmlNode], // wrap / positioning markers verbatim
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/docx/drawing
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlShape } from '../drawingml/shape.js';
import { ooxmlShared } from '../_shared/index.js';

export const docxDrawing = {
    name: 'docxDrawing',
    dependencies: ['xml', 'drawingmlShape', 'ooxmlShared'],
    deps: [xml, drawingmlShape, ooxmlShared],

    factory(xml, shapeMod, shared) {
        const { NS, REL_TYPE } = shared;
        const WP_NS = NS.WP;
        const A_NS = NS.A;
        const PIC_NS = NS.PIC;
        const R_NS = NS.R;
        const REL_TYPE_IMAGE = REL_TYPE.IMAGE;

        // --- Image content-type sniffing ---

        function sniffImageType(bytes) {
            if (!bytes || bytes.length < 4) return 'application/octet-stream';
            const b = bytes;
            // PNG: 89 50 4E 47 0D 0A 1A 0A
            if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
                return 'image/png';
            }
            // JPEG: FF D8 FF
            if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
                return 'image/jpeg';
            }
            // GIF: 47 49 46 38
            if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
                return 'image/gif';
            }
            // BMP: 42 4D
            if (b[0] === 0x42 && b[1] === 0x4D) {
                return 'image/bmp';
            }
            // WebP: RIFF....WEBP
            if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                && b.length >= 12
                && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
                return 'image/webp';
            }
            // TIFF: II*. or MM.*
            if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A && b[3] === 0x00)
             || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)) {
                return 'image/tiff';
            }
            return 'application/octet-stream';
        }

        function extensionFor(contentType) {
            switch (contentType) {
                case 'image/png':  return 'png';
                case 'image/jpeg': return 'jpg';
                case 'image/gif':  return 'gif';
                case 'image/bmp':  return 'bmp';
                case 'image/webp': return 'webp';
                case 'image/tiff': return 'tiff';
                case 'image/svg+xml': return 'svg';
                case 'image/x-emf': return 'emf';
                case 'image/x-wmf': return 'wmf';
                default: return 'bin';
            }
        }

        // --- EMU helpers (shared) ---

        const { EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96, toEmu } = shared;

        // --- Parse <w:drawing> ---

        function parseDrawing(drawingEl) {
            // Exactly one child: <wp:inline> or <wp:anchor>.
            const inline = xml.findChild(drawingEl, 'wp:inline');
            const anchor = xml.findChild(drawingEl, 'wp:anchor');
            const wrapper = inline || anchor;
            if (!wrapper) {
                return { type: 'drawing', mode: 'unknown', _extras: [drawingEl] };
            }
            const out = {
                type: 'drawing',
                mode: inline ? 'inline' : 'anchor'
            };

            // <wp:inline distT="…" distB="…" distL="…" distR="…">
            //   <wp:extent cx=… cy=…/>
            //   <wp:effectExtent .../>
            //   <wp:docPr id=… name=… descr=… title=…/>
            //   <wp:cNvGraphicFramePr><a:graphicFrameLocks/></wp:cNvGraphicFramePr>
            //   <a:graphic>...</a:graphic>
            // </wp:inline>
            for (const k of ['distT', 'distB', 'distL', 'distR']) {
                if (wrapper.attrs[k] != null) out[k] = Number(wrapper.attrs[k]);
            }
            const extent = xml.findChild(wrapper, 'wp:extent');
            if (extent) {
                out.cx = Number(extent.attrs.cx);
                out.cy = Number(extent.attrs.cy);
            }
            const docPr = xml.findChild(wrapper, 'wp:docPr');
            if (docPr) {
                if (docPr.attrs.id != null) out.docId = Number(docPr.attrs.id);
                if (docPr.attrs.name)       out.docName = docPr.attrs.name;
                if (docPr.attrs.descr)      out.description = docPr.attrs.descr;
                if (docPr.attrs.title)      out.title = docPr.attrs.title;
            }

            if (anchor) {
                // Preserve all anchor-only attrs.
                const aAttrs = {};
                for (const k of Object.keys(anchor.attrs)) {
                    if (!['distT', 'distB', 'distL', 'distR'].includes(k)) {
                        aAttrs[k] = anchor.attrs[k];
                    }
                }
                if (Object.keys(aAttrs).length) out.anchorAttrs = aAttrs;
                // Preserve positioning / wrap children verbatim.
                const positioning = [];
                for (const c of anchor.children) {
                    if (c.type !== 'element') continue;
                    if (c.name === 'wp:extent') continue;
                    if (c.name === 'wp:effectExtent') continue;
                    if (c.name === 'wp:docPr') continue;
                    if (c.name === 'wp:cNvGraphicFramePr') continue;
                    if (c.name === 'a:graphic') continue;
                    positioning.push(c);
                }
                if (positioning.length) out.anchorChildren = positioning;
            }

            // Extract the picture / chart / shape from the graphic.
            const graphic = xml.findChild(wrapper, 'a:graphic');
            if (graphic) {
                const gd = xml.findChild(graphic, 'a:graphicData');
                if (gd) {
                    const uri = gd.attrs.uri;
                    if (uri === 'http://schemas.openxmlformats.org/drawingml/2006/chart') {
                        parseChartInto(out, gd);
                    } else if (uri === 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
                            || uri === 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape') {
                        parseWpsInto(out, gd);
                    } else {
                        const pic = xml.findChild(gd, 'pic:pic');
                        if (pic) parsePicInto(out, pic);
                        else out._gdRaw = gd;  // unknown graphic data — preserve
                    }
                }
            }
            return out;
        }

        function parseWpsInto(out, gdEl) {
            // <wps:wsp> wraps the shape body.
            const wsp = xml.findChild(gdEl, 'wps:wsp');
            if (!wsp) return;
            out.kind = 'shape';
            const spPr = xml.findChild(wsp, 'wps:spPr');
            if (spPr) {
                const typed = shapeMod.parseShapeProperties(spPr);
                if (typed) out.shapeProps = typed;
            }
            // Preserve txbx / bodyPr verbatim — Word-style paragraphs
            // inside need access to docxStructure which would create a
            // dependency cycle ; the orchestrator post-processes.
            const txbx = xml.findChild(wsp, 'wps:txbx');
            if (txbx) out._wpsTxbx = txbx;
            const bodyPr = xml.findChild(wsp, 'wps:bodyPr');
            if (bodyPr) out._wpsBodyPr = bodyPr;
        }

        function parseChartInto(out, gdEl) {
            // <a:graphicData uri=".../chart"><c:chart r:id="rIdN"/></a:graphicData>
            const chartEl = xml.findChild(gdEl, 'c:chart');
            if (chartEl && chartEl.attrs['r:id']) {
                out.chartRef = chartEl.attrs['r:id'];
                out.kind = 'chart';
            }
        }

        function parsePicInto(out, picEl) {
            // pic/nvPicPr/cNvPr — picture name + id (often duplicated with docPr)
            const nvPicPr = xml.findChild(picEl, 'pic:nvPicPr');
            if (nvPicPr) {
                const cNvPr = xml.findChild(nvPicPr, 'pic:cNvPr');
                if (cNvPr && !out.picName) out.picName = cNvPr.attrs.name;
                if (cNvPr && cNvPr.attrs.id != null && out.picId == null) {
                    out.picId = Number(cNvPr.attrs.id);
                }
            }
            // pic/blipFill/blip → r:embed
            const blipFill = xml.findChild(picEl, 'pic:blipFill');
            if (blipFill) {
                const blip = xml.findChild(blipFill, 'a:blip');
                if (blip) {
                    if (blip.attrs['r:embed']) out.embedRef = blip.attrs['r:embed'];
                    if (blip.attrs['r:link'])  out.linkRef = blip.attrs['r:link'];
                }
            }
            // pic/spPr/prstGeom + xfrm
            const spPr = xml.findChild(picEl, 'pic:spPr');
            if (spPr) {
                const prst = xml.findChild(spPr, 'a:prstGeom');
                if (prst && prst.attrs.prst) out.prstGeom = prst.attrs.prst;
                const xfrm = xml.findChild(spPr, 'a:xfrm');
                if (xfrm) {
                    const off = xml.findChild(xfrm, 'a:off');
                    const ext = xml.findChild(xfrm, 'a:ext');
                    if (off) {
                        if (off.attrs.x != null) out.offsetX = Number(off.attrs.x);
                        if (off.attrs.y != null) out.offsetY = Number(off.attrs.y);
                    }
                    if (ext) {
                        // xfrm extent often duplicates wp:extent — keep wp's.
                    }
                }
            }
        }

        // --- Render ---

        function renderDrawing(drawing) {
            const inner = drawing.mode === 'anchor'
                ? renderAnchorWrapper(drawing)
                : renderInlineWrapper(drawing);
            return xml.el('w:drawing', {}, [inner]);
        }

        function renderInlineWrapper(d) {
            const a = {};
            for (const k of ['distT', 'distB', 'distL', 'distR']) {
                a[k] = d[k] != null ? String(d[k]) : '0';
            }
            return xml.el('wp:inline', a, [
                xml.el('wp:extent', {
                    cx: String(d.cx ?? 1000000),
                    cy: String(d.cy ?? 1000000)
                }),
                xml.el('wp:effectExtent',
                    { l: '0', t: '0', r: '0', b: '0' }),
                renderDocPr(d),
                xml.el('wp:cNvGraphicFramePr', {}, [
                    xml.el('a:graphicFrameLocks', {
                        'xmlns:a': A_NS, noChangeAspect: '1'
                    })
                ]),
                renderGraphic(d)
            ]);
        }

        function renderAnchorWrapper(d) {
            const a = Object.assign({}, d.anchorAttrs || {
                distT: '0', distB: '0', distL: '0', distR: '0',
                relativeHeight: '0', behindDoc: '0',
                locked: '0', layoutInCell: '1', allowOverlap: '1'
            });
            // Override distT/B/L/R if explicitly on the drawing.
            for (const k of ['distT', 'distB', 'distL', 'distR']) {
                if (d[k] != null) a[k] = String(d[k]);
            }
            const children = [];
            // Anchor positioning children (preserved verbatim) come first.
            if (d.anchorChildren) for (const c of d.anchorChildren) children.push(c);
            // Then the standard wp:extent / docPr / cNvGraphicFramePr / graphic.
            children.push(xml.el('wp:extent', {
                cx: String(d.cx ?? 1000000),
                cy: String(d.cy ?? 1000000)
            }));
            children.push(xml.el('wp:effectExtent',
                { l: '0', t: '0', r: '0', b: '0' }));
            children.push(renderDocPr(d));
            children.push(xml.el('wp:cNvGraphicFramePr', {}, [
                xml.el('a:graphicFrameLocks', {
                    'xmlns:a': A_NS, noChangeAspect: '1'
                })
            ]));
            children.push(renderGraphic(d));
            return xml.el('wp:anchor', a, children);
        }

        function renderDocPr(d) {
            const a = {
                id: String(d.docId != null ? d.docId : 1),
                name: d.docName || 'Picture'
            };
            if (d.description) a.descr = d.description;
            if (d.title)       a.title = d.title;
            return xml.el('wp:docPr', a);
        }

        function renderGraphic(d) {
            const picUri = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
            const chartUri = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
            const wpsUri = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
            const wpsNs = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
            // Shape (wps:wsp) drawing.
            if (d.kind === 'shape' || d.shapeProps) {
                const wspChildren = [
                    xml.el('wps:cNvSpPr', {})
                ];
                if (d.shapeProps) {
                    wspChildren.push(shapeMod.renderShapeProperties(d.shapeProps, 'wps:spPr'));
                }
                if (d._wpsTxbx)   wspChildren.push(d._wpsTxbx);
                if (d._wpsBodyPr) wspChildren.push(d._wpsBodyPr);
                else              wspChildren.push(xml.el('wps:bodyPr', {
                    rot: '0', spcFirstLastPara: '0',
                    vertOverflow: 'overflow', horzOverflow: 'overflow',
                    vert: 'horz', wrap: 'square', anchor: 't'
                }));
                return xml.el('a:graphic', { 'xmlns:a': A_NS }, [
                    xml.el('a:graphicData', { uri: wpsUri }, [
                        xml.el('wps:wsp', { 'xmlns:wps': wpsNs }, wspChildren)
                    ])
                ]);
            }
            // Chart drawing — emit <c:chart r:id=…/> in the graphicData.
            if (d.kind === 'chart' || d.chart) {
                return xml.el('a:graphic', { 'xmlns:a': A_NS }, [
                    xml.el('a:graphicData', { uri: chartUri }, [
                        xml.el('c:chart', {
                            'xmlns:c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
                            'xmlns:r': R_NS,
                            'r:id': d.chartRef || ''
                        })
                    ])
                ]);
            }
            // If we have unknown/unsupported graphicData, re-emit it.
            if (d._gdRaw && !d.embedRef) {
                return xml.el('a:graphic', { 'xmlns:a': A_NS }, [d._gdRaw]);
            }
            return xml.el('a:graphic', { 'xmlns:a': A_NS }, [
                xml.el('a:graphicData', { uri: picUri }, [renderPic(d)])
            ]);
        }

        function renderPic(d) {
            return xml.el('pic:pic', { 'xmlns:pic': PIC_NS }, [
                xml.el('pic:nvPicPr', {}, [
                    xml.el('pic:cNvPr', {
                        id: String(d.picId != null ? d.picId : 0),
                        name: d.picName || d.docName || 'Picture'
                    }),
                    xml.el('pic:cNvPicPr', {})
                ]),
                xml.el('pic:blipFill', {}, [
                    xml.el('a:blip', d.embedRef
                        ? { 'r:embed': d.embedRef }
                        : (d.linkRef ? { 'r:link': d.linkRef } : {})),
                    xml.el('a:stretch', {}, [xml.el('a:fillRect', {})])
                ]),
                xml.el('pic:spPr', {}, [
                    xml.el('a:xfrm', {}, [
                        xml.el('a:off', {
                            x: String(d.offsetX || 0),
                            y: String(d.offsetY || 0)
                        }),
                        xml.el('a:ext', {
                            cx: String(d.cx ?? 1000000),
                            cy: String(d.cy ?? 1000000)
                        })
                    ]),
                    xml.el('a:prstGeom', { prst: d.prstGeom || 'rect' }, [
                        xml.el('a:avLst', {})
                    ])
                ])
            ]);
        }

        // --- Convenience builder ---

        /**
         * Build a typed `{ type: 'drawing' }` run child for a PNG/JPEG/GIF
         * image. `data` is a `Uint8Array` of the file bytes.
         *
         * Sizes accept numbers (EMU) or strings with units (`'2in'`,
         * `'5cm'`, `'200px'`).
         *
         * Resulting node is meant to live inside a run's `children` array :
         *
         * ```js
         * { type: 'run',
         *   children: [docxDrawing.factory(...).image(bytes, {
         *       cx: '2in', cy: '1.5in', name: 'figure.png'
         *   })] }
         * ```
         */
        function image(data, opts = {}) {
            const contentType = opts.contentType || sniffImageType(data);
            const cx = toEmu(opts.cx || '2in');
            const cy = toEmu(opts.cy || (cx * 0.75));   // 4:3 aspect default
            const out = {
                type: 'drawing',
                mode: 'inline',
                cx, cy,
                docName: opts.name || 'Picture',
                prstGeom: opts.prstGeom || 'rect',
                image: { data, contentType }
            };
            if (opts.description) out.description = opts.description;
            if (opts.title)       out.title = opts.title;
            if (opts.rId)         out.embedRef = opts.rId;
            if (opts.docId != null) out.docId = opts.docId;
            return out;
        }

        /**
         * Build a typed `{ type: 'drawing', kind: 'chart' }` run child
         * holding a chart spec. The chart spec (built via
         * `drawingmlChart.barChart(…)` etc.) is stored in `chart` and
         * the orchestrator emits it as a separate part.
         */
        function chart(spec, opts = {}) {
            const cx = toEmu(opts.cx || '6in');
            const cy = toEmu(opts.cy || '4in');
            const out = {
                type: 'drawing',
                mode: 'inline',
                kind: 'chart',
                cx, cy,
                docName: opts.name || 'Chart',
                chart: spec
            };
            if (opts.description) out.description = opts.description;
            if (opts.title)       out.title = opts.title;
            if (opts.docId != null) out.docId = opts.docId;
            return out;
        }

        /**
         * Build a typed `{ type: 'drawing', kind: 'shape' }` run child
         * with preset geometry / fill / line. `shapeProps` is the typed
         * model from `drawingmlShape.shapeProps()`.
         */
        function shape(spec, opts = {}) {
            const cx = toEmu(opts.cx || '2in');
            const cy = toEmu(opts.cy || '1in');
            const props = typeof spec === 'string'
                ? shapeMod.shapeProps({ geom: spec, cx, cy, ...opts })
                : spec;
            return {
                type: 'drawing',
                mode: 'inline',
                kind: 'shape',
                cx, cy,
                docName: opts.name || 'Shape',
                shapeProps: props
            };
        }

        return {
            parseDrawing, renderDrawing, image, chart, shape,
            sniffImageType, extensionFor, toEmu,
            EMU_PER_INCH, EMU_PER_CM, EMU_PER_PT, EMU_PER_PX_96,
            REL_TYPE_IMAGE,
            WP_NS, A_NS, PIC_NS
        };
    }
};
