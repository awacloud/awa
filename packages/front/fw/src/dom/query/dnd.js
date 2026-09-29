// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Internal SDE drag-and-drop built on top of Pointer Events (no native
 * HTML5 DnD API). Covers cross-window drag, list items, and workspace tabs.
 * Custom preview (clone or app-supplied element), threshold handling,
 * hoverClass.
 *
 * Out of scope : OS-level file drag (use `fsAccess` + `pickFile`).
 *
 * Lifecycle robustness :
 * - `pointercancel` is treated as a graceful cancel (no `onDrop`, `onEnd`
 *   fires with `cancelled: true`). Required for touch gesture loss,
 *   navigation, OS pointer-lock loss.
 * - `dispose()` mid-drag fully resets state and fires `onEnd({cancelled:true})`.
 * - `opts.data()` is wrapped in try/catch ; on throw the drag is silently
 *   cancelled and `onError` (if provided) is invoked.
 *
 * @example
 * const dnd = runtime.resolve('dnd');
 * const { dispose } = dnd.draggable(el, { data: () => ({ id: 1 }) });
 * dnd.dropTarget(zone, {
 *     accept: (d) => d.id !== undefined,
 *     onDrop: (data, { x, y }) => console.log('dropped', data, x, y),
 * });
 */

/**
 * Drag-and-drop surface returned by `factory()`.
 * @typedef {object} DndAPI
 * @property {(el: Element, opts?: {data?: () => any, preview?: (data: any) => HTMLElement, handle?: string|Element, axis?: 'x'|'y'|'both', threshold?: number, cancelMs?: number, onStart?: (ctx: {data: any, x: number, y: number}) => void, onMove?: (ctx: {data: any, x: number, y: number}) => void, onEnd?: (ctx: {data: any, x: number, y: number, cancelled?: boolean}) => void, onError?: (err: any) => void}) => {disable: () => void, enable: () => void, dispose: () => void}} draggable - Make an element draggable via Pointer Events.
 * @property {(el: Element, opts?: {accept: (data: any) => boolean, onDrop: (data: any, ctx: {x: number, y: number, target: Element}) => void, hoverClass?: string, onEnter?: (data: any) => void, onOver?: (data: any, ctx: {x: number, y: number}) => void, onLeave?: (data: any) => void}) => {dispose: () => void}} dropTarget - Register an element as a drop zone.
 * @property {() => (null | {data: any, preview: HTMLElement, source: Element, x: number, y: number})} active - Return the current drag context, or null.
 */

export const dnd = {
    name: 'dnd',
    version: '1.1.0',
    type: 'fw.dom.query',
    dependencies: [],

    /**
     * No declared dependencies - DOM-level pointer listeners are owned by
     * each `draggable()` instance and torn down by its `dispose()` method.
     *
     * @returns {DndAPI}
     */
    factory() {

        // ── Global state : a single active drag at a time. ───────────────────
        let _current = null; // { data, preview, source, x, y, _cleanup }

        // ── Registered drop-target set. ──────────────────────────────────────
        const _targets = new Set();

        // ── Helpers ──────────────────────────────────────────────────────────

        function _positionPreview(preview, x, y) {
            preview.style.left = x + 'px';
            preview.style.top  = y + 'px';
        }

        function _attachPreview(preview, x, y) {
            preview.style.position      = 'fixed';
            preview.style.pointerEvents = 'none';
            preview.style.zIndex        = '2147483647';
            preview.style.margin        = '0';
            _positionPreview(preview, x, y);
            document.body.appendChild(preview);
        }

        function _detachPreview(preview, cancelMs) {
            if (!preview || !preview.parentNode) return;
            if (cancelMs > 0) {
                preview.style.transition = `opacity ${cancelMs}ms`;
                preview.style.opacity    = '0';
                setTimeout(() => {
                    if (preview.parentNode) preview.parentNode.removeChild(preview);
                }, cancelMs);
            } else {
                preview.parentNode.removeChild(preview);
            }
        }

        function _hitTest(x, y) {
            // Find drop targets under the pointer (insertion order - not z-index).
            const els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
            for (const t of _targets) {
                if (els.includes(t._el)) return t;
            }
            return null;
        }

        function _emitDocEvent(name, detail) {
            document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
        }

        // ── API publique ──────────────────────────────────────────────────────

        /**
         * Make an element draggable via Pointer Events.
         *
         * @param {Element} el
         * @param {Object}  opts
         * @param {() => any}  [opts.data]      - `() → any`, serialisable drag data.
         * @param {(data: any) => HTMLElement}  [opts.preview]    - `(data) → HTMLElement`, visual preview.
         * @param {string|Element} [opts.handle] - Handle selector or element.
         * @param {'x'|'y'|'both'}  [opts.axis]  - `'x'|'y'|'both'`, default `'both'`.
         * @param {number}  [opts.threshold]    - Recognition distance (px), default 5.
         * @param {number}  [opts.cancelMs]     - End-of-drag animation duration (ms), default 150.
         * @param {(ctx: {data: any, x: number, y: number}) => void} [opts.onStart]     - Start callback.
         * @param {(ctx: {data: any, x: number, y: number}) => void} [opts.onMove]      - Move callback.
         * @param {(ctx: {data: any, x: number, y: number, cancelled?: boolean}) => void} [opts.onEnd]       - End callback. Receives
         *   `{ data, x, y, cancelled? }`. `cancelled: true` is set on
         *   `pointercancel`, mid-drag `dispose()`, or `opts.data()` throwing.
         * @param {(err: any) => void} [opts.onError]     - Error callback ; invoked when
         *   `opts.data()` throws during a drag start. Receives the error.
         * @returns {{ disable: () => void, enable: () => void, dispose: () => void }}
         */
        // @ts-ignore - data is validated at runtime; TS requires upfront declaration
        function draggable(el, opts = {}) {
            if (!el) throw new Error('dnd.draggable: el is required');

            const axis      = opts.axis      ?? 'both';
            const threshold = opts.threshold ?? 5;
            const cancelMs  = opts.cancelMs  ?? 150;

            let _enabled  = true;
            let _startX   = 0;
            let _startY   = 0;
            let _dragging = false;
            let _preview  = null;
            let _hovered  = null; // dropTarget currently hovered
            // Track whether document-level listeners are bound for this
            // instance. Without this guard, repeated pointerdown events
            // (multi-pointer race or wrong-button-then-correct-button)
            // could bind twice. Bug fix per audit.
            let _docListenersBound = false;

            function _bindDocListeners() {
                if (_docListenersBound) return;
                _docListenersBound = true;
                document.addEventListener('pointermove',   _onPointerMove);
                document.addEventListener('pointerup',     _onPointerUp,     { once: true });
                document.addEventListener('pointercancel', _onPointerCancel, { once: true });
            }

            function _unbindDocListeners() {
                if (!_docListenersBound) return;
                _docListenersBound = false;
                document.removeEventListener('pointermove',   _onPointerMove);
                document.removeEventListener('pointerup',     _onPointerUp);
                document.removeEventListener('pointercancel', _onPointerCancel);
            }

            function _getHandle() {
                if (!opts.handle) return el;
                if (typeof opts.handle === 'string') return el.querySelector(opts.handle);
                return opts.handle;
            }

            function _onPointerDown(e) {
                if (!_enabled) return;
                if (e.button !== undefined && e.button !== 0) return; // mouse : left button only
                const handle = _getHandle();
                if (handle && !handle.contains(e.target) && handle !== e.target) return;
                // Race guard : if doc listeners are already bound from a prior
                // pointerdown (multi-pointer scenario), ignore this one.
                if (_docListenersBound) return;

                _startX   = e.clientX;
                _startY   = e.clientY;
                _dragging = false;
                // Hover state must start clean each gesture - without this
                // reset, a click-without-drag below threshold leaves a stale
                // _hovered reference for the next gesture. Bug fix per audit.
                _hovered  = null;

                el.setPointerCapture(e.pointerId);
                _bindDocListeners();
            }

            function _onPointerMove(e) {
                const dx = e.clientX - _startX;
                const dy = e.clientY - _startY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (!_dragging) {
                    if (dist < threshold) return;

                    // Drag start.
                    if (_current) return; // another drag already active
                    _dragging = true;

                    // Wrap opts.data() in try/catch so a throw cleanly aborts
                    // the drag rather than leaving state inconsistent.
                    // Bug fix per audit.
                    let data = null;
                    if (opts.data) {
                        try {
                            data = opts.data();
                        } catch (err) {
                            _dragging = false;
                            _unbindDocListeners();
                            if (opts.onError) {
                                try { opts.onError(err); } catch { /* ignore */ }
                            }
                            return;
                        }
                    }

                    // Build the preview.
                    if (opts.preview) {
                        _preview = opts.preview(data);
                    } else {
                        _preview = el.cloneNode(true);
                        // @ts-ignore - cloneNode returns Node; Element is correct at runtime
                        _preview.style.opacity = '0.6';
                    }
                    _attachPreview(_preview, e.clientX, e.clientY);

                    _current = { data, preview: _preview, source: el, x: e.clientX, y: e.clientY };

                    _emitDocEvent('dnd:start', { data, source: el });
                    if (opts.onStart) opts.onStart({ data, x: e.clientX, y: e.clientY });
                    // fall through to run hover detection on this same move event
                }

                // Mouvement
                let x = e.clientX;
                let y = e.clientY;
                if (axis === 'x') y = _startY;
                if (axis === 'y') x = _startX;

                _positionPreview(_preview, x, y);
                _current.x = x;
                _current.y = y;

                // Hover targets
                const t = _hitTest(x, y);
                if (t !== _hovered) {
                    if (_hovered && _hovered._accept(_current.data)) {
                        if (_hovered._opts.hoverClass) _hovered._el.classList.remove(_hovered._opts.hoverClass);
                        if (_hovered._opts.onLeave)    _hovered._opts.onLeave(_current.data);
                    }
                    _hovered = t;
                    if (_hovered && _hovered._accept(_current.data)) {
                        if (_hovered._opts.hoverClass) _hovered._el.classList.add(_hovered._opts.hoverClass);
                        if (_hovered._opts.onEnter)    _hovered._opts.onEnter(_current.data);
                    }
                } else if (_hovered && _hovered._accept(_current.data)) {
                    if (_hovered._opts.onOver) _hovered._opts.onOver(_current.data, { x, y });
                }

                if (opts.onMove) opts.onMove({ data: _current.data, x, y });
            }

            function _onPointerUp(e) {
                _unbindDocListeners();

                if (!_dragging) {
                    // Click-without-drag : nothing to do (no state to clean).
                    _hovered = null;
                    return;
                }

                const x = e.clientX;
                const y = e.clientY;

                // Drop on hovered target.
                if (_hovered && _hovered._accept(_current.data)) {
                    if (_hovered._opts.hoverClass) _hovered._el.classList.remove(_hovered._opts.hoverClass);
                    _hovered._opts.onDrop(_current.data, { x, y, target: _hovered._el });
                    if (_hovered._opts.onLeave) _hovered._opts.onLeave(_current.data);
                }
                _hovered = null;

                _detachPreview(_preview, cancelMs);
                _preview  = null;

                const finalData = _current ? _current.data : null;
                _current  = null;
                _dragging = false;

                _emitDocEvent('dnd:end', { data: finalData, source: el });
                if (opts.onEnd) opts.onEnd({ data: finalData, x, y });
            }

            /**
             * `pointercancel` mirror of `_onPointerUp` semantics - no drop,
             * fires `onEnd` with `cancelled: true`. Required for touch
             * gesture loss, browser navigation, OS pointer-lock loss.
             */
            function _onPointerCancel(e) {
                _unbindDocListeners();

                if (!_dragging) {
                    _hovered = null;
                    return;
                }

                const x = e?.clientX ?? (_current?.x ?? 0);
                const y = e?.clientY ?? (_current?.y ?? 0);

                if (_hovered) {
                    if (_hovered._opts.hoverClass) _hovered._el.classList.remove(_hovered._opts.hoverClass);
                    if (_hovered._opts.onLeave) {
                        try { _hovered._opts.onLeave(_current?.data); } catch { /* ignore */ }
                    }
                }
                _hovered = null;

                _detachPreview(_preview, cancelMs);
                _preview  = null;

                const finalData = _current ? _current.data : null;
                _current  = null;
                _dragging = false;

                _emitDocEvent('dnd:end', { data: finalData, source: el, cancelled: true });
                if (opts.onEnd) opts.onEnd({ data: finalData, x, y, cancelled: true });
            }

            el.addEventListener('pointerdown', _onPointerDown);

            function disable()  { _enabled = false; }
            function enable()   { _enabled = true;  }
            function dispose() {
                el.removeEventListener('pointerdown', _onPointerDown);
                _unbindDocListeners();
                // Full mid-drag cleanup : if a drag owned by THIS source is
                // currently active, fire onEnd({cancelled:true}) and detach
                // the preview. Bug fix per audit.
                if (_current && _current.source === el) {
                    const x = _current.x;
                    const y = _current.y;
                    const finalData = _current.data;
                    if (_hovered) {
                        if (_hovered._opts.hoverClass) _hovered._el.classList.remove(_hovered._opts.hoverClass);
                        if (_hovered._opts.onLeave) {
                            try { _hovered._opts.onLeave(finalData); } catch { /* ignore */ }
                        }
                    }
                    _hovered = null;
                    _detachPreview(_preview, 0);
                    _preview = null;
                    _current = null;
                    _dragging = false;
                    _emitDocEvent('dnd:end', { data: finalData, source: el, cancelled: true });
                    if (opts.onEnd) opts.onEnd({ data: finalData, x, y, cancelled: true });
                } else {
                    // No active drag for this source - still nullify any
                    // dangling preview reference.
                    if (_preview && _preview.parentNode) _preview.parentNode.removeChild(_preview);
                    _preview = null;
                }
            }

            return { disable, enable, dispose };
        }

        /**
         * Register an element as a drop zone.
         *
         * @param {Element} el
         * @param {Object}  opts
         * @param {(data: any) => boolean}  opts.accept           - `(data) → boolean`.
         * @param {(data: any, ctx: {x: number, y: number, target: Element}) => void}  opts.onDrop           - `(data, {x, y, target}) → void`.
         * @param {string}    [opts.hoverClass]      - CSS class added while hovered.
         * @param {(data: any) => void}  [opts.onEnter]         - Drag enters callback.
         * @param {(data: any, ctx: {x: number, y: number}) => void}  [opts.onOver]          - Drag move callback (while hovering).
         * @param {(data: any) => void}  [opts.onLeave]         - Drag leaves callback.
         * @returns {{ dispose: () => void }}
         */
        // @ts-ignore - accept/onDrop validated at runtime; TS requires upfront declaration
        function dropTarget(el, opts = {}) {
            if (!el)           throw new Error('dnd.dropTarget: el is required');
            if (!opts.accept)  throw new Error('dnd.dropTarget: accept is required');
            if (!opts.onDrop)  throw new Error('dnd.dropTarget: onDrop is required');

            const entry = {
                _el:      el,
                _opts:    opts,
                _accept:  opts.accept,
            };
            _targets.add(entry);

            function dispose() {
                _targets.delete(entry);
            }

            return { dispose };
        }

        /**
         * Return the current drag context, or null.
         *
         * @returns {null | { data: any, preview: HTMLElement, source: Element, x: number, y: number }}
         */
        function active() {
            return _current;
        }

        return { draggable, dropTarget, active };
    }
};
