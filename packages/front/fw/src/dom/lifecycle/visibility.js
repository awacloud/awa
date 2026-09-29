// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Visibility lifecycle module.
 *
 * Thin wrapper over `document.visibilitychange` plus `pagehide`/`pageshow`,
 * exposed through a shared subscriber model. Listeners on the document are
 * attached lazily on the first subscription and detached as soon as the
 * subscriber set becomes empty, so a long-lived page that occasionally
 * subscribes and unsubscribes does not leak listeners.
 *
 */

/**
 * Public API returned by `visibility.factory()`.
 *
 * @typedef {object} VisibilityAPI
 * @property {() => boolean} isSupported Whether `document.visibilityState` is available.
 * @property {() => string} state Current `document.visibilityState`.
 * @property {() => boolean} isVisible Whether the document is currently visible.
 * @property {() => boolean} isHidden Whether the document is currently hidden.
 * @property {(callback: (state: string, event: Event|null) => void, options?: { immediate?: boolean }) => (() => void)} onChange Subscribe to visibility changes; returns an unsubscribe function.
 * @property {(callback: (state: string, event: Event|null) => void) => (() => void)} onVisible Subscribe only to transitions to visible; returns an unsubscribe function.
 * @property {(callback: (state: string, event: Event|null) => void) => (() => void)} onHidden Subscribe only to transitions to hidden; returns an unsubscribe function.
 */
export const visibility = {
    name: 'visibility',
    type: 'fw.dom.lifecycle',
    dependencies: [],
    worker: false,

    /** @returns {VisibilityAPI} */
    factory() {
        /** @type {Set<Function>} active subscribers */
        const _subs = new Set();
        /** @type {Function|null} bound visibilitychange handler */
        let _onVisChange = null;
        /** @type {Function|null} bound pagehide handler */
        let _onPageHide = null;
        /** @type {Function|null} bound pageshow handler */
        let _onPageShow = null;

        /**
         * Attach document-level listeners. Idempotent.
         * Called lazily when the first subscriber registers.
         */
        function _attach() {
            if (_onVisChange) return;
            _onVisChange = (event) => _emit(document.visibilityState, event);
            _onPageHide = (event) => _emit('hidden', event);
            _onPageShow = (event) => _emit(document.visibilityState || 'visible', event);
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.addEventListener('visibilitychange', _onVisChange);
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.addEventListener('pagehide', _onPageHide);
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.addEventListener('pageshow', _onPageShow);
        }

        /**
         * Detach document-level listeners. Idempotent.
         * Called when the subscriber set becomes empty.
         */
        function _detach() {
            if (!_onVisChange) return;
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.removeEventListener('visibilitychange', _onVisChange);
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.removeEventListener('pagehide', _onPageHide);
            // @ts-ignore - pagehide/pageshow not in DocumentEventMap; Function not assignable to specific EventListener overload
            document.removeEventListener('pageshow', _onPageShow);
            _onVisChange = _onPageHide = _onPageShow = null;
        }

        /**
         * Broadcast a state change to every subscriber.
         * @param {string} s current visibility state
         * @param {Event|null} event original DOM event (or null for immediate dispatch)
         */
        function _emit(s, event) {
            for (const fn of _subs) fn(s, event);
        }

        /**
         * Register a subscriber. Lazily attaches the document listeners on
         * the first call.
         * @param {Function} fn
         */
        function on(fn) {
            _subs.add(fn);
            _attach();
        }

        /**
         * Unregister a subscriber. When the set becomes empty, the document
         * listeners are detached.
         * @param {Function} fn
         */
        function off(fn) {
            _subs.delete(fn);
            if (_subs.size === 0) _detach();
        }

        function isSupported() {
            return typeof document !== 'undefined' && 'visibilityState' in document;
        }

        function state() {
            return document.visibilityState;
        }

        function isVisible() {
            return document.visibilityState === 'visible';
        }

        function isHidden() {
            return document.visibilityState === 'hidden';
        }

        function onChange(callback, { immediate = true } = {}) {
            on(callback);
            if (immediate) callback(document.visibilityState, null);
            return () => off(callback);
        }

        function onVisible(callback) {
            const wrapped = (s, e) => { if (s === 'visible') callback(s, e); };
            return onChange(wrapped, { immediate: true });
        }

        function onHidden(callback) {
            const wrapped = (s, e) => { if (s === 'hidden') callback(s, e); };
            return onChange(wrapped, { immediate: false });
        }

        return { isSupported, state, isVisible, isHidden, onChange, onVisible, onHidden };
    },
};
