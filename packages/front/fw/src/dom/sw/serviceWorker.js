// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Helpers for Service Worker registration and lifecycle from a page context
 * (window side). Requires HTTPS (or localhost). Not worker-safe: `register` /
 * `unregister` / `controller` rely on `navigator.serviceWorker`, which only
 * exists on the main thread.
 *
 * @example
 * const sw = registry.resolve('serviceWorker');
 * if (sw.isSupported()) {
 *     await sw.register('/sw.js', { scope: '/' });
 * }
 */

/**
 * Service Worker registration/lifecycle helper surface returned by `factory()`.
 * @typedef {object} ServiceWorkerAPI
 * @property {(scriptUrl: string, options?: RegistrationOptions) => Promise<ServiceWorkerRegistration>} register - Register a Service Worker script.
 * @property {(scope?: string) => Promise<boolean>} unregister - Unregister Service Worker(s); resolves true if at least one was unregistered.
 * @property {() => Promise<ServiceWorkerRegistration>} ready - Wait for and resolve the controlling registration.
 * @property {(scope?: string) => Promise<void>} update - Trigger `update()` on registration(s).
 * @property {(callback: (reg: ServiceWorkerRegistration) => void) => (() => void)} onUpdate - Attach an `updatefound` callback; returns a disposer.
 * @property {(data: any) => void} postMessage - Post a message to the active controller (throws if none).
 * @property {(callback: (data: any, event: MessageEvent) => void) => (() => void)} onMessage - Listen for messages from a Service Worker; returns a disposer.
 * @property {() => boolean} isSupported - Non-throwing probe for Service Worker support.
 * @property {ServiceWorker | null} controller - Current controlling Service Worker, or null if none.
 */

export const serviceWorker = {
    name: 'serviceWorker',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: [],

    /**
     * @returns {ServiceWorkerAPI}
     */
    factory() {
        /**
         * Non-throwing probe for Service Worker support.
         * Prefer this over catching exceptions from other methods.
         * @returns {boolean}
         */
        function isSupported() {
            return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
        }

        /**
         * Return `navigator.serviceWorker` or throw if unsupported.
         * Callers can guard with `isSupported()` to avoid the throw.
         * @returns {ServiceWorkerContainer}
         * @private
         */
        function _getSW() {
            if (!isSupported()) throw new Error('serviceWorker: navigator.serviceWorker is not available');
            return navigator.serviceWorker;
        }

        /**
         * Register a Service Worker script.
         * @param {string} scriptUrl - URL of the Service Worker script.
         * @param {RegistrationOptions} [options] - Native registration options.
         * @returns {Promise<ServiceWorkerRegistration>}
         */
        async function register(scriptUrl, options = {}) {
            return _getSW().register(scriptUrl, options);
        }

        /**
         * Unregister Service Worker(s).
         * If `scope` is given, unregisters only that scope. If omitted, iterates
         * all registrations and unregisters every one of them.
         * @param {string} [scope] - Scope to target. Omit to unregister all.
         * @returns {Promise<boolean>} true if at least one registration was unregistered.
         */
        async function unregister(scope) {
            const sw = _getSW();
            const registrations = await sw.getRegistrations();
            let any = false;
            for (const reg of registrations) {
                if (!scope || reg.scope === scope) {
                    const result = await reg.unregister();
                    if (result) any = true;
                    if (scope) return any;
                }
            }
            return any;
        }

        /**
         * Wait for an active registration. Resolves to the controlling registration.
         * @returns {Promise<ServiceWorkerRegistration>}
         */
        async function ready() {
            return _getSW().ready;
        }

        /**
         * Trigger `update()` on registration(s).
         * If `scope` is given, updates only that scope. If omitted, updates all.
         * @param {string} [scope] - Scope to target. Omit to update all.
         * @returns {Promise<void>}
         */
        async function update(scope) {
            const sw = _getSW();
            const registrations = await sw.getRegistrations();
            for (const reg of registrations) {
                if (!scope || reg.scope === scope) {
                    await reg.update();
                    if (scope) return;
                }
            }
        }

        /**
         * Attach a callback fired when a Service Worker update is found
         * (`updatefound` event on the registration). The callback receives the
         * registration whose `installing` or `waiting` worker is the new SW.
         *
         * The returned function detaches every listener attached by this call.
         *
         * @param {(reg: ServiceWorkerRegistration) => void} callback
         * @returns {() => void} Disposer that removes all attached listeners.
         */
        function onUpdate(callback) {
            const sw = _getSW();
            const bindings = [];

            function handleUpdateFound(reg) {
                const installing = reg.installing ?? reg.waiting;
                if (installing) callback(reg);
            }

            async function attach() {
                const registrations = await sw.getRegistrations();
                for (const reg of registrations) {
                    const handler = () => handleUpdateFound(reg);
                    reg.addEventListener('updatefound', handler);
                    bindings.push([reg, handler]);
                }
            }

            const attachPromise = attach();

            return () => {
                attachPromise.then(() => {
                    for (const [reg, handler] of bindings) {
                        reg.removeEventListener?.('updatefound', handler);
                    }
                    bindings.length = 0;
                });
            };
        }

        /**
         * Post a message to the active controller Service Worker.
         * Throws if no controller is active.
         * @param {any} data - Message payload (must be structured-cloneable).
         */
        function postMessage(data) {
            const ctrl = isSupported() ? navigator.serviceWorker.controller : null;
            if (!ctrl) throw new Error('serviceWorker: no active controller');
            ctrl.postMessage(data);
        }

        /**
         * Listen for messages from a Service Worker on `navigator.serviceWorker`.
         * @param {(data: any, event: MessageEvent) => void} callback
         * @returns {() => void} Disposer.
         */
        function onMessage(callback) {
            if (!isSupported()) return () => {};
            const handler = (event) => callback(event.data, event);
            navigator.serviceWorker.addEventListener('message', handler);
            return () => navigator.serviceWorker.removeEventListener('message', handler);
        }

        return {
            register, unregister, ready, update, onUpdate, postMessage, onMessage, isSupported,
            /**
             * Current controller Service Worker, or null if none is controlling
             * this page. The first navigation after `register()` typically has
             * no controller; subsequent loads do.
             * @returns {ServiceWorker | null}
             */
            get controller() { return isSupported() ? navigator.serviceWorker.controller : null; },
        };
    },
};
