// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed parse/render of the deep `chart:*`
 * element tree — title/subtitle/footer, legend, plot-area, axis,
 * categories, grid, series, domain, data-point, mean-value,
 * regression-curve, error-indicator, stock-gain/loss/range, wall/floor,
 * label-separator, equation, data-label.
 *
 * @module odf/extra/chart-typed
 */



import { xml } from '@awacloud/fw/io/codec/xml.js';
import { odfTypedHelper } from './_typed-helper.js';

export const chartTyped = {
    name: 'chartTyped',
    dependencies: ['xml', 'odfTypedHelper'],
    deps: [xml, odfTypedHelper],

    factory(xml, odfTypedHelper) {
        const ELEMENTS = new Set([
            'chart:chart', 'chart:title', 'chart:subtitle', 'chart:footer',
            'chart:legend', 'chart:plot-area',
            'chart:axis', 'chart:categories', 'chart:grid',
            'chart:series', 'chart:domain', 'chart:data-point',
            'chart:mean-value', 'chart:regression-curve', 'chart:error-indicator',
            'chart:stock-gain-marker', 'chart:stock-loss-marker',
            'chart:stock-range-line', 'chart:wall', 'chart:floor',
            'chart:label-separator', 'chart:equation', 'chart:data-label'
        ]);

        const f = odfTypedHelper.buildTypedFamily(ELEMENTS, 'chart:', 'chart-node');

        function parseChart(el) { return f.parseElement(el); }
        function renderChart(obj) { return f.renderElement(obj); }

        function hydrateChart(c) {
            if (!c || !c._extras) return c;
            const extras = Array.isArray(c._extras) ? c._extras : (c._extras.children || []);
            const remaining = [];
            const promoted = c.chartNodes || [];
            for (const e of extras) {
                if (e && e.type === 'element' && ELEMENTS.has(e.name)) {
                    promoted.push(f.parseElement(e));
                } else { remaining.push(e); }
            }
            if (promoted.length) c.chartNodes = promoted;
            if (Array.isArray(c._extras)) {
                if (remaining.length) c._extras = remaining; else delete c._extras;
            } else {
                if (remaining.length) c._extras.children = remaining; else delete c._extras.children;
                if (!Object.keys(c._extras).length) delete c._extras;
            }
            return c;
        }

        function dehydrateChart(c) {
            if (!c || !c.chartNodes || !c.chartNodes.length) return c;
            const out = { ...c };
            const extras = Array.isArray(out._extras) ? [...out._extras]
                : (out._extras && Array.isArray(out._extras.children) ? [...out._extras.children] : []);
            for (const n of out.chartNodes) extras.push(f.renderElement(n));
            delete out.chartNodes;
            if (Array.isArray(c._extras) || !c._extras) out._extras = extras;
            else out._extras = { ...c._extras, children: extras };
            return out;
        }

        return { ...f, parseChart, renderChart, hydrateChart, dehydrateChart };
    }
};
