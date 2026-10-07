// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Slide-level chart wrapper — `<p:graphicFrame>` containing
 * `<a:graphic><a:graphicData uri=".../chart"><c:chart r:id="…"/>` (ECMA-376
 * part 1 §19.3.1.21 + §21.2).
 *
 * Chart data lives in a separate `ppt/charts/chart{N}.xml` part (managed
 * by `drawingmlChart`). This adapter only handles the host-side wrapper
 * (extent, offset, nvGraphicFramePr) and the relationship reference.
 *
 * Document model (the slide-level shape) :
 *
 * ```js
 * {
 *   type: 'chart',
 *   id?, name?,
 *   cx, cy,
 *   offsetX?, offsetY?,
 *   chartRef?: string,    // r:id of the chart part (auto-assigned at write)
 *   chart?: chartObject,  // populated on read; the chart spec to write on output
 *   _extras?
 * }
 * ```
 *
 * @module ooxml/pptx/chart
 */

import { xml } from '@awacloud/fw/io/codec/xml.js';
import { drawingmlChart } from '../drawingml/chart.js';
import { ooxmlShared } from '../_shared/index.js';

export const pptxChart = {
    name: 'pptxChart',
    dependencies: ['xml', 'drawingmlChart', 'ooxmlShared'],
    deps: [xml, drawingmlChart, ooxmlShared],

    factory(xml, chartMod, shared) {
        const { NS } = shared;
        const A_NS = NS.A;
        const R_NS = NS.R;
        const CHART_URI = chartMod.CHART_GRAPHIC_URI;

        function parseGraphicFrame(gfEl) {
            const graphic = xml.findChild(gfEl, 'a:graphic');
            if (!graphic) return null;
            const gd = xml.findChild(graphic, 'a:graphicData');
            if (!gd || gd.attrs.uri !== CHART_URI) return null;
            const chart = xml.findChild(gd, 'c:chart');
            if (!chart) return null;

            const out = { type: 'chart' };
            if (chart.attrs['r:id']) out.chartRef = chart.attrs['r:id'];

            const nv = xml.findChild(gfEl, 'p:nvGraphicFramePr');
            if (nv) {
                const cNvPr = xml.findChild(nv, 'p:cNvPr');
                if (cNvPr) {
                    if (cNvPr.attrs.id != null) out.id = Number(cNvPr.attrs.id);
                    if (cNvPr.attrs.name)       out.name = cNvPr.attrs.name;
                }
            }
            const xfrm = xml.findChild(gfEl, 'p:xfrm');
            if (xfrm) {
                const off = xml.findChild(xfrm, 'a:off');
                const ext = xml.findChild(xfrm, 'a:ext');
                if (off) {
                    if (off.attrs.x != null) out.offsetX = Number(off.attrs.x);
                    if (off.attrs.y != null) out.offsetY = Number(off.attrs.y);
                }
                if (ext) {
                    if (ext.attrs.cx != null) out.cx = Number(ext.attrs.cx);
                    if (ext.attrs.cy != null) out.cy = Number(ext.attrs.cy);
                }
            }
            return out;
        }

        function renderGraphicFrame(c) {
            const cNvPrAttrs = {
                id: String(c.id != null ? c.id : 5),
                name: c.name || 'Chart'
            };
            const chartAttrs = {};
            if (c.chartRef) chartAttrs['r:id'] = c.chartRef;
            return xml.el('p:graphicFrame', {}, [
                xml.el('p:nvGraphicFramePr', {}, [
                    xml.el('p:cNvPr', cNvPrAttrs),
                    xml.el('p:cNvGraphicFramePr', {}),
                    xml.el('p:nvPr', {})
                ]),
                xml.el('p:xfrm', {}, [
                    xml.el('a:off', {
                        x: String(c.offsetX || 0),
                        y: String(c.offsetY || 0)
                    }),
                    xml.el('a:ext', {
                        cx: String(c.cx ?? 6000000),
                        cy: String(c.cy ?? 4000000)
                    })
                ]),
                xml.el('a:graphic', {}, [
                    xml.el('a:graphicData', { uri: CHART_URI }, [
                        xml.el('c:chart', Object.assign(
                            { 'xmlns:c': chartMod.C_NS,
                              'xmlns:r': R_NS },
                            chartAttrs))
                    ])
                ])
            ]);
        }

        return {
            parseGraphicFrame, renderGraphicFrame,
            CHART_URI, A_NS, R_NS
        };
    }
};
