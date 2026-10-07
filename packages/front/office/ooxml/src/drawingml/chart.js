// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview DrawingML chart — `<c:chartSpace>` (ECMA-376 part 1
 * §21.2). Lives in a dedicated chart part referenced from the host
 * document (docx / xlsx / pptx) via a `…/relationships/chart` relation
 * and an `<a:graphicData uri=".../chart"><c:chart r:id="…"/></a:graphicData>`
 * wrapper.
 *
 * This module covers the chart **part** itself — independent of the
 * host. Hosts (pptx slides, docx drawings, xlsx worksheets) wrap the
 * chart in their own dispatch layer.
 *
 * Document model :
 *
 * ```js
 * {
 *   title?: string,                // simple text title
 *   plotType: 'bar'|'line'|'pie'|'scatter'|'area'|'doughnut',
 *   barDirection?: 'col'|'bar',    // bar/area only
 *   grouping?: 'standard'|'clustered'|'stacked'|'percentStacked',
 *   varyColors?: boolean,          // common for pie/doughnut
 *   formatCode?: string,           // numeric format on values, e.g. '0.00%'
 *   series: [{
 *     name: string,
 *     categories?: [string|number],   // x-axis labels (literal data)
 *     values: [number],               // y data (or scatter y)
 *     xValues?: [number],             // scatter x
 *     yValues?: [number],             // scatter alias of values
 *     color?: 'RRGGBB'                // solid fill override
 *   }],
 *   legend?: { position?: 'r'|'l'|'t'|'b'|'tr', overlay?: boolean },
 *   _extras?: [xmlNode]
 * }
 * ```
 *
 * @module ooxml/drawingml/chart
 */

import { ooxmlErrors } from '../errors.js';
import { xml } from '@awacloud/fw/io/codec/xml.js';
import { ooxmlShared } from '../_shared/index.js';

export const drawingmlChart = {
    name: 'drawingmlChart',
    dependencies: ['ooxmlErrors', 'xml', 'ooxmlShared'],
    deps: [ooxmlErrors, xml, ooxmlShared],

    factory(errors, xml, shared) {
        const { ParseError } = errors;
        const { NS, REL_TYPE, CT, readBoolAttr, writeBoolAttr, encodeText, decodeText } = shared;

        const C_NS = NS.C;
        const A_NS = NS.A;
        const R_NS = NS.R;
        const CHART_GRAPHIC_URI = C_NS;
        const REL_TYPE_CHART = REL_TYPE.CHART;
        const REL_TYPE_PACKAGE = REL_TYPE.PACKAGE;
        const CT_CHART = CT.CHART;
        const CT_EMBEDDED_XLSX = CT.EMBEDDED_XLSX;

        // --- Series literal data helpers ---

        function renderStrLit(values) {
            const pts = values.map((v, i) =>
                xml.el('c:pt', { idx: String(i) },
                    [xml.el('c:v', {}, [xml.text(String(v))])]));
            return xml.el('c:strLit', {}, [
                xml.el('c:ptCount', { val: String(values.length) }),
                ...pts
            ]);
        }

        function renderNumLit(values, formatCode) {
            const pts = values.map((v, i) =>
                xml.el('c:pt', { idx: String(i) },
                    [xml.el('c:v', {}, [xml.text(String(v))])]));
            const children = [
                xml.el('c:formatCode', {}, [xml.text(formatCode || 'General')]),
                xml.el('c:ptCount', { val: String(values.length) }),
                ...pts
            ];
            return xml.el('c:numLit', {}, children);
        }

        function parseLitValues(litEl) {
            return xml.findAll(litEl, 'c:pt').map(pt => {
                const v = xml.findChild(pt, 'c:v');
                return v ? xml.textContent(v) : '';
            });
        }

        function parseStrLit(el) { return parseLitValues(el); }
        function parseNumLit(el) {
            return parseLitValues(el).map(v => {
                const n = Number(v);
                return Number.isFinite(n) ? n : v;
            });
        }

        // --- Color fill helpers ---

        function renderSpPrSolid(rgb) {
            return xml.el('c:spPr', {}, [
                xml.el('a:solidFill', {}, [
                    xml.el('a:srgbClr', { val: rgb })
                ])
            ]);
        }

        function parseSpPrSolid(spPrEl) {
            if (!spPrEl) return undefined;
            const fill = xml.findChild(spPrEl, 'a:solidFill');
            if (!fill) return undefined;
            const cl = xml.findChild(fill, 'a:srgbClr');
            return cl ? cl.attrs.val : undefined;
        }

        // --- Series rendering / parsing ---

        function renderSeries(series, plotType, idx, formatCode) {
            const children = [
                xml.el('c:idx', { val: String(idx) }),
                xml.el('c:order', { val: String(idx) })
            ];
            // Series name
            children.push(xml.el('c:tx', {}, [
                xml.el('c:strRef', {}, [
                    xml.el('c:f', {}, [xml.text(`"${series.name || ''}"`)]),
                    renderStrLit([series.name || ''])
                ])
            ]));
            // Optional solid fill
            if (series.color) {
                children.push(renderSpPrSolid(series.color));
            }

            if (plotType === 'scatter') {
                // <c:xVal> + <c:yVal>
                const xVals = series.xValues || (series.categories || []);
                const yVals = series.yValues || series.values || [];
                children.push(xml.el('c:xVal', {}, [
                    xml.el('c:numRef', {}, [
                        xml.el('c:f', {}, [xml.text('""')]),
                        renderNumLit(xVals.map(Number), formatCode)
                    ])
                ]));
                children.push(xml.el('c:yVal', {}, [
                    xml.el('c:numRef', {}, [
                        xml.el('c:f', {}, [xml.text('""')]),
                        renderNumLit(yVals.map(Number), formatCode)
                    ])
                ]));
            } else {
                // Categories (optional — falls back to indices)
                if (series.categories && series.categories.length) {
                    children.push(xml.el('c:cat', {}, [
                        xml.el('c:strRef', {}, [
                            xml.el('c:f', {}, [xml.text('""')]),
                            renderStrLit(series.categories)
                        ])
                    ]));
                }
                children.push(xml.el('c:val', {}, [
                    xml.el('c:numRef', {}, [
                        xml.el('c:f', {}, [xml.text('""')]),
                        renderNumLit(series.values || [], formatCode)
                    ])
                ]));
            }
            return xml.el('c:ser', {}, children);
        }

        function parseSeries(serEl, plotType) {
            const out = {};
            const idx = xml.findChild(serEl, 'c:idx');
            if (idx) out._idx = Number(idx.attrs.val);
            const tx = xml.findChild(serEl, 'c:tx');
            if (tx) {
                const sr = xml.findChild(tx, 'c:strRef');
                const sl = xml.findChild(tx, 'c:strLit');
                const v = xml.findChild(tx, 'c:v');
                if (sr) {
                    const inner = xml.findChild(sr, 'c:strLit');
                    if (inner) out.name = parseLitValues(inner)[0] || '';
                    else {
                        const f = xml.findChild(sr, 'c:f');
                        if (f) out.name = xml.textContent(f).replace(/^"|"$/g, '');
                    }
                } else if (sl) {
                    out.name = parseLitValues(sl)[0] || '';
                } else if (v) {
                    out.name = xml.textContent(v);
                }
            }
            const spPr = xml.findChild(serEl, 'c:spPr');
            const color = parseSpPrSolid(spPr);
            if (color) out.color = color;

            if (plotType === 'scatter') {
                const xValEl = xml.findChild(serEl, 'c:xVal');
                const yValEl = xml.findChild(serEl, 'c:yVal');
                if (xValEl) out.xValues = readNumData(xValEl);
                if (yValEl) out.values = readNumData(yValEl);
            } else {
                const catEl = xml.findChild(serEl, 'c:cat');
                if (catEl) out.categories = readStrData(catEl);
                const valEl = xml.findChild(serEl, 'c:val');
                if (valEl) out.values = readNumData(valEl);
            }
            return out;
        }

        function readStrData(parentEl) {
            // <c:cat> wraps <c:strRef> (with possible cached <c:strLit>)
            // or directly <c:strLit>.
            const strRef = xml.findChild(parentEl, 'c:strRef');
            if (strRef) {
                const lit = xml.findChild(strRef, 'c:strLit');
                if (lit) return parseStrLit(lit);
            }
            const strLit = xml.findChild(parentEl, 'c:strLit');
            if (strLit) return parseStrLit(strLit);
            const numRef = xml.findChild(parentEl, 'c:numRef');
            if (numRef) {
                const lit = xml.findChild(numRef, 'c:numLit');
                if (lit) return parseLitValues(lit);
            }
            return [];
        }

        function readNumData(parentEl) {
            const numRef = xml.findChild(parentEl, 'c:numRef');
            if (numRef) {
                const lit = xml.findChild(numRef, 'c:numLit');
                if (lit) return parseNumLit(lit);
            }
            const numLit = xml.findChild(parentEl, 'c:numLit');
            if (numLit) return parseNumLit(numLit);
            return [];
        }

        // --- Plot-area children ---

        const PLOT_TAGS = {
            bar:      'c:barChart',
            line:     'c:lineChart',
            pie:      'c:pieChart',
            scatter:  'c:scatterChart',
            area:     'c:areaChart',
            doughnut: 'c:doughnutChart'
        };

        const TAG_TO_PLOT = Object.fromEntries(
            Object.entries(PLOT_TAGS).map(([k, v]) => [v, k]));

        function renderPlot(chart, axIds) {
            const tag = PLOT_TAGS[chart.plotType] || PLOT_TAGS.bar;
            const children = [];

            if (chart.plotType === 'bar' || chart.plotType === 'area') {
                children.push(xml.el('c:barDir', {
                    val: chart.barDirection || 'col'
                }));
            }
            if (chart.plotType !== 'pie' && chart.plotType !== 'doughnut'
                && chart.plotType !== 'scatter') {
                children.push(xml.el('c:grouping', {
                    val: chart.grouping || (chart.plotType === 'bar' ? 'clustered' : 'standard')
                }));
            }
            if (chart.plotType === 'scatter') {
                children.push(xml.el('c:scatterStyle', {
                    val: chart.scatterStyle || 'lineMarker'
                }));
            }
            children.push(xml.el('c:varyColors', {
                val: writeBoolAttr(chart.varyColors !== undefined
                    ? chart.varyColors
                    : (chart.plotType === 'pie' || chart.plotType === 'doughnut'))
            }));

            for (let i = 0; i < (chart.series || []).length; i++) {
                children.push(renderSeries(chart.series[i], chart.plotType, i,
                    chart.formatCode));
            }

            if (chart.plotType !== 'pie' && chart.plotType !== 'doughnut') {
                // axId pairs.
                children.push(xml.el('c:axId', { val: String(axIds[0]) }));
                children.push(xml.el('c:axId', { val: String(axIds[1]) }));
            } else if (chart.plotType === 'doughnut') {
                children.push(xml.el('c:firstSliceAng', {
                    val: String(chart.firstSliceAng || 0)
                }));
                children.push(xml.el('c:holeSize', {
                    val: String(chart.holeSize || 50)
                }));
            }

            return xml.el(tag, {}, children);
        }

        function parsePlot(plotEl) {
            const plotType = TAG_TO_PLOT[plotEl.name];
            const out = { plotType, series: [] };
            const barDir = xml.findChild(plotEl, 'c:barDir');
            if (barDir) out.barDirection = barDir.attrs.val;
            const grouping = xml.findChild(plotEl, 'c:grouping');
            if (grouping) out.grouping = grouping.attrs.val;
            const scatterStyle = xml.findChild(plotEl, 'c:scatterStyle');
            if (scatterStyle) out.scatterStyle = scatterStyle.attrs.val;
            const varyColors = xml.findChild(plotEl, 'c:varyColors');
            if (varyColors) out.varyColors = readBoolAttr(varyColors.attrs.val);
            for (const s of xml.findAll(plotEl, 'c:ser')) {
                out.series.push(parseSeries(s, plotType));
            }
            const fsa = xml.findChild(plotEl, 'c:firstSliceAng');
            if (fsa) out.firstSliceAng = Number(fsa.attrs.val);
            const hs = xml.findChild(plotEl, 'c:holeSize');
            if (hs) out.holeSize = Number(hs.attrs.val);
            return out;
        }

        // --- Axes ---

        function renderCatAx(axId, crossAx) {
            return xml.el('c:catAx', {}, [
                xml.el('c:axId', { val: String(axId) }),
                xml.el('c:scaling', {}, [
                    xml.el('c:orientation', { val: 'minMax' })
                ]),
                xml.el('c:delete', { val: '0' }),
                xml.el('c:axPos', { val: 'b' }),
                xml.el('c:crossAx', { val: String(crossAx) })
            ]);
        }

        function renderValAx(axId, crossAx) {
            return xml.el('c:valAx', {}, [
                xml.el('c:axId', { val: String(axId) }),
                xml.el('c:scaling', {}, [
                    xml.el('c:orientation', { val: 'minMax' })
                ]),
                xml.el('c:delete', { val: '0' }),
                xml.el('c:axPos', { val: 'l' }),
                xml.el('c:crossAx', { val: String(crossAx) })
            ]);
        }

        function axIdCat() { return 100000001; }
        function axIdVal() { return 200000001; }

        // --- Title ---

        function renderTitle(title) {
            return xml.el('c:title', {}, [
                xml.el('c:tx', {}, [
                    xml.el('c:rich', {}, [
                        xml.el('a:bodyPr', { rot: '0', spcFirstLastPara: '1', vertOverflow: 'ellipsis', wrap: 'square', anchor: 'ctr', anchorCtr: '1' }),
                        xml.el('a:lstStyle', {}),
                        xml.el('a:p', {}, [
                            xml.el('a:r', {}, [
                                xml.el('a:rPr', { lang: 'en-US' }),
                                xml.el('a:t', {}, [xml.text(String(title))])
                            ])
                        ])
                    ])
                ]),
                xml.el('c:overlay', { val: '0' })
            ]);
        }

        function parseTitle(titleEl) {
            const tx = xml.findChild(titleEl, 'c:tx');
            if (!tx) return undefined;
            const rich = xml.findChild(tx, 'c:rich');
            if (!rich) return undefined;
            const out = [];
            for (const p of xml.findAll(rich, 'a:p')) {
                for (const r of xml.findAll(p, 'a:r')) {
                    const t = xml.findChild(r, 'a:t');
                    if (t) out.push(xml.textContent(t));
                }
            }
            return out.join('');
        }

        // --- Legend ---

        function renderLegend(legend) {
            return xml.el('c:legend', {}, [
                xml.el('c:legendPos', { val: legend.position || 'r' }),
                xml.el('c:overlay', { val: writeBoolAttr(legend.overlay) })
            ]);
        }

        function parseLegend(legendEl) {
            const out = {};
            const pos = xml.findChild(legendEl, 'c:legendPos');
            if (pos) out.position = pos.attrs.val;
            const ov = xml.findChild(legendEl, 'c:overlay');
            if (ov) out.overlay = readBoolAttr(ov.attrs.val);
            return out;
        }

        // --- Top-level chart serialize / parse ---

        function serialize(chart) {
            const axIds = [axIdCat(), axIdVal()];
            const plotChildren = [];
            plotChildren.push(xml.el('c:layout', {}));
            plotChildren.push(renderPlot(chart, axIds));
            if (chart.plotType !== 'pie' && chart.plotType !== 'doughnut') {
                plotChildren.push(renderCatAx(axIds[0], axIds[1]));
                plotChildren.push(renderValAx(axIds[1], axIds[0]));
            }
            const plotArea = xml.el('c:plotArea', {}, plotChildren);

            const chartChildren = [];
            if (chart.title != null) {
                chartChildren.push(renderTitle(chart.title));
                chartChildren.push(xml.el('c:autoTitleDeleted', { val: '0' }));
            } else {
                chartChildren.push(xml.el('c:autoTitleDeleted', { val: '1' }));
            }
            chartChildren.push(plotArea);
            if (chart.legend) {
                chartChildren.push(renderLegend(chart.legend));
            }
            chartChildren.push(xml.el('c:plotVisOnly', { val: '1' }));
            chartChildren.push(xml.el('c:dispBlanksAs', { val: 'gap' }));
            if (chart._extras) for (const ex of chart._extras) chartChildren.push(ex);
            // <c:externalData r:id=…> emitted at chartSpace level
            // (handled outside this function — below).

            const rootChildren = [xml.el('c:chart', {}, chartChildren)];
            // <c:externalData r:id="rIdEmbed1"> ties the chart to its
            // embedded Excel workbook (Microsoft_Excel_Worksheet1.xlsx).
            // The host orchestrator wires the actual rId.
            if (chart.embeddedWorkbookRid) {
                rootChildren.push(xml.el('c:externalData', {
                    'r:id': chart.embeddedWorkbookRid
                }, [xml.el('c:autoUpdate', { val: '0' })]));
            }
            const root = xml.el('c:chartSpace',
                { 'xmlns:c': C_NS, 'xmlns:a': A_NS, 'xmlns:r': R_NS },
                rootChildren);
            return xml.serialize(root);
        }

        function parse(input) {
            const text = typeof input === 'string' ? input : decodeText(input);
            const root = xml.parse(text);
            if (root.name !== 'c:chartSpace') {
                throw new ParseError('drawingml/chart-bad-root', `drawingmlChart: expected <c:chartSpace>, got <${root.name}>`, { context: { elementName: root && root.name } });
            }
            const chartEl = xml.findChild(root, 'c:chart');
            if (!chartEl) throw new ParseError('drawingml/chart-missing', 'drawingmlChart: missing <c:chart>', { context: { elementName: 'c:chart' } });
            const out = {};

            const titleEl = xml.findChild(chartEl, 'c:title');
            if (titleEl) {
                const t = parseTitle(titleEl);
                if (t != null) out.title = t;
            }

            const plotArea = xml.findChild(chartEl, 'c:plotArea');
            if (plotArea) {
                for (const c of plotArea.children) {
                    if (c.type !== 'element') continue;
                    if (TAG_TO_PLOT[c.name]) {
                        Object.assign(out, parsePlot(c));
                        break;
                    }
                }
            }

            const legendEl = xml.findChild(chartEl, 'c:legend');
            if (legendEl) out.legend = parseLegend(legendEl);

            // <c:externalData> at chartSpace level (not chart level).
            const extData = xml.findChild(root, 'c:externalData');
            if (extData && extData.attrs['r:id']) {
                out.embeddedWorkbookRid = extData.attrs['r:id'];
            }

            return out;
        }

        function bytesOf(chart) { return encodeText(serialize(chart)); }

        // --- Builders ---

        function barChart(opts) {
            return Object.assign({
                plotType: 'bar',
                barDirection: opts.direction || 'col',
                grouping: opts.grouping || 'clustered',
                varyColors: false,
                series: opts.series || [],
                title: opts.title,
                legend: opts.legend
            });
        }

        function lineChart(opts) {
            return {
                plotType: 'line',
                grouping: opts.grouping || 'standard',
                varyColors: false,
                series: opts.series || [],
                title: opts.title,
                legend: opts.legend
            };
        }

        function pieChart(opts) {
            return {
                plotType: 'pie',
                varyColors: opts.varyColors !== false,
                series: opts.series || [],
                title: opts.title,
                legend: opts.legend
            };
        }

        function scatterChart(opts) {
            return {
                plotType: 'scatter',
                scatterStyle: opts.scatterStyle || 'lineMarker',
                varyColors: false,
                series: opts.series || [],
                title: opts.title,
                legend: opts.legend
            };
        }

        function doughnutChart(opts) {
            return {
                plotType: 'doughnut',
                varyColors: opts.varyColors !== false,
                holeSize: opts.holeSize || 50,
                series: opts.series || [],
                title: opts.title,
                legend: opts.legend
            };
        }

        return {
            parse, serialize, bytesOf,
            barChart, lineChart, pieChart, scatterChart, doughnutChart,
            renderSeries, parseSeries,
            renderTitle, parseTitle,
            renderLegend, parseLegend,
            CHART_GRAPHIC_URI, REL_TYPE_CHART, CT_CHART,
            REL_TYPE_PACKAGE, CT_EMBEDDED_XLSX,
            C_NS
        };
    }
};
