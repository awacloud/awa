// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Focus manager for complex interfaces: focus trap within a container
 * (modal, dialog), tab order computation (visible + non-disabled + non-inert
 * + tabindex >= 0), next/previous navigation through the tab order,
 * focus stash/restore, and focus change notifications.
 *
 * Out of scope: visual CSS focus ring (handled by native :focus-visible).
 * Worker-safe: no - requires document.activeElement and addEventListener.
 *
 * @example
 * const focus = runtime.resolve('focus');
 * const trapCtrl = focus.trap(modalEl, { escapeDeactivates: true });
 * trapCtrl.activate();
 * // … the user navigates within the modal …
 * trapCtrl.deactivate();
 */
import { dom } from '../query/dom.js';
import { events } from '../query/events.js';

/**
 * Controller returned by `trap()`.
 * @typedef {object} FocusTrap
 * @property {boolean} paused - Whether the trap is currently paused (getter).
 * @property {() => void} activate - Activate the trap and move focus inside.
 * @property {() => void} deactivate - Deactivate the trap and optionally restore prior focus.
 * @property {() => void} pause - Temporarily stop enforcing the trap.
 * @property {() => void} resume - Resume enforcing the trap.
 */

/**
 * Handle returned by `stash()`.
 * @typedef {object} FocusStash
 * @property {() => void} restore - Restore the previously focused element.
 */

/**
 * Focus management API returned by `factory()`.
 * @typedef {object} FocusAPI
 * @property {(el: HTMLElement, opts?: Object) => FocusTrap} trap - Create a focus trap within a container.
 * @property {(container: HTMLElement) => HTMLElement[]} tabOrder - Compute focusable elements in logical tab order.
 * @property {(container?: HTMLElement) => void} next - Move focus to the next focusable element.
 * @property {(container?: HTMLElement) => void} previous - Move focus to the previous focusable element.
 * @property {() => FocusStash} stash - Capture current focus for later restoration.
 * @property {() => Element} current - Return the currently focused element.
 * @property {(fn: (current: Element, previous: Element) => void) => (() => void)} onChange - Subscribe to focus changes; returns an unsubscribe function.
 * @property {(target?: Element|string) => number} pushFocus - Push current focus onto the stack and optionally focus a target; returns new depth.
 * @property {() => (Element|null)} popFocus - Pop and restore the last pushed focus; returns the restored element or null.
 * @property {() => number} focusStackDepth - Current focus-stack depth.
 * @property {() => void} clearFocusStack - Empty the focus stack without restoring.
 * @property {(cb: () => any, target?: Element|string) => any} restoreFocus - Capture focus, run callback, restore (awaits a returned Promise).
 */

export const focus = {
    name: 'focus',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: ['dom', 'events'],
    deps: [dom, events],

    /**
     * @param {Object} dom    - dom module (fw)
     * @param {Object} events - events module (fw)
     * @returns {FocusAPI} focus API
     */
    factory(dom, events) {

        // ── Focusable element selectors ─────────────────────────────────────

        /** Natively focusable elements (without explicit tabindex) */
        const FOCUSABLE_SELECTORS = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[contenteditable]:not([contenteditable="false"])',
            '[tabindex]'
        ].join(',');

        /**
         * Tests whether an element has an `inert` ancestor (boolean attribute).
         *
         * @param {Element} el
         * @returns {boolean}
         */
        function _hasInertAncestor(el) {
            let node = el;
            while (node && node !== document.body) {
                if (node.hasAttribute && node.hasAttribute('inert')) return true;
                node = node.parentElement;
            }
            return false;
        }

        /**
         * Tests whether an element is visible (offsetParent !== null or dimensions > 0).
         *
         * @param {HTMLElement} el
         * @returns {boolean}
         */
        function _isVisible(el) {
            if (el.offsetParent !== null) return true;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
        }

        /**
         * Returns the tabindex value of an element (-1 if not defined).
         *
         * @param {Element} el
         * @returns {number}
         */
        function _tabIndex(el) {
            const attr = el.getAttribute('tabindex');
            if (attr === null) return 0; // naturally focusable without explicit tabindex
            return parseInt(attr, 10);
        }

        // ── Public API ──────────────────────────────────────────────────────

        /**
         * Returns the container's focusable elements in logical order.
         * Order: positive tabindex values sorted ascending, then tabindex 0 /
         * natural elements in DOM order.
         *
         * @param {HTMLElement} container
         * @returns {HTMLElement[]}
         */
        function tabOrder(container) {
            if (!container) return [];
            /** @type {HTMLElement[]} */
            const candidates = /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)));
            const eligible = candidates.filter(el => {
                const ti = _tabIndex(el);
                if (ti < 0) return false;              // tabindex=-1 excluded
                // @ts-ignore - 'disabled' is valid on form elements; HTMLElement doesn't declare it
                if (el.disabled) return false;         // disabled (input/button/select/textarea)
                if (_hasInertAncestor(el)) return false;
                if (!_isVisible(el)) return false;
                return true;
            });

            const positives = eligible.filter(el => {
                const attr = el.getAttribute('tabindex');
                return attr !== null && parseInt(attr, 10) > 0;
            }).sort((a, b) => parseInt(a.getAttribute('tabindex'), 10) - parseInt(b.getAttribute('tabindex'), 10));

            const zeros = eligible.filter(el => {
                const attr = el.getAttribute('tabindex');
                return attr === null || parseInt(attr, 10) === 0;
            });

            return [...positives, ...zeros];
        }

        /**
         * Advances focus to the next focusable element in the container.
         *
         * @param {HTMLElement} [container]
         */
        function next(container) {
            const cnt = container || document.body;
            const order = tabOrder(cnt);
            if (!order.length) return;
            const idx = order.indexOf(/** @type {HTMLElement} */ (document.activeElement));
            const nextEl = order[(idx + 1) % order.length];
            nextEl.focus();
        }

        /**
         * Moves focus back to the previous focusable element in the container.
         *
         * @param {HTMLElement} [container]
         */
        function previous(container) {
            const cnt = container || document.body;
            const order = tabOrder(cnt);
            if (!order.length) return;
            const idx = order.indexOf(/** @type {HTMLElement} */ (document.activeElement));
            const prevEl = order[(idx - 1 + order.length) % order.length];
            prevEl.focus();
        }

        /**
         * Captures the current focus and returns an object allowing restoration.
         *
         * @returns {{ restore: function(): void }}
         */
        function stash() {
            const saved = /** @type {HTMLElement|null} */ (document.activeElement);
            return {
                restore() {
                    if (saved && typeof saved.focus === 'function') {
                        saved.focus();
                    }
                }
            };
        }

        // ── Global focus stack for nested modals/dialogs ────────────────────
        // Each entry is the element focused at the time of `pushFocus()`.
        // `popFocus()` restores and pops. LIFO semantics - suited to stacked
        // modals: open A → open B → close B (restore A) → close A (restore
        // origin).
        const _focusStack = [];

        /**
         * Pushes the currently focused element onto the stack and optionally
         * focuses a new target.
         *
         * @param {Element|string} [target] - Element or CSS selector to focus
         * @returns {number} Stack depth after push
         */
        function pushFocus(target) {
            _focusStack.push(document.activeElement);
            if (target) {
                const el = typeof target === 'string'
                    ? document.querySelector(target)
                    : target;
                // @ts-ignore - element is HTMLElement at runtime; Element type lacks focus()
                if (el && typeof el.focus === 'function') el.focus();
            }
            return _focusStack.length;
        }

        /**
         * Pops and restores the last focus captured via `pushFocus()`.
         * No-op if the stack is empty.
         *
         * @returns {Element|null} The restored element, or null
         */
        function popFocus() {
            if (!_focusStack.length) return null;
            const saved = _focusStack.pop();
            if (saved && typeof saved.focus === 'function') {
                saved.focus();
            }
            return saved || null;
        }

        /**
         * Current depth of the focus stack.
         *
         * @returns {number}
         */
        function focusStackDepth() {
            return _focusStack.length;
        }

        /**
         * Empties the focus stack without restoring (useful for global teardown).
         */
        function clearFocusStack() {
            _focusStack.length = 0;
        }

        /**
         * Declarative form: captures focus, runs the callback, restores.
         * If `cb` returns a Promise, restoration waits for its resolution.
         *
         * @param {function(): any} cb
         * @param {Element|string}  [target]
         * @returns {any}
         */
        function restoreFocus(cb, target) {
            pushFocus(target);
            try {
                const r = cb();
                if (r && typeof r.then === 'function') {
                    return r.finally(() => popFocus());
                }
                popFocus();
                return r;
            } catch (e) {
                popFocus();
                throw e;
            }
        }

        /**
         * Returns the currently focused element.
         *
         * @returns {Element}
         */
        function current() {
            return document.activeElement;
        }

        /**
         * Subscribes to focus changes (global focusin).
         *
         * @param {function(Element, Element): void} fn
         * @returns {function(): void} unsubscribe
         */
        function onChange(fn) {
            let prev = document.activeElement;
            const handler = () => {
                const curr = document.activeElement;
                if (curr !== prev) {
                    fn(curr, prev);
                    prev = curr;
                }
            };
            document.addEventListener('focusin', handler);
            return function unsubscribe() {
                document.removeEventListener('focusin', handler);
            };
        }

        /**
         * Creates a focus trap within `el`.
         *
         * @param {HTMLElement} el - Trap container
         * @param {Object}  [opts={}]
         * @param {Element|string} [opts.initialFocus]     - Initial target or CSS selector
         * @param {boolean}        [opts.returnFocus=true] - Restore pre-activation focus
         * @param {boolean}        [opts.escapeDeactivates=false] - Esc deactivates
         * @param {boolean}        [opts.allowOutsideClick=false] - Allow clicks outside the trap
         * @returns {{ activate: function, deactivate: function, pause: function, resume: function, paused: boolean }}
         */
        function trap(el, opts = {}) {
            const {
                initialFocus        = null,
                returnFocus         = true,
                escapeDeactivates   = false,
                allowOutsideClick   = false  // eslint-disable-line no-unused-vars
            } = opts;

            let active  = false;
            let _paused = false;
            let stashed = null;

            function _getInitialFocus() {
                if (!initialFocus) {
                    const order = tabOrder(el);
                    return order[0] || null;
                }
                if (typeof initialFocus === 'string') {
                    return el.querySelector(initialFocus);
                }
                return initialFocus;
            }

            function _onKeyDown(e) {
                if (!active || _paused) return;
                const order = tabOrder(el);
                if (!order.length) { e.preventDefault(); return; }

                if (e.key === 'Tab') {
                    e.preventDefault();
                    const idx = order.indexOf(/** @type {HTMLElement} */ (document.activeElement));
                    if (e.shiftKey) {
                        // Shift+Tab → previous; from the first → last
                        const prev = order[(idx - 1 + order.length) % order.length];
                        prev.focus();
                    } else {
                        // Tab → next; from the last → first
                        const nxt = order[(idx + 1) % order.length];
                        nxt.focus();
                    }
                } else if (e.key === 'Escape' && escapeDeactivates) {
                    ctrl.deactivate();
                }
            }

            function _onFocusin(e) {
                if (!active || _paused) return;
                // If focus leaves the container, bring it back to the first focusable
                if (!el.contains(e.target)) {
                    const order = tabOrder(el);
                    if (order.length) order[0].focus();
                }
            }

            const ctrl = {
                get paused() { return _paused; },

                activate() {
                    if (active) return;
                    active = true;
                    if (returnFocus) stashed = stash();
                    el.addEventListener('keydown', _onKeyDown);
                    document.addEventListener('focusin', _onFocusin);
                    const target = /** @type {HTMLElement|null} */ (_getInitialFocus());
                    if (target) target.focus();
                },

                deactivate() {
                    if (!active) return;
                    active = false;
                    el.removeEventListener('keydown', _onKeyDown);
                    document.removeEventListener('focusin', _onFocusin);
                    if (returnFocus && stashed) {
                        stashed.restore();
                        stashed = null;
                    }
                },

                pause() {
                    _paused = true;
                },

                resume() {
                    _paused = false;
                }
            };

            return ctrl;
        }

        return /** @type {FocusAPI} */ (/** @type {any} */ ({
            trap, tabOrder, next, previous, stash, current, onChange,
            pushFocus, popFocus, focusStackDepth, clearFocusStack, restoreFocus
        }));
    }
};
