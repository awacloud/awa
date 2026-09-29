// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Minimal Canvas 2D charts for internal observability (taskmgr, metrics).
 * Provides the chart types: `line`, `area`, `bar`, `sparkline`.
 *
 * Out of MVP scope: pie/donut, log axes, interactive annotations, complex legends,
 * tooltips, PNG export. For those needs, use an external library.
 *
 * Worker-safe: no (Canvas 2D is main-thread only; OffscreenCanvas is out of MVP scope).
 *
 * @example
 * const chart = runtime.resolve('chart');
 * const handle = chart.line({ el: document.querySelector('canvas'), data: [1, 2, 3, 4] });
 * handle.update([2, 4, 3, 5]);
 * handle.dispose();
 */
import { dom } from '../query/dom.js';
import { animate } from '../display/animate.js';
import { stats } from '../../io/math/stats.js';
import { linalg } from '../../io/math/linalg.js';

/**
 * A live chart handle returned by each chart constructor.
 * @typedef {object} ChartHandle
 * @property {(newData: number[]|{x:number,y:number}[]) => void} update - Replace the data set and redraw.
 * @property {() => void} resize - Force a dimension recompute and redraw.
 * @property {(newOpts: Object) => void} setOpts - Merge new options (and optionally data) then redraw.
 * @property {() => void} dispose - Detach observers and release resources.
 */

/**
 * Canvas 2D chart surface returned by `factory()`.
 * @typedef {object} ChartAPI
 * @property {(opts: {el: HTMLElement|HTMLCanvasElement, data?: number[]|{x:number,y:number}[], xAxis?: Object, yAxis?: Object, color?: string, smoothing?: 'none'|'monotone', animate?: boolean|number}) => ChartHandle} line - Create a line chart.
 * @property {(opts: {el: HTMLElement|HTMLCanvasElement, data?: number[]|{x:number,y:number}[], xAxis?: Object, yAxis?: Object, color?: string, smoothing?: 'none'|'monotone', animate?: boolean|number}) => ChartHandle} area - Create an area chart (line + fill).
 * @property {(opts: {el: HTMLElement|HTMLCanvasElement, data?: number[]|{x:number,y:number}[], xAxis?: Object, yAxis?: Object, color?: string, animate?: boolean|number}) => ChartHandle} bar - Create a vertical bar chart.
 * @property {(opts: {el: HTMLElement|HTMLCanvasElement, data?: number[]|{x:number,y:number}[], color?: string, smoothing?: 'none'|'monotone', animate?: boolean|number}) => ChartHandle} sparkline - Create a minimal axis-less sparkline.
 */

export const chart = {
    name: 'chart',
    version: '1.0.0',
    type: 'fw.dom.rendering',
    dependencies: ['dom', 'animate', 'stats', 'linalg'],
    deps: [dom, animate, stats, linalg],

    /**
     * @param {Object} dom    - fw dom module.
     * @param {Object} animate - fw animate module.
     * @param {Object} stats   - fw stats module.
     * @param {Object} linalg  - fw linalg module.
     * @returns {ChartAPI}
     */
    factory(dom, animate, stats, linalg) {

        // ─────────────────────────────────────────────────────────────────
        // Internal helpers
        // ─────────────────────────────────────────────────────────────────

        /**
         * Normalise `data` to a `{x, y}[]` array.
         * Accepts `number[]` (x = index) or `{x, y}[]`.
         *
         * @param {number[]|{x:number,y:number}[]} data
         * @returns {{x:number,y:number}[]}
         */
        function _normalizeData(data) {
            if (!Array.isArray(data) || data.length === 0) return [];
            if (typeof data[0] === 'number') {
                return data.map((y, i) => ({ x: i, y }));
            }
            return data.map(p => ({ x: Number(p.x), y: Number(p.y) }));
        }

        /**
         * Compute the [min, max] domain along one dimension.
         * Returns `[0, 1]` when the domain is degenerate (flat data).
         *
         * @param {number[]} values
         * @returns {[number, number]}
         */
        function _domain(values) {
            if (!values.length) return [0, 1];
            const mn = stats.min(values);
            const mx = stats.max(values);
            if (mn === mx) return [mn - 1, mx + 1];
            return [mn, mx];
        }

        /**
         * Compute the domain with proportional padding (5 %).
         *
         * @param {number[]} values
         * @param {[number, number]|undefined} explicit
         * @returns {[number, number]}
         */
        function _fitDomain(values, explicit) {
            if (explicit && explicit.length === 2) return [explicit[0], explicit[1]];
            const [mn, mx] = _domain(values);
            const pad = (mx - mn) * 0.05;
            return [mn - pad, mx + pad];
        }

        /**
         * Generate readable ticks for a domain.
         *
         * @param {number} min
         * @param {number} max
         * @param {number} [count=5]
         * @returns {number[]}
         */
        function _ticks(min, max, count = 5) {
            const step = (max - min) / (count - 1 || 1);
            const out = [];
            for (let i = 0; i < count; i++) out.push(min + step * i);
            return out;
        }

        /**
         * Map a value from a domain to a pixel coordinate in [0, size].
         *
         * @param {number} v
         * @param {number} min
         * @param {number} max
         * @param {number} size
         * @returns {number}
         */
        function _scale(v, min, max, size) {
            if (max === min) return size / 2;
            return ((v - min) / (max - min)) * size;
        }

        /**
         * Compute a Fritsch-Carlson monotone tangent (single point).
         * Returns the slope for point i in the sorted {x,y}[] array.
         *
         * @param {{x:number,y:number}[]} pts
         * @param {number} i
         * @returns {number}
         */
        function _monotoneSlope(pts, i) {
            const n = pts.length;
            if (n < 2) return 0;
            if (i === 0) return (pts[1].y - pts[0].y) / (pts[1].x - pts[0].x || 1);
            if (i === n - 1) return (pts[n - 1].y - pts[n - 2].y) / (pts[n - 1].x - pts[n - 2].x || 1);
            const d0 = (pts[i].y - pts[i - 1].y) / (pts[i].x - pts[i - 1].x || 1);
            const d1 = (pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x || 1);
            if (d0 * d1 <= 0) return 0;
            const avg = (d0 + d1) / 2;
            // Clamp to 3 * delta to preserve monotonicity
            return Math.sign(avg) * Math.min(Math.abs(avg), 3 * Math.min(Math.abs(d0), Math.abs(d1)));
        }

        /**
         * Get or create a `<canvas>` inside `el`.
         * If `el` is already an `HTMLCanvasElement`, returns it as-is.
         *
         * @param {HTMLElement|HTMLCanvasElement} el
         * @returns {HTMLCanvasElement}
         */
        function _ensureCanvas(el) {
            // @ts-ignore - el may be HTMLElement; CANVAS check ensures correct type at runtime
            if (el && el.tagName === 'CANVAS') return el;
            const canvas = document.createElement('canvas');
            el.appendChild(canvas);
            return canvas;
        }

        /**
         * Apply the Device Pixel Ratio to a canvas.
         *
         * @param {HTMLCanvasElement} canvas
         * @param {number} w - Display width (CSS px)
         * @param {number} h - Display height (CSS px)
         * @returns {CanvasRenderingContext2D}
         */
        function _setupContext(canvas, w, h) {
            const dpr = (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(dpr, dpr);
            return ctx;
        }

        /**
         * Display dimensions of a canvas (CSS px).
         *
         * @param {HTMLCanvasElement} canvas
         * @returns {{w: number, h: number}}
         */
        function _displaySize(canvas) {
            const w = canvas.clientWidth || canvas.width || 300;
            const h = canvas.clientHeight || canvas.height || 150;
            return { w, h };
        }

        // ─────────────────────────────────────────────────────────────────
        // Axis drawing
        // ─────────────────────────────────────────────────────────────────

        const PAD = { top: 10, right: 10, bottom: 30, left: 40 };

        /**
         * Draw the X and Y axes with their tick marks.
         *
         * @param {CanvasRenderingContext2D} ctx
         * @param {{w:number,h:number}} size
         * @param {number} xMin
         * @param {number} xMax
         * @param {number} yMin
         * @param {number} yMax
         * @param {Object} [xAxisOpts]
         * @param {Object} [yAxisOpts]
         */
        function _drawAxes(ctx, size, xMin, xMax, yMin, yMax, xAxisOpts, yAxisOpts) {
            const { w, h } = size;
            const pl = PAD.left, pr = PAD.right, pt = PAD.top, pb = PAD.bottom;
            const cw = w - pl - pr;
            const ch = h - pt - pb;

            ctx.save();
            ctx.strokeStyle = '#888';
            ctx.fillStyle = '#888';
            ctx.lineWidth = 1;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            // Axe Y
            const yTicks = (yAxisOpts && yAxisOpts.ticks) || _ticks(yMin, yMax, 5);
            const yFmt = (yAxisOpts && yAxisOpts.format) || (v => String(Math.round(v * 100) / 100));
            for (const t of yTicks) {
                const py = pt + ch - _scale(t, yMin, yMax, ch);
                ctx.beginPath();
                ctx.moveTo(pl - 4, py);
                ctx.lineTo(pl, py);
                ctx.stroke();
                ctx.fillText(yFmt(t), pl - 6, py);
            }

            // Axe X
            const xTicks = (xAxisOpts && xAxisOpts.ticks) || _ticks(xMin, xMax, 5);
            const xFmt = (xAxisOpts && xAxisOpts.format) || (v => String(Math.round(v * 100) / 100));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const t of xTicks) {
                const px = pl + _scale(t, xMin, xMax, cw);
                ctx.beginPath();
                ctx.moveTo(px, pt + ch);
                ctx.lineTo(px, pt + ch + 4);
                ctx.stroke();
                ctx.fillText(xFmt(t), px, pt + ch + 6);
            }

            // Baseline axes
            ctx.beginPath();
            ctx.moveTo(pl, pt);
            ctx.lineTo(pl, pt + ch);
            ctx.lineTo(pl + cw, pt + ch);
            ctx.stroke();

            ctx.restore();
        }

        // ─────────────────────────────────────────────────────────────────
        // Renderers
        // ─────────────────────────────────────────────────────────────────

        /**
         * Draw a line (or area) on a Canvas 2D context.
         *
         * @param {CanvasRenderingContext2D} ctx
         * @param {{w:number,h:number}} size
         * @param {{x:number,y:number}[]} pts
         * @param {number} xMin
         * @param {number} xMax
         * @param {number} yMin
         * @param {number} yMax
         * @param {string} color
         * @param {'none'|'monotone'} smoothing
         * @param {boolean} fillArea
         */
        function _renderLine(ctx, size, pts, xMin, xMax, yMin, yMax, color, smoothing, fillArea) {
            if (!pts.length) return;
            const { w, h } = size;
            const pl = PAD.left, pr = PAD.right, pt = PAD.top, pb = PAD.bottom;
            const cw = w - pl - pr;
            const ch = h - pt - pb;

            ctx.save();
            ctx.beginPath();

            const toX = v => pl + _scale(v, xMin, xMax, cw);
            const toY = v => pt + ch - _scale(v, yMin, yMax, ch);

            const x0 = toX(pts[0].x);
            const y0 = toY(pts[0].y);
            ctx.moveTo(x0, y0);

            if (smoothing === 'monotone' && pts.length > 2) {
                for (let i = 0; i < pts.length - 1; i++) {
                    const cp1x = toX(pts[i].x + (pts[i + 1].x - pts[i].x) / 3);
                    const cp1y = toY(pts[i].y + _monotoneSlope(pts, i) * (pts[i + 1].x - pts[i].x) / 3);
                    const cp2x = toX(pts[i + 1].x - (pts[i + 1].x - pts[i].x) / 3);
                    const cp2y = toY(pts[i + 1].y - _monotoneSlope(pts, i + 1) * (pts[i + 1].x - pts[i].x) / 3);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(pts[i + 1].x), toY(pts[i + 1].y));
                }
            } else {
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(toX(pts[i].x), toY(pts[i].y));
                }
            }

            if (fillArea) {
                const baseline = pt + ch;
                ctx.lineTo(toX(pts[pts.length - 1].x), baseline);
                ctx.lineTo(toX(pts[0].x), baseline);
                ctx.closePath();
                ctx.fillStyle = color + '33';
                ctx.fill();
                // Re-draw the stroke on top of the fill
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                if (smoothing === 'monotone' && pts.length > 2) {
                    for (let i = 0; i < pts.length - 1; i++) {
                        const cp1x = toX(pts[i].x + (pts[i + 1].x - pts[i].x) / 3);
                        const cp1y = toY(pts[i].y + _monotoneSlope(pts, i) * (pts[i + 1].x - pts[i].x) / 3);
                        const cp2x = toX(pts[i + 1].x - (pts[i + 1].x - pts[i].x) / 3);
                        const cp2y = toY(pts[i + 1].y - _monotoneSlope(pts, i + 1) * (pts[i + 1].x - pts[i].x) / 3);
                        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX(pts[i + 1].x), toY(pts[i + 1].y));
                    }
                } else {
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(toX(pts[i].x), toY(pts[i].y));
                    }
                }
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }

        /**
         * Draw vertical bars.
         *
         * @param {CanvasRenderingContext2D} ctx
         * @param {{w:number,h:number}} size
         * @param {{x:number,y:number}[]} pts
         * @param {number} xMin
         * @param {number} xMax
         * @param {number} yMin
         * @param {number} yMax
         * @param {string} color
         */
        function _renderBar(ctx, size, pts, xMin, xMax, yMin, yMax, color) {
            if (!pts.length) return;
            const { w, h } = size;
            const pl = PAD.left, pr = PAD.right, pt = PAD.top, pb = PAD.bottom;
            const cw = w - pl - pr;
            const ch = h - pt - pb;

            const toX = v => pl + _scale(v, xMin, xMax, cw);
            const toY = v => pt + ch - _scale(v, yMin, yMax, ch);

            const barW = Math.max(2, cw / pts.length * 0.7);
            const baseline = pt + ch;

            ctx.save();
            ctx.fillStyle = color + 'aa';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            for (const p of pts) {
                const bx = toX(p.x) - barW / 2;
                const by = toY(p.y);
                const bh = baseline - by;
                if (bh > 0) {
                    ctx.fillRect(bx, by, barW, bh);
                    ctx.strokeRect(bx, by, barW, bh);
                }
            }

            ctx.restore();
        }

        // ─────────────────────────────────────────────────────────────────
        // Handle constructor
        // ─────────────────────────────────────────────────────────────────

        /**
         * Create a chart handle (line, area or bar).
         *
         * @param {Object} opts
         * @param {'line'|'area'|'bar'} chartType
         * @returns {{ update, resize, setOpts, dispose, _state }}
         */
        function _createHandle(opts, chartType) {
            let _opts = Object.assign({
                color: '#4a9eff',
                smoothing: 'none',
                animate: false,
            }, opts);

            let _data = _normalizeData(_opts.data || []);
            const _canvas = _ensureCanvas(_opts.el);
            let _ro = null;
            let _disposed = false;
            let _animRafId = null;

            // Internal state exposed for debug/tests
            const _state = {
                data: _data,
                xDomain: [0, 1],
                yDomain: [0, 1],
            };

            function _computeDomains() {
                const xs = _data.map(p => p.x);
                const ys = _data.map(p => p.y);
                _state.xDomain = _fitDomain(xs, _opts.xAxis && _opts.xAxis.domain);
                _state.yDomain = _fitDomain(ys, _opts.yAxis && _opts.yAxis.domain);
            }

            function _draw() {
                if (_disposed) return;
                // Domains always recomputed (independent of the canvas context)
                _computeDomains();
                const { w, h } = _displaySize(_canvas);
                const ctx = _setupContext(_canvas, w, h);
                if (!ctx) return;

                ctx.clearRect(0, 0, w, h);

                const [xMin, xMax] = _state.xDomain;
                const [yMin, yMax] = _state.yDomain;

                if (chartType !== 'bar') {
                    _drawAxes(ctx, { w, h }, xMin, xMax, yMin, yMax,
                        _opts.xAxis, _opts.yAxis);
                    _renderLine(ctx, { w, h }, _data, xMin, xMax, yMin, yMax,
                        _opts.color, _opts.smoothing || 'none', chartType === 'area');
                } else {
                    _drawAxes(ctx, { w, h }, xMin, xMax, yMin, yMax,
                        _opts.xAxis, _opts.yAxis);
                    _renderBar(ctx, { w, h }, _data, xMin, xMax, yMin, yMax,
                        _opts.color);
                }
            }

            function _drawAnimated() {
                if (_disposed) return;
                if (_animRafId !== null) cancelAnimationFrame(_animRafId);
                const dur = typeof _opts.animate === 'number' ? _opts.animate : 300;
                // Simple progression: alpha from 0 to 1 over `dur` ms
                const { w, h } = _displaySize(_canvas);
                const ctx = _setupContext(_canvas, w, h);
                if (!ctx) { _draw(); return; }

                const startTs = { ts: null };
                function frame(ts) {
                    if (_disposed) return;
                    if (startTs.ts === null) startTs.ts = ts;
                    const elapsed = ts - startTs.ts;
                    const t = Math.min(elapsed / dur, 1);
                    ctx.globalAlpha = t;
                    _draw();
                    ctx.globalAlpha = 1;
                    if (t < 1) {
                        _animRafId = requestAnimationFrame(frame);
                    } else {
                        _animRafId = null;
                    }
                }
                _animRafId = requestAnimationFrame(frame);
            }

            function _render() {
                if (_opts.animate) {
                    _drawAnimated();
                } else {
                    _draw();
                }
            }

            // Setup ResizeObserver if the canvas is not the explicit element (i.e. a container)
            if (_opts.el && _opts.el.tagName !== 'CANVAS' && typeof ResizeObserver !== 'undefined') {
                _ro = new ResizeObserver(() => resize());
                _ro.observe(_opts.el);
            }

            _render();

            /**
             * Update the data set and redraw.
             *
             * @param {number[]|{x:number,y:number}[]} newData
             */
            function update(newData) {
                _data = _normalizeData(newData);
                _state.data = _data;
                _render();
            }

            /**
             * Force a dimension recompute and redraw.
             */
            function resize() {
                if (_disposed) return;
                _draw();
            }

            /**
             * Merge new options and redraw.
             *
             * @param {Object} newOpts
             */
            function setOpts(newOpts) {
                _opts = Object.assign(_opts, newOpts);
                if (newOpts.data !== undefined) {
                    _data = _normalizeData(newOpts.data);
                    _state.data = _data;
                }
                _render();
            }

            /**
             * Detach observers and release resources.
             */
            function dispose() {
                _disposed = true;
                if (_ro) { _ro.disconnect(); _ro = null; }
                if (_animRafId !== null) { cancelAnimationFrame(_animRafId); _animRafId = null; }
            }

            return { update, resize, setOpts, dispose, _state };
        }

        // ─────────────────────────────────────────────────────────────────
        // Public API
        // ─────────────────────────────────────────────────────────────────

        /**
         * Line chart.
         *
         * @param {{el, data, xAxis?, yAxis?, color?, smoothing?, animate?}} opts
         * @returns {{ update, resize, setOpts, dispose }}
         */
        function line(opts) {
            return _createHandle(opts, 'line');
        }

        /**
         * Area chart (line + fill under the curve).
         *
         * @param {{el, data, xAxis?, yAxis?, color?, smoothing?, animate?}} opts
         * @returns {{ update, resize, setOpts, dispose }}
         */
        function area(opts) {
            return _createHandle(opts, 'area');
        }

        /**
         * Vertical bar chart.
         *
         * @param {{el, data, xAxis?, yAxis?, color?, animate?}} opts
         * @returns {{ update, resize, setOpts, dispose }}
         */
        function bar(opts) {
            return _createHandle(opts, 'bar');
        }

        /**
         * Sparkline: minimal line with no axes or ticks.
         *
         * @param {{el, data, color?, smoothing?, animate?}} opts
         * @returns {{ update, resize, setOpts, dispose }}
         */
        function sparkline(opts) {
            // Override PAD to zero locally: draws directly onto the full canvas
            const canvas = _ensureCanvas(opts.el);
            let _data = _normalizeData(opts.data || []);
            let _opts = Object.assign({ color: '#4a9eff', smoothing: 'none', animate: false }, opts);
            let _ro = null;
            let _disposed = false;

            const _state = { data: _data, xDomain: [0, 1], yDomain: [0, 1] };

            function _draw() {
                if (_disposed) return;
                const { w, h } = _displaySize(canvas);
                const ctx = _setupContext(canvas, w, h);
                if (!ctx) return;
                ctx.clearRect(0, 0, w, h);

                if (!_data.length) return;

                const xs = _data.map(p => p.x);
                const ys = _data.map(p => p.y);
                const [xMin, xMax] = _fitDomain(xs, undefined);
                const [yMin, yMax] = _fitDomain(ys, undefined);
                _state.xDomain = [xMin, xMax];
                _state.yDomain = [yMin, yMax];

                const toX = v => _scale(v, xMin, xMax, w);
                const toY = v => h - _scale(v, yMin, yMax, h);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(toX(_data[0].x), toY(_data[0].y));
                for (let i = 1; i < _data.length; i++) {
                    ctx.lineTo(toX(_data[i].x), toY(_data[i].y));
                }
                ctx.strokeStyle = _opts.color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();
            }

            if (_opts.el && _opts.el.tagName !== 'CANVAS' && typeof ResizeObserver !== 'undefined') {
                _ro = new ResizeObserver(() => _draw());
                _ro.observe(_opts.el);
            }

            _draw();

            function update(newData) {
                _data = _normalizeData(newData);
                _state.data = _data;
                _draw();
            }

            function resize() { if (!_disposed) _draw(); }

            function setOpts(newOpts) {
                _opts = Object.assign(_opts, newOpts);
                if (newOpts.data !== undefined) {
                    _data = _normalizeData(newOpts.data);
                    _state.data = _data;
                }
                _draw();
            }

            function dispose() {
                _disposed = true;
                if (_ro) { _ro.disconnect(); _ro = null; }
            }

            // @ts-ignore - _state is internal debug state not in public typedef
            return { update, resize, setOpts, dispose, _state };
        }

        return { line, area, bar, sparkline };
    }
};
