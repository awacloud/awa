// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Idle detector instance returned by `create()` (native `IdleDetector`).
 *
 * @typedef {object} IdleDetectorInstance
 * @property {string} userState Current user state (`'active'` | `'idle'`).
 * @property {string} screenState Current screen state (`'locked'` | `'unlocked'`).
 * @property {(callback: (payload: { userState: string, screenState: string }) => void) => (() => boolean)} onChange Subscribe to change events; returns an unsubscribe function.
 * @property {() => Promise<void>} start Start the underlying detector.
 * @property {() => void} stop Stop the detector and clear all listeners.
 */

/**
 * Idle detector instance returned by `fallback()` (activity-based polyfill).
 *
 * @typedef {object} IdleFallbackInstance
 * @property {string} userState Current user state (`'active'` | `'idle'`).
 * @property {(callback: (payload: { userState: string }) => void) => (() => boolean)} onChange Subscribe to change events; returns an unsubscribe function.
 * @property {() => void} start Begin listening for user activity.
 * @property {() => void} stop Stop listening and clear timers/listeners.
 */

/**
 * Public API returned by `idle.factory()`.
 *
 * @typedef {object} IdleAPI
 * @property {() => boolean} isSupported Whether the native `IdleDetector` API is available.
 * @property {() => Promise<string>} requestPermission Request idle-detection permission (`'granted'` | `'denied'`).
 * @property {(options?: { threshold?: number }) => Promise<IdleDetectorInstance>} create Create a native idle detector.
 * @property {(options?: { threshold?: number, events?: string[] }) => IdleFallbackInstance} fallback Create an activity-based fallback detector.
 */
export const idle = {
    name: 'idle',
    type: 'fw.dom.lifecycle',
    dependencies: [],
    worker: false,

    /** @returns {IdleAPI} */
    factory() {
        function isSupported() {
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            return typeof IdleDetector !== 'undefined';
        }

        async function requestPermission() {
            if (!isSupported()) return 'denied';
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            return IdleDetector.requestPermission();
        }

        async function create({ threshold = 60_000 } = {}) {
            if (!isSupported()) throw new Error('idle: IdleDetector not supported - use fallback()');
            // @ts-ignore - vendor/experimental API not yet in TS lib types
            const detector = new IdleDetector();
            const _listeners = new Set();

            detector.addEventListener('change', () => {
                const payload = { userState: detector.userState, screenState: detector.screenState };
                _listeners.forEach(fn => fn(payload));
            });

            return {
                get userState() { return detector.userState; },
                get screenState() { return detector.screenState; },
                onChange(callback) {
                    _listeners.add(callback);
                    return () => _listeners.delete(callback);
                },
                async start() {
                    await detector.start({ threshold });
                },
                stop() {
                    detector.stop();
                    _listeners.clear();
                },
            };
        }

        function fallback({
            threshold = 60_000,
            events = ['mousemove', 'keydown', 'touchstart'],
        } = {}) {
            let _userState = 'active';
            let _timer = null;
            const _listeners = new Set();
            let _started = false;

            function _notify() {
                _listeners.forEach(fn => fn({ userState: _userState }));
            }

            function _resetTimer() {
                if (_timer !== null) clearTimeout(_timer);
                if (_userState !== 'active') {
                    _userState = 'active';
                    _notify();
                }
                _timer = setTimeout(() => {
                    _userState = 'idle';
                    _timer = null;
                    _notify();
                }, threshold);
            }

            function handler() { _resetTimer(); }

            return {
                get userState() { return _userState; },
                onChange(callback) {
                    _listeners.add(callback);
                    return () => _listeners.delete(callback);
                },
                start() {
                    if (_started) return;
                    _started = true;
                    events.forEach(ev => window.addEventListener(ev, handler));
                    _resetTimer();
                },
                stop() {
                    _started = false;
                    events.forEach(ev => window.removeEventListener(ev, handler));
                    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
                    _listeners.clear();
                },
            };
        }

        return { isSupported, requestPermission, create, fallback };
    },
};
