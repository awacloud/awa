// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Virtualised list for rendering collections of 10^4 to 10^6 items without
 * prohibitive memory / CPU cost. Only visible items plus a configurable
 * overscan are materialised in the DOM.
 *
 * Two modes :
 * - `fixed` (MVP, default) : fixed `itemHeight` in px - O(1) range computation,
 *   no DOM measurement.
 * - `variable` : heights measured on the fly and cached in a `Map<idx, height>`.
 *   Heights are only re-measured when a previously-unseen index is rendered ;
 *   `setTotal` invalidates the cache beyond the given index.
 *
 * DOM structure :
 * ```
 * container (overflow: auto)
 *   ├─ spacer   (height = total * itemHeight in fixed mode)
 *   └─ layer    (position: absolute; top: scrollTop-adjusted)
 *       └─ rendered items (overscan included)
 * ```
 *
 * `renderItem(idx)` may return an `HTMLElement` or an elm-array compatible
 * with `dom` / `template`.
 *
 * Out of scope for MVP : node recycling, sticky headers, horizontal axes.
 *
 * The scroll listener is bound directly on the container via `addEventListener`
 * (single owner, lifecycle handled by `dispose()`) - no dependency on the
 * `events` registry.
 *
 * @example
 * const vs = runtime.resolve('virtualScroll');
 * const list = vs.create({
 *     container: document.getElementById('list'),
 *     itemHeight: 32,
 *     total: 50000,
 *     renderItem(idx) {
 *         const li = document.createElement('li');
 *         li.textContent = `Item ${idx}`;
 *         return li;
 *     }
 * });
 * list.scrollTo(1000);
 * list.dispose();
 */
import { dom } from '../query/dom.js';

/**
 * A virtualised-list instance returned by `create()`.
 * @typedef {object} VirtualScrollInstance
 * @property {() => void} refresh - Re-render the visible range after a data/total change.
 * @property {(n: number) => void} setTotal - Update the total item count and refresh.
 * @property {(idx: number, scrollOpts?: {align?: 'start'|'center'|'end'|'auto'}) => void} scrollTo - Programmatically scroll to an index.
 * @property {() => {start: number, end: number}} visibleRange - Return the currently visible index range.
 * @property {(idx: number) => number} measure - Return the (measured or estimated) height of an item.
 * @property {() => void} dispose - Detach listeners and clear the layer.
 */

/**
 * Virtualised-list surface returned by `factory()`.
 * @typedef {object} VirtualScrollAPI
 * @property {(opts: {container: Element, itemHeight: number, total: number, renderItem: (idx: number) => (Element|Array), overscan?: number, mode?: 'fixed'|'variable'}) => VirtualScrollInstance} create - Create a virtualised-list instance.
 */

export const virtualScroll = {
    name: 'virtualScroll',
    version: '1.1.0',
    type: 'fw.dom.rendering',
    dependencies: ['dom'],
    deps: [dom],

    /**
     * @param {Object} dom - Resolved `dom` module instance.
     * @returns {VirtualScrollAPI}
     */
    factory(dom) {

        /**
         * Create a virtualised-list instance.
         *
         * @param {Object}   opts
         * @param {Element}  opts.container   - Scrollable element (overflow: auto).
         * @param {number}   opts.itemHeight  - Item height in px (fixed mode).
         * @param {number}   opts.total       - Total item count.
         * @param {Function} opts.renderItem  - `(idx) → HTMLElement | ElmNode[]`
         * @param {number}   [opts.overscan=3]        - Extra items rendered above/below the viewport.
         * @param {'fixed'|'variable'} [opts.mode='fixed'] - Height computation mode.
         * @returns {{ refresh, setTotal, scrollTo, visibleRange, measure, dispose }}
         */
        function create(opts) {
            const {
                container,
                renderItem
            } = opts;

            let itemHeight = opts.itemHeight;
            let total      = opts.total;
            const overscan = (opts.overscan !== undefined) ? opts.overscan : 3;
            const mode     = opts.mode || 'fixed';

            // Per-index height cache for variable mode.
            const heightCache = new Map();
            const DEFAULT_VARIABLE_HEIGHT = itemHeight || 40;

            // ── DOM structure ───────────────────────────────────────────────
            const spacer = document.createElement('div');
            spacer.style.position = 'relative';

            const layer = document.createElement('div');
            layer.style.position = 'absolute';
            layer.style.top = '0';
            layer.style.left = '0';
            layer.style.width = '100%';

            // @ts-ignore - element.style exists on HTMLElement; typed as Element here
            container.style.position = 'relative';
            // @ts-ignore - element.style exists on HTMLElement; typed as Element here
            container.style.overflow = 'auto';
            container.appendChild(spacer);
            container.appendChild(layer);

            // ── Helpers ─────────────────────────────────────────────────────

            function _totalHeight() {
                if (mode === 'fixed') {
                    return total * itemHeight;
                }
                // Variable mode : estimated sum (partial cache + default).
                let h = 0;
                for (let i = 0; i < total; i++) {
                    h += heightCache.has(i) ? heightCache.get(i) : DEFAULT_VARIABLE_HEIGHT;
                }
                return h;
            }

            function _offsetForIndex(idx) {
                if (mode === 'fixed') {
                    return idx * itemHeight;
                }
                let h = 0;
                for (let i = 0; i < idx; i++) {
                    h += heightCache.has(i) ? heightCache.get(i) : DEFAULT_VARIABLE_HEIGHT;
                }
                return h;
            }

            function _indexAtOffset(offset) {
                if (mode === 'fixed') {
                    return Math.floor(offset / itemHeight);
                }
                let h = 0;
                for (let i = 0; i < total; i++) {
                    const ih = heightCache.has(i) ? heightCache.get(i) : DEFAULT_VARIABLE_HEIGHT;
                    h += ih;
                    if (h > offset) return i;
                }
                return total - 1;
            }

            function _containerHeight() {
                const rect = container.getBoundingClientRect();
                return rect.height || container.clientHeight || 0;
            }

            function _computeRange() {
                const scrollTop    = container.scrollTop || 0;
                const viewportH    = _containerHeight();
                const start = Math.max(0, _indexAtOffset(scrollTop) - overscan);
                const endIdx = _indexAtOffset(scrollTop + viewportH);
                const end   = Math.min(total - 1, endIdx + overscan);
                return { start, end };
            }

            function _renderItem(idx) {
                const result = renderItem(idx);
                if (result instanceof Element) {
                    return result;
                }
                // elm-array: use dom.create when available, otherwise minimal fallback
                if (Array.isArray(result)) {
                    if (dom && typeof dom.create === 'function') {
                        return dom.create(result);
                    }
                    // Fallback : first array element if it is already an Element.
                    if (result.length > 0 && result[0] instanceof Element) {
                        return result[0];
                    }
                }
                // Generic fallback.
                const span = document.createElement('span');
                span.textContent = String(idx);
                return span;
            }

            // ── Render ──────────────────────────────────────────────────────

            let _lastStart = -1;
            let _lastEnd   = -1;

            function _doRender() {
                const { start, end } = _computeRange();
                if (start === _lastStart && end === _lastEnd) return;
                _lastStart = start;
                _lastEnd   = end;

                // Update the spacer height
                spacer.style.height = _totalHeight() + 'px';

                // Position the layer at the offset of the first visible item
                const layerTop = _offsetForIndex(start);
                layer.style.top = layerTop + 'px';

                // Clear + re-render
                layer.textContent = '';
                for (let i = start; i <= end; i++) {
                    const el = _renderItem(i);
                    layer.appendChild(el);
                    // Variable mode : only measure when the height is not
                    // already cached. Re-measurement on every render is the
                    // primary perf cost of variable mode ; caching by index
                    // keeps the steady-state scroll free of reflows.
                    if (mode === 'variable' && !heightCache.has(i)) {
                        const measured = el.getBoundingClientRect().height;
                        if (measured > 0) heightCache.set(i, measured);
                    }
                }
            }

            // ── Scroll listener (passive) ─────────────────────────────────
            // Self-contained widget - direct addEventListener is sufficient ;
            // the matching removal happens in `dispose()`. No `events`
            // registry involvement.

            function _onScroll() {
                _doRender();
            }

            container.addEventListener('scroll', _onScroll, { passive: true });

            // Initial render
            _doRender();

            // ── Public API ───────────────────────────────────────────────────

            /**
             * Re-render the visible range (after a change in `total` or data).
             */
            function refresh() {
                _lastStart = -1;
                _lastEnd   = -1;
                _doRender();
            }

            /**
             * Update the total item count and refresh.
             * @param {number} n - New total.
             */
            function setTotal(n) {
                total = n;
                // Variable mode : invalidate cache entries beyond the new total.
                if (mode === 'variable') {
                    for (const k of heightCache.keys()) {
                        if (k >= n) heightCache.delete(k);
                    }
                }
                refresh();
            }

            /**
             * Programmatic scroll to an index.
             * @param {number} idx
             * @param {{ align?: 'start'|'center'|'end'|'auto' }} [scrollOpts]
             */
            function scrollTo(idx, scrollOpts) {
                const align = (scrollOpts && scrollOpts.align) || 'start';
                const offset = _offsetForIndex(idx);
                const viewportH = _containerHeight();
                let targetScroll;

                if (align === 'start' || align === 'auto') {
                    targetScroll = offset;
                } else if (align === 'end') {
                    const ih = mode === 'fixed' ? itemHeight
                        : (heightCache.get(idx) || DEFAULT_VARIABLE_HEIGHT);
                    targetScroll = offset + ih - viewportH;
                } else if (align === 'center') {
                    const ih = mode === 'fixed' ? itemHeight
                        : (heightCache.get(idx) || DEFAULT_VARIABLE_HEIGHT);
                    targetScroll = offset - (viewportH / 2) + (ih / 2);
                } else {
                    targetScroll = offset;
                }

                container.scrollTop = Math.max(0, targetScroll);
                _doRender();
            }

            /**
             * Return the currently visible index range.
             * @returns {{ start: number, end: number }}
             */
            function visibleRange() {
                return _computeRange();
            }

            /**
             * Return the measured height of an item (variable mode).
             * In fixed mode returns `itemHeight`. In variable mode returns
             * the cached measurement when present, otherwise the default
             * estimate (caller cannot tell the two apart - wrap with `has`
             * when needed).
             * @param {number} idx
             * @returns {number}
             */
            function measure(idx) {
                if (mode === 'fixed') return itemHeight;
                return heightCache.has(idx) ? heightCache.get(idx) : DEFAULT_VARIABLE_HEIGHT;
            }

            /**
             * Detach listeners and clear the layer.
             */
            function dispose() {
                // @ts-ignore - passive option is standard; TS keyof ElementEventMap too narrow
                container.removeEventListener('scroll', _onScroll, { passive: true });
                layer.textContent = '';
                if (spacer.parentNode === container) container.removeChild(spacer);
                if (layer.parentNode === container) container.removeChild(layer);
                heightCache.clear();
            }

            return { refresh, setTotal, scrollTo, visibleRange, measure, dispose };
        }

        return { create };
    }
};
