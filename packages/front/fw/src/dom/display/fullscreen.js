// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Fullscreen management service providing a unified, cross-browser
 * API to query, enter, exit, and toggle the browser's fullscreen mode, with a
 * named-callback registry that fires on every state change.
 *
 * Entering fullscreen **must** be triggered from a user-gesture handler (e.g. a
 * `click` listener). Pass the DOM `Event` directly to `enter` or `toggle` -
 * the factory resolves the target element from `event.currentTarget` (or
 * `event.target`) automatically, which satisfies the browser's security
 * requirements without any extra boilerplate in call sites.
 *
 * The document-level `fullscreenchange` listener is attached lazily on the
 * first subscriber and detached as soon as the subscriber set becomes empty,
 * so a long-lived page that occasionally subscribes and unsubscribes does
 * not leak listeners. Same pattern as `dom/lifecycle/visibility`.
 *
 * Browser support: standard Fullscreen API (Chrome 71+, Firefox 64+, Edge 79+,
 * Safari 16.4+) with a webkit-prefix fallback for Safari < 16.4.
 * IE and legacy Edge (ms-prefix) are not supported.
 *
 */

/**
 * Named state-change callback registry exposed as `api.listen`.
 *
 * @typedef {object} FullscreenListenAPI
 * @property {(name: string, fn: (active: boolean) => void) => void} add Register (or replace) a named state-change callback.
 * @property {(name: string) => void} del Remove a named callback; detaches the listener when none remain.
 */

/**
 * Public API returned by `fullscreen.factory()`.
 *
 * @typedef {object} FullscreenAPI
 * @property {() => boolean} isSupported Whether the Fullscreen API is available.
 * @property {() => boolean} isFullscreen Whether the browser is currently in fullscreen mode.
 * @property {(source?: Event | Element) => Promise<void>} enter Enter fullscreen for the element resolved from `source`.
 * @property {() => Promise<void>} exit Exit fullscreen mode.
 * @property {(source?: Event | Element) => Promise<void>} toggle Toggle fullscreen state.
 * @property {FullscreenListenAPI} listen Named state-change callback registry.
 * @property {() => void} dispose Remove every callback and detach the document-level listener.
 */

export const fullscreen = {
    name: 'fullscreen',
    type: 'fw.dom.display',
    dependencies: [],

    /** @returns {FullscreenAPI} */
    factory() {

        // Internal state
        let active = false;

        const callbacks = {
            map:  [],  // insertion-ordered list of registered names
            list: {}   // name → fn
        };

        /** @type {Function|null} bound `fullscreenchange` handler, null when detached */
        let _changeHandler = null;
        /** @type {string|null} the event name we registered on (standard or webkit) */
        let _changeEventName = null;

        // --- Internal helpers ---

        /**
         * Return `true` when the standard Fullscreen API is available.
         * Uses `fullscreenEnabled` with a webkit fallback for Safari < 16.4.
         *
         * @returns {boolean}
         */
        function isSupported() {
            // @ts-ignore - webkitFullscreenEnabled is a Safari vendor-prefixed API not in TS lib types
            return !!(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);
        }

        /**
         * Read the live fullscreen state from the document.
         *
         * `fullscreenElement` is `null` when not in fullscreen and an `Element`
         * when active. The `??` operator falls through to the webkit property only
         * when the standard property is absent (`undefined`), i.e. on Safari < 16.4.
         *
         * @returns {boolean} `true` when any element is in fullscreen.
         */
        function getState() {
            // @ts-ignore - webkitFullscreenElement is a Safari vendor-prefixed API not in TS lib types
            return !!(document.fullscreenElement ?? document.webkitFullscreenElement);
        }

        /**
         * Request fullscreen on `elm`.
         * Returns the native `Promise<void>` so callers can await or catch errors.
         *
         * @param {Element} elm - Element to promote to fullscreen.
         * @returns {Promise<void>}
         */
        function requestFullscreen(elm) {
            if (elm.requestFullscreen)       return elm.requestFullscreen();
            // @ts-ignore - webkitRequestFullscreen is a Safari vendor-prefixed API not in TS lib types
            if (elm.webkitRequestFullscreen) return elm.webkitRequestFullscreen();
            return Promise.reject(new Error('Fullscreen API not supported'));
        }

        /**
         * Exit fullscreen mode.
         *
         * Resolves immediately when no element is currently in fullscreen to
         * avoid an unhandled `Promise` rejection from the native API.
         *
         * @returns {Promise<void>}
         */
        function cancelFullscreen() {
            if (!getState()) return Promise.resolve();
            if (document.exitFullscreen)       return document.exitFullscreen();
            // @ts-ignore - webkitExitFullscreen is a Safari vendor-prefixed API not in TS lib types
            if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
            return Promise.reject(new Error('Fullscreen API not supported'));
        }

        /**
         * Resolve the target element from a `source` argument.
         *
         * Accepts a DOM `Event` (uses `currentTarget` then `target`), any
         * `Element` (including SVG), or `undefined` - falling back to
         * `document.documentElement` in all other cases.
         *
         * @param {Event | Element | undefined} source
         * @returns {Element}
         */
        function resolveElement(source) {
            // @ts-ignore - currentTarget/target are EventTarget but treated as Element; valid for fullscreen events
            if (source instanceof Event)   return source.currentTarget || source.target || document.documentElement;
            if (source instanceof Element) return source;
            return document.documentElement;
        }

        /**
         * Internal handler bound to the `fullscreenchange` event.
         * Updates the cached state and notifies every registered callback.
         */
        function onChangeHandler() {
            active = getState();
            for (let i = 0; i < callbacks.map.length; i++) {
                callbacks.list[callbacks.map[i]](active);
            }
        }

        /**
         * Attach the document-level `fullscreenchange` listener. Idempotent.
         * Called lazily when the first subscriber registers.
         */
        function _attach() {
            if (_changeHandler) return;
            _changeHandler = onChangeHandler;
            _changeEventName = ('onfullscreenchange' in document) ? 'fullscreenchange' : 'webkitfullscreenchange';
            // @ts-ignore - _changeHandler is EventListener-compatible; string event name covers vendor prefix
            document.addEventListener(_changeEventName, _changeHandler, false);
        }

        /**
         * Detach the document-level listener. Idempotent.
         * Called when the subscriber set becomes empty.
         */
        function _detach() {
            if (!_changeHandler) return;
            // @ts-ignore - _changeHandler is EventListener-compatible; string event name covers vendor prefix
            document.removeEventListener(_changeEventName, _changeHandler, false);
            _changeHandler = null;
            _changeEventName = null;
        }

        // --- Public API ---

        const api = {};

        /**
         * Return whether the Fullscreen API is available in this browser.
         *
         * @returns {boolean}
         */
        api.isSupported = function () {
            return isSupported();
        };

        /**
         * Return whether the browser is currently in fullscreen mode.
         *
         * The value is updated synchronously on every `fullscreenchange` event
         * and reflects the last confirmed state.
         *
         * @returns {boolean} `true` when fullscreen is active.
         */
        api.isFullscreen = function () {
            return active;
        };

        /**
         * Enter fullscreen mode for the element resolved from `source`.
         *
         * To satisfy the browser's user-gesture requirement, call this method
         * directly inside a DOM event handler and pass the event object -
         * the element is derived from `event.currentTarget` (falling back to
         * `event.target`). Alternatively, pass an `Element` explicitly, or omit
         * the argument to target `document.documentElement`.
         *
         * @param {Event | Element} [source] - Origin of the request.
         * @returns {Promise<void>}
         */
        api.enter = function (source) {
            return requestFullscreen(resolveElement(source));
        };

        /**
         * Exit fullscreen mode.
         *
         * Resolves immediately when the document is not in fullscreen.
         *
         * @returns {Promise<void>}
         */
        api.exit = function () {
            return cancelFullscreen();
        };

        /**
         * Toggle fullscreen state.
         *
         * Exits when already in fullscreen; otherwise enters fullscreen on the
         * element resolved from `source` (see {@link api.enter}).
         *
         * @param {Event | Element} [source] - Forwarded to `enter` when
         *   entering fullscreen. Ignored when exiting.
         * @returns {Promise<void>}
         */
        api.toggle = function (source) {
            return active ? api.exit() : api.enter(source);
        };

        /**
         * Named state-change callback registry.
         *
         * Every registered function is called in insertion order on each
         * `fullscreenchange` event, receiving a single boolean argument:
         * `true` when fullscreen is now active, `false` when it has been exited.
         *
         * The document-level listener is attached on the first `add()` call
         * and detached as soon as the last subscriber is removed via `del()`
         * or `dispose()`.
         */
        api.listen = {

            /**
             * Register a named state-change callback.
             *
             * Re-registering the same `name` replaces its function without
             * changing its position in the call order. The document-level
             * listener is attached lazily on the first call.
             *
             * @param {string}                  name - Unique callback identifier.
             * @param {function(boolean): void} fn   - Handler receiving the new state.
             */
            add(name, fn) {
                if (callbacks.map.indexOf(name) < 0) {
                    callbacks.map.push(name);
                }
                callbacks.list[name] = fn;
                _attach();
            },

            /**
             * Remove a named state-change callback.
             *
             * No-op when `name` is not registered. When the last subscriber
             * is removed, the document-level listener is detached.
             *
             * @param {string} name - Name of the callback to remove.
             */
            del(name) {
                const idx = callbacks.map.indexOf(name);
                if (idx > -1) {
                    callbacks.map.splice(idx, 1);
                    delete callbacks.list[name];
                }
                if (callbacks.map.length === 0) _detach();
            }
        };

        /**
         * Remove every registered callback and detach the document-level
         * listener. Use on scope/page teardown to guarantee no leak.
         */
        api.dispose = function () {
            callbacks.map.length = 0;
            for (const k of Object.keys(callbacks.list)) delete callbacks.list[k];
            _detach();
        };

        return api;
    }
};
