// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Centralised event-management service for DOM listener tracking
 * and named custom-event presets.
 *
 * The module maintains two internal registries:
 *   - **listeners** - named, reference-tracked `addEventListener` bindings that
 *     can be removed by name without holding a function reference in user code.
 *   - **presets** - named `CustomEvent` configurations that can be fired on demand
 *     with optional per-dispatch detail overrides.
 *
 */

/**
 * An active listener entry stored in the internal registry.
 *
 * @typedef {Object} ListenerEntry
 * @property {EventTarget}        elm     - The target element the listener is bound to.
 * @property {string}             type    - DOM event type (e.g. `'click'`).
 * @property {EventListenerOrEventListenerObject} fn - The handler function or object.
 * @property {boolean | AddEventListenerOptions | false} options - Options passed to
 *   `addEventListener` (or `false` for the default).
 */

/**
 * A named custom-event preset stored in the internal registry.
 *
 * @typedef {Object} PresetEntry
 * @property {EventTarget} elm     - The target element that will dispatch the event.
 * @property {string}      type    - Custom event type name.
 * @property {*}           detail  - Default detail payload.
 * @property {Object}      options - Default event options (`bubbles`, `cancelable`,
 *   `composed`).
 */

/**
 * Namespaced sub-API returned by `EventsAPI.scope()`.
 *
 * @typedef {object} EventsScope
 * @property {(name: string, elm: EventTarget, type: string, fn: EventListenerOrEventListenerObject, options?: boolean|AddEventListenerOptions) => string} on Register a scoped named listener; returns the full prefixed name.
 * @property {(name: string, root: EventTarget, type: string, selector: string, fn: Function, options?: boolean|AddEventListenerOptions) => string} delegate Register a scoped delegated listener; returns the full prefixed name.
 * @property {(name: string) => void} off Remove a scoped listener by name.
 * @property {(name: string) => boolean} has Whether a scoped listener is registered.
 * @property {() => void} clear Remove every listener owned by this scope.
 */

/**
 * Public API returned by `events.factory()`.
 *
 * @typedef {object} EventsAPI
 * @property {(name: string, elm: EventTarget, type: string, fn: EventListenerOrEventListenerObject, options?: boolean|AddEventListenerOptions) => void} on Register a named DOM listener (replaces any existing one with the same name).
 * @property {(name: string) => void} off Remove a named listener.
 * @property {(name: string) => boolean} has Whether a named listener is registered.
 * @property {() => void} clear Remove every registered listener.
 * @property {(elm: EventTarget, type: string, detail?: *, options?: object) => void} emit Dispatch a `CustomEvent` immediately.
 * @property {(name: string, elm: EventTarget, type: string, detail?: *, options?: object) => void} preset Register a named custom-event preset.
 * @property {(name: string, detail?: *) => void} dispatch Fire a registered preset by name.
 * @property {(name: string) => void} unset Delete a named preset.
 * @property {(name: string, root: EventTarget, type: string, selector: string, fn: Function, options?: boolean|AddEventListenerOptions) => void} delegate Register a named delegated listener.
 * @property {(scopeName: string) => EventsScope} scope Create a namespaced sub-API for grouped cleanup.
 * @property {(root?: Element) => (() => void)} autoCleanup Install a MutationObserver that auto-detaches listeners; returns a disabler.
 * @property {(() => void)} [_disableAutoCleanup] Disabler installed by `autoCleanup`; absent until then.
 */

export const events = {
    name: 'events',
    type: 'fw.dom.query',
    dependencies: [],

    /** @returns {EventsAPI} */
    factory() {

        const listeners = {}; // name → { elm, type, fn, options }
        const presets   = {}; // name → { elm, type, detail, options }

        // --- Internal ---

        /**
         * Build a `CustomEvent` with merged default options.
         *
         * Defaults: `bubbles: true`, `cancelable: false`, `composed: false`.
         *
         * @param {string} type    - Custom event type name.
         * @param {*}      detail  - Payload accessible as `event.detail`.
         * @param {Object} options - Override options for `bubbles`, `cancelable`,
         *   and/or `composed`.
         * @returns {CustomEvent} A configured custom event ready to dispatch.
         */
        function buildCustomEvent(type, detail, options) {
            return new CustomEvent(type, {
                detail,
                bubbles:    options.bubbles    ?? true,
                cancelable: options.cancelable ?? false,
                composed:   options.composed   ?? false
            });
        }

        // --- Public API ---

        const cmd = {};

        // ── Named listener tracking

        /**
         * Register a named event listener on a DOM element.
         *
         * If a listener with the same `name` already exists it is removed first
         * (equivalent to calling {@link cmd.off} before re-binding), ensuring only
         * one binding exists per name at any time.
         *
         * @param {string}   name    - Unique identifier for this listener.
         * @param {EventTarget} elm  - Target element to bind the listener to.
         * @param {string}   type    - DOM event type (e.g. `'click'`, `'keydown'`).
         * @param {EventListenerOrEventListenerObject} fn - Handler function or object.
         * @param {boolean | AddEventListenerOptions} [options=false] - Options forwarded
         *   to `addEventListener`.
         */
        cmd.on = function (name, elm, type, fn, options = false) {
            if (listeners[name]) cmd.off(name);
            elm.addEventListener(type, fn, options);
            listeners[name] = { elm, type, fn, options };
        };

        /**
         * Remove a named event listener and delete its registry entry.
         * No-op when no listener with the given `name` exists.
         *
         * @param {string} name - Name of the listener to remove.
         */
        cmd.off = function (name) {
            const entry = listeners[name];
            if (entry) {
                entry.elm.removeEventListener(entry.type, entry.fn, entry.options);
                delete listeners[name];
            }
        };

        /**
         * Check whether a named listener is currently registered.
         *
         * @param {string} name - Listener name to look up.
         * @returns {boolean} `true` when the listener is registered.
         */
        cmd.has = function (name) {
            return Object.prototype.hasOwnProperty.call(listeners, name);
        };

        /**
         * Remove all registered listeners, equivalent to calling {@link cmd.off}
         * for every name in the registry.
         */
        cmd.clear = function () {
            for (const name of Object.keys(listeners)) {
                cmd.off(name);
            }
        };

        // ── Custom events - immediate

        /**
         * Dispatch a `CustomEvent` immediately on the given element.
         *
         * @param {EventTarget} elm            - Element to dispatch the event on.
         * @param {string}      type           - Custom event type name.
         * @param {*}           [detail=null]  - Payload for `event.detail`.
         * @param {Object}      [options={}]   - Override options (`bubbles`,
         *   `cancelable`, `composed`).
         */
        cmd.emit = function (elm, type, detail = null, options = {}) {
            elm.dispatchEvent(buildCustomEvent(type, detail, options));
        };

        // ── Custom events - named presets (defined once, fired on demand)

        /**
         * Register a named custom-event preset.
         *
         * Presets store the target element, event type, default detail, and default
         * options. They can be fired later by name with {@link cmd.dispatch},
         * optionally overriding the detail at dispatch time.
         *
         * @param {string}      name           - Unique name for the preset.
         * @param {EventTarget} elm            - Element that will dispatch the event.
         * @param {string}      type           - Custom event type name.
         * @param {*}           [detail=null]  - Default payload for `event.detail`.
         * @param {Object}      [options={}]   - Default event options (`bubbles`,
         *   `cancelable`, `composed`).
         */
        cmd.preset = function (name, elm, type, detail = null, options = {}) {
            presets[name] = { elm, type, detail, options };
        };

        /**
         * Fire a previously registered preset by name.
         *
         * When `detail` is provided it overrides the preset's stored default for
         * this dispatch only. No-op when no preset with the given name exists.
         *
         * @param {string} name     - Name of the preset to dispatch.
         * @param {*}      [detail] - Per-dispatch detail override. When `undefined`,
         *   the preset's default detail is used.
         */
        cmd.dispatch = function (name, detail) {
            const p = presets[name];
            if (p) {
                p.elm.dispatchEvent(buildCustomEvent(
                    p.type,
                    detail !== undefined ? detail : p.detail,
                    p.options
                ));
            }
        };

        /**
         * Delete a named preset from the registry.
         * No-op when the name is not found.
         *
         * @param {string} name - Name of the preset to remove.
         */
        cmd.unset = function (name) {
            delete presets[name];
        };

        // ── Event delegation ────────────────────────────────────────────────────

        /**
         * Register a delegated event listener on `root` that fires `fn` only
         * when the event target (or one of its ancestors up to `root`) matches
         * `selector`.
         *
         * Equivalent to jQuery-style delegation : one DOM listener handles
         * thousands of descendants. Useful for lists where each item has an
         * interactive control - avoids attaching N listeners.
         *
         * The handler receives the matched element as `event.currentMatch`
         * (non-standard but stable across redraws) so consumers don't have to
         * re-walk `e.target.closest(selector)` themselves.
         *
         * Like {@link cmd.on}, the listener is **named** - register the same
         * name twice and the previous binding is replaced. Retrieve with
         * {@link cmd.off}(name).
         *
         * Walk semantics : walks from `event.target` upward, **excluding**
         * `root`. Only element nodes (`nodeType === 1`) are tested against
         * `selector`. Returns on the FIRST match (no further ancestors tested).
         *
         * @param {string}     name     - Unique listener identifier.
         * @param {EventTarget} root    - Root element to attach the real listener.
         * @param {string}     type     - DOM event type (`'click'`, `'input'`, …).
         * @param {string}     selector - CSS selector descendants must match.
         * @param {Function}   fn       - Handler `(event) => void`. `event.currentMatch`
         *   is set to the matched element before invocation.
         * @param {boolean | AddEventListenerOptions} [options=false]
         */
        cmd.delegate = function (name, root, type, selector, fn, options = false) {
            if (cmd.has(name)) cmd.off(name);
            const handler = function (event) {
                // Walk from event.target up to (not beyond) root, looking for
                // a node matching `selector`. The native `closest()` stops at
                // document; we manually clamp at `root` to scope correctly.
                let target = event.target;
                while (target && target !== root) {
                    if (target.nodeType === 1 && target.matches && target.matches(selector)) {
                        event.currentMatch = target;
                        fn.call(target, event);
                        return;
                    }
                    target = target.parentNode;
                }
            };
            root.addEventListener(type, handler, options);
            listeners[name] = { elm: root, type, fn: handler, options };
        };

        // ── Namespaced scope (bulk cleanup) ─────────────────────────────────────

        /**
         * Namespaced sub-API for grouped listener cleanup.
         *
         * Every `on` / `delegate` registered through the returned scope is prefixed
         * with `<scopeName>:` ; `scope.clear()` removes them all in one call -
         * convenient for component teardown, modal close, etc.
         *
         * @example
         *   const s = events.scope('myWidget');
         *   s.on('click', el, 'click', fn);    // → registered as 'myWidget:click'
         *   s.delegate('row', root, 'click', '.row', fn);
         *   s.clear();                          // detaches both
         *
         * @param {string} scopeName - Namespace prefix.
         * @returns {{
         *   on:       Function,
         *   delegate: Function,
         *   off:      Function,
         *   has:      Function,
         *   clear:    Function
         * }}
         */
        cmd.scope = function (scopeName) {
            const prefix = scopeName + ':';
            const own = new Set();   // names owned by this scope

            return {
                on(name, elm, type, fn, options) {
                    const full = prefix + name;
                    cmd.on(full, elm, type, fn, options);
                    own.add(full);
                    return full;
                },
                delegate(name, root, type, selector, fn, options) {
                    const full = prefix + name;
                    cmd.delegate(full, root, type, selector, fn, options);
                    own.add(full);
                    return full;
                },
                off(name) {
                    const full = prefix + name;
                    cmd.off(full);
                    own.delete(full);
                },
                has(name) {
                    return cmd.has(prefix + name);
                },
                clear() {
                    for (const name of [...own]) cmd.off(name);
                    own.clear();
                },
            };
        };

        // ── Auto-cleanup via MutationObserver (opt-in) ─────────────────────────

        let _observer = null;           // The observer instance, if installed.
        const _byElement = new WeakMap(); // elm → Set<listenerName>

        /**
         * Track an (elm → listenerName) reverse-mapping so the observer
         * can locate listeners to off when their elm leaves the DOM. Called
         * internally by `on` and `delegate` once auto-cleanup is enabled.
         */
        function _trackElement(elm, name) {
            if (!_observer) return;     // not enabled : no-op cost
            let set = _byElement.get(elm);
            if (!set) { set = new Set(); _byElement.set(elm, set); }
            set.add(name);
        }

        /**
         * Wrap `on`/`delegate` so they auto-track the elm-listener association.
         * Done lazily here so the unwrapping is straightforward when disabled.
         */
        const _origOn       = cmd.on;
        const _origDelegate = cmd.delegate;

        function _walkAndCleanup(node) {
            // Walk a removed subtree, off()ing any tracked listeners.
            if (!node) return;
            // Element : check direct mapping.
            const set = _byElement.get(node);
            if (set) {
                for (const name of set) cmd.off(name);
                _byElement.delete(node);
            }
            // Descend. childNodes is live but we just removed the subtree, so
            // iteration is stable.
            const kids = node.childNodes;
            if (!kids) return;
            for (let i = 0; i < kids.length; i++) _walkAndCleanup(kids[i]);
        }

        /**
         * Install a global `MutationObserver` on `root` (defaults to
         * `document.body`) that auto-detaches listeners registered via
         * `events.on` / `events.delegate` whenever their target element
         * leaves the DOM tree.
         *
         * Opt-in : without this, listeners persist until `events.off(name)`
         * or `events.clear()` is called. Recommended for long-running apps
         * with dynamic DOM (lists, modals, third-party widgets that detach
         * nodes without notifying).
         *
         * Idempotent : calling twice with the same root is a no-op.
         *
         * @param {Element} [root=document.body]
         * @returns {() => void} Disabler.
         */
        cmd.autoCleanup = function (root) {
            if (_observer) return cmd._disableAutoCleanup;
            const target = root || (typeof document !== 'undefined' ? document.body : null);
            if (!target) return () => {};
            _observer = new MutationObserver((records) => {
                for (const r of records) {
                    const removed = r.removedNodes;
                    if (!removed) continue;
                    for (let i = 0; i < removed.length; i++) _walkAndCleanup(removed[i]);
                }
            });
            _observer.observe(target, { childList: true, subtree: true });

            // Wrap on/delegate to track. This runs once per autoCleanup() call.
            cmd.on = function (name, elm, type, fn, options) {
                _origOn.call(cmd, name, elm, type, fn, options);
                _trackElement(elm, name);
            };
            cmd.delegate = function (name, r, type, sel, fn, options) {
                _origDelegate.call(cmd, name, r, type, sel, fn, options);
                _trackElement(r, name);
            };

            cmd._disableAutoCleanup = function () {
                if (!_observer) return;
                _observer.disconnect();
                _observer = null;
                cmd.on = _origOn;
                cmd.delegate = _origDelegate;
            };
            return cmd._disableAutoCleanup;
        };

        return /** @type {EventsAPI} */ (/** @type {any} */ (cmd));
    }
};
