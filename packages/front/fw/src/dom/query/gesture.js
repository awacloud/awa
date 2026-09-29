// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Unified touch/pointer gesture detection based on Pointer Events (W3C).
 * Covers tap, doubletap, longpress, swipe (4 directions), pan (continuous drag)
 * and pinch (two fingers: scale + center). Works with mouse, touch and stylus.
 *
 * Out of scope: 3+ finger gestures, standalone rotation (available via pinch.rotation).
 *
 * @example
 * const gesture = runtime.resolve('gesture');
 * const g = gesture.attach(el, { longpressMs: 600 });
 * const off = g.on('swipe', ({ direction }) => console.log(direction));
 * // Later:
 * g.detach();
 */
import { events } from './events.js';

/**
 * A gesture controller returned by `attach()`.
 * @typedef {object} GestureController
 * @property {(name: string, fn: Function) => Function} on - Subscribe to a gesture event; returns an unsubscribe function.
 * @property {(name: string, fn: Function) => void} off - Unsubscribe a function from a gesture event.
 * @property {() => void} detach - Detach all DOM listeners and clear subscriptions.
 * @property {() => void} dispose - Alias of `detach` (recognised by `ui.adopt`).
 */

/**
 * Gesture-detection surface returned by `factory()`.
 * @typedef {object} GestureAPI
 * @property {(el: Element, opts?: {tapMaxMs?: number, doubletapMaxMs?: number, longpressMs?: number, swipeMinPx?: number, swipeMaxMs?: number}) => GestureController} attach - Attach a gesture detector to a DOM element.
 */

export const gesture = {
    name: 'gesture',
    version: '1.0.0',
    type: 'fw.dom.query',
    dependencies: ['events'],
    deps: [events],

    /**
     * @param {Object} events - Resolved events module instance (fw/dom/query/events).
     * @returns {GestureAPI}
     */
    factory(events) {

        // Counter for events.scope names - gives each `attach()` call a
        // unique namespace so multiple gesture controllers can coexist.
        let _gestureSeq = 0;

        /**
         * Attach a gesture detector to a DOM element.
         *
         * Design note - tap vs doubletap:
         *   A `tap` is emitted immediately on each rapid pointer-up.
         *   When a second tap occurs within `doubletapMaxMs`, an additional
         *   `doubletap` is also emitted (both `tap` events plus the `doubletap`
         *   are all emitted). This behaviour is intentional: consumers that want
         *   to suppress the first tap on a doubletap must handle it themselves
         *   (e.g. cancel the first tap's action).
         *
         * @param {Element} el - The target element.
         * @param {Object}  [opts]
         * @param {number}  [opts.tapMaxMs=250]        - Max pointer-down duration for a tap.
         * @param {number}  [opts.doubletapMaxMs=300]  - Max interval between 2 taps for doubletap.
         * @param {number}  [opts.longpressMs=500]     - Min duration to trigger longpress.
         * @param {number}  [opts.swipeMinPx=10]       - Min distance (px) for a swipe.
         * @param {number}  [opts.swipeMaxMs=300]      - Max duration for a movement to count as a swipe.
         * @returns {GestureController}
         */
        function attach(el, opts = {}) {
            const tapMaxMs       = opts.tapMaxMs       ?? 250;
            const doubletapMaxMs = opts.doubletapMaxMs ?? 300;
            const longpressMs    = opts.longpressMs    ?? 500;
            const swipeMinPx     = opts.swipeMinPx     ?? 10;
            const swipeMaxMs     = opts.swipeMaxMs     ?? 300;

            // Application listeners: name → Set<fn>
            const handlers = Object.create(null);

            function emit(name, payload) {
                const set = handlers[name];
                if (!set) return;
                for (const fn of set) fn(payload);
            }

            // ── Internal pointer state ─────────────────────────────────────────────

            // Map pointerId → { x, y, t }  (active pointers)
            const pointers = new Map();

            // Tap / doubletap
            let lastTapTime = 0;
            let lastTapX    = 0;
            let lastTapY    = 0;

            // Longpress timer
            let longpressTimer = null;

            // Pan state (premier pointer uniquement)
            let panActive  = false;
            let panStartX  = 0;
            let panStartY  = 0;
            let panLastX   = 0;
            let panLastY   = 0;
            let panTotalDx = 0;
            let panTotalDy = 0;

            // Pinch state
            let pinchInitialDist = 0;
            let pinchInitialAngle = 0;
            let pinchActive = false;

            // ── Helpers ──────────────────────────────────────────────────────────

            function distance(ax, ay, bx, by) {
                const dx = bx - ax;
                const dy = by - ay;
                return Math.sqrt(dx * dx + dy * dy);
            }

            function angle(ax, ay, bx, by) {
                return Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
            }

            function cancelLongpress() {
                if (longpressTimer !== null) {
                    clearTimeout(longpressTimer);
                    longpressTimer = null;
                }
            }

            // ── Handlers Pointer Events ──────────────────────────────────────────

            function onPointerDown(e) {
                // startX/startY = initial position (immutable); x/y = current position
                pointers.set(e.pointerId, { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, t: Date.now() });

                // Capture the pointer to track movement outside the element
                try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

                const count = pointers.size;

                if (count === 1) {
                    // Pan start
                    panStartX  = e.clientX;
                    panStartY  = e.clientY;
                    panLastX   = e.clientX;
                    panLastY   = e.clientY;
                    panTotalDx = 0;
                    panTotalDy = 0;
                    panActive  = true;

                    emit('pan', {
                        phase: 'start',
                        dx: 0, dy: 0,
                        totalDx: 0, totalDy: 0,
                        target: e.target
                    });

                    // Longpress timer
                    cancelLongpress();
                    const capturedX = e.clientX;
                    const capturedY = e.clientY;
                    const capturedTarget = e.target;
                    const capturedT = Date.now();
                    longpressTimer = setTimeout(() => {
                        longpressTimer = null;
                        const durationMs = Date.now() - capturedT;
                        emit('longpress', { x: capturedX, y: capturedY, target: capturedTarget, durationMs });
                    }, longpressMs);
                }

                if (count === 2) {
                    // Start of pinch
                    cancelLongpress();
                    panActive = false;

                    const pts = [...pointers.values()];
                    pinchInitialDist  = distance(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
                    pinchInitialAngle = angle(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
                    pinchActive = true;

                    const cx = (pts[0].x + pts[1].x) / 2;
                    const cy = (pts[0].y + pts[1].y) / 2;
                    emit('pinch', { phase: 'start', scale: 1, center: { x: cx, y: cy }, rotation: 0 });
                }
            }

            function onPointerMove(e) {
                if (!pointers.has(e.pointerId)) return;

                // Update the current position (startX/startY remain unchanged)
                const prev = pointers.get(e.pointerId);
                pointers.set(e.pointerId, { startX: prev.startX, startY: prev.startY, x: e.clientX, y: e.clientY, t: prev.t });

                const count = pointers.size;

                if (count === 1 && panActive) {
                    const dx = e.clientX - panLastX;
                    const dy = e.clientY - panLastY;
                    panTotalDx += dx;
                    panTotalDy += dy;
                    panLastX = e.clientX;
                    panLastY = e.clientY;

                    // Cancel longpress if significant movement detected
                    const moved = distance(panStartX, panStartY, e.clientX, e.clientY);
                    if (moved > swipeMinPx) {
                        cancelLongpress();
                    }

                    emit('pan', {
                        phase: 'move',
                        dx, dy,
                        totalDx: panTotalDx, totalDy: panTotalDy,
                        target: e.target
                    });
                }

                if (count === 2 && pinchActive) {
                    const pts = [...pointers.values()];
                    const currentDist  = distance(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
                    const currentAngle = angle(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
                    const scale    = pinchInitialDist > 0 ? currentDist / pinchInitialDist : 1;
                    const rotation = currentAngle - pinchInitialAngle;
                    const cx = (pts[0].x + pts[1].x) / 2;
                    const cy = (pts[0].y + pts[1].y) / 2;

                    emit('pinch', { phase: 'move', scale, center: { x: cx, y: cy }, rotation });
                }
            }

            function onPointerUp(e) {
                const start = pointers.get(e.pointerId);
                if (!start) return;

                const now      = Date.now();
                const duration = now - start.t;
                const dx       = e.clientX - start.startX;
                const dy       = e.clientY - start.startY;
                const dist     = distance(start.startX, start.startY, e.clientX, e.clientY);

                const count = pointers.size; // still active before deletion

                if (count === 2 && pinchActive) {
                    // End of pinch
                    pinchActive = false;
                    // Final computation with both pointers (one has just been released)
                    const all = [...pointers.values()];
                    const cx = all.length >= 2 ? (all[0].x + all[1].x) / 2 : e.clientX;
                    const cy = all.length >= 2 ? (all[0].y + all[1].y) / 2 : e.clientY;
                    const currentDist = all.length >= 2
                        ? distance(all[0].x, all[0].y, all[1].x, all[1].y)
                        : 0;
                    const scale = pinchInitialDist > 0 ? currentDist / pinchInitialDist : 1;

                    emit('pinch', { phase: 'end', scale, center: { x: cx, y: cy }, rotation: 0 });

                    pointers.delete(e.pointerId);
                    return;
                }

                pointers.delete(e.pointerId);
                cancelLongpress();

                if (count === 1) {
                    // Pan end
                    if (panActive) {
                        emit('pan', {
                            phase: 'end',
                            dx: 0, dy: 0,
                            totalDx: panTotalDx, totalDy: panTotalDy,
                            target: e.target
                        });
                        panActive = false;
                    }

                    // Swipe ou tap
                    if (dist >= swipeMinPx && duration <= swipeMaxMs) {
                        // Swipe
                        const absDx = Math.abs(dx);
                        const absDy = Math.abs(dy);
                        let direction;
                        if (absDx >= absDy) {
                            direction = dx > 0 ? 'right' : 'left';
                        } else {
                            direction = dy > 0 ? 'down' : 'up';
                        }
                        const velocityPxPerMs = duration > 0 ? dist / duration : 0;
                        emit('swipe', {
                            direction,
                            distance: dist,
                            velocityPxPerMs,
                            startX: start.startX, startY: start.startY,
                            endX: e.clientX,  endY: e.clientY
                        });
                    } else if (dist < swipeMinPx && duration <= tapMaxMs) {
                        // Tap
                        emit('tap', { x: e.clientX, y: e.clientY, target: e.target });

                        // Doubletap ?
                        const timeSinceLastTap = now - lastTapTime;
                        const tapDist = distance(lastTapX, lastTapY, e.clientX, e.clientY);
                        if (timeSinceLastTap <= doubletapMaxMs && tapDist < swipeMinPx * 3) {
                            emit('doubletap', { x: e.clientX, y: e.clientY, target: e.target });
                            lastTapTime = 0; // reset to avoid triple-tap
                        } else {
                            lastTapTime = now;
                            lastTapX    = e.clientX;
                            lastTapY    = e.clientY;
                        }
                    }
                }
            }

            function onPointerCancel(e) {
                cancelLongpress();
                if (panActive && pointers.size === 1) {
                    panActive = false;
                    emit('pan', {
                        phase: 'end',
                        dx: 0, dy: 0,
                        totalDx: panTotalDx, totalDy: panTotalDy,
                        target: e.target
                    });
                }
                if (pinchActive) {
                    pinchActive = false;
                }
                pointers.delete(e.pointerId);
            }

            // ── DOM listener registration ────────────────────────────────────────
            // Each `attach()` gets its own events.scope so cleanup is
            // **atomic and per-instance** - multiple gesture controllers on
            // distinct elements can coexist without name collisions, and
            // `detach()` (or `dispose()`) removes only this instance's
            // listeners.
            const _scopeName = `gesture:${++_gestureSeq}`;
            const _scope = events.scope(_scopeName);
            _scope.on('pointerdown',   el, 'pointerdown',   onPointerDown);
            _scope.on('pointermove',   el, 'pointermove',   onPointerMove);
            _scope.on('pointerup',     el, 'pointerup',     onPointerUp);
            _scope.on('pointercancel', el, 'pointercancel', onPointerCancel);

            // ── Public API ───────────────────────────────────────────────────────

            /**
             * Subscribe a function to a gesture event.
             * @param {string}   name - 'tap'|'doubletap'|'longpress'|'swipe'|'pan'|'pinch'
             * @param {Function} fn
             * @returns {Function} Unsubscribe function (off).
             */
            function on(name, fn) {
                if (!handlers[name]) handlers[name] = new Set();
                handlers[name].add(fn);
                return () => off(name, fn);
            }

            /**
             * Unsubscribe a function from a gesture event.
             * @param {string}   name
             * @param {Function} fn
             */
            function off(name, fn) {
                if (handlers[name]) {
                    handlers[name].delete(fn);
                }
            }

            /**
             * Detach all DOM listeners and clear subscriptions.
             * Compatible with `ui.mount(blockId, null, () => gesture.attach(el))`
             * via the `dispose` alias (recognised by `ui.adopt`).
             */
            function detach() {
                cancelLongpress();
                _scope.clear();
                for (const key of Object.keys(handlers)) {
                    delete handlers[key];
                }
                pointers.clear();
                panActive = false;
                pinchActive = false;
            }

            return { on, off, detach, dispose: detach };
        }

        return { attach };
    }
};
