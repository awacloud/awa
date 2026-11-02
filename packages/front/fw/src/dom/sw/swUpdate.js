// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Page-side waiting-release update flow over the `serviceWorker` module.
 *
 * A new release installs beside the running one and WAITS. `create()`
 * registers the worker and reports a waiting release once, and only to a
 * page a worker already controls (`onUpdateReady`) — the first install of an
 * uncontrolled page is not an update. `checkForUpdates()` asks the server on
 * demand, `applyUpdate()` lets the waiting release take over (a skip-waiting
 * message) and reloads the page on the next `controllerchange` — never on
 * its own. `version()` asks the active worker which release it serves over a
 * `MessageChannel`.
 *
 * The wire protocol (`DEFAULT_MESSAGES`) is the one the worker-side
 * `precache` module answers.
 *
 * Not worker-safe: relies on `navigator.serviceWorker`.
 *
 * @example
 * const swUpdate = runtime.resolve('swUpdate');
 * const updates = await swUpdate.create({
 *     swUrl: './sw.js',
 *     onUpdateReady: () => { banner.hidden = false; },
 * });
 * updateNow.addEventListener('click', () => updates.applyUpdate());
 */
import { serviceWorker } from './serviceWorker.js';

/**
 * Result of `checkForUpdates()`: `current` — no newer release; `ready` — one
 * is installed and waits; `offline` — the check could not reach the server;
 * `unavailable` — no service worker on this page.
 * @typedef {'current'|'ready'|'offline'|'unavailable'} CheckResult
 */

/**
 * The message types posted to the worker.
 * @typedef {object} SwMessages
 * @property {string} skipWaiting - Asks the waiting worker to take over.
 * @property {string} version - Asks the active worker for its release (answered on the transferred port).
 */

/**
 * Options of `create()`.
 * @typedef {object} SwUpdateOptions
 * @property {string} swUrl - The worker script URL.
 * @property {RegistrationOptions} [registerOptions] - Forwarded to `serviceWorker.register` (default `{ type: 'module', updateViaCache: 'none' }`).
 * @property {any} [win] - The page window (default `globalThis`).
 * @property {() => void} [onUpdateReady] - Called once when a newer release waits on a controlled page.
 * @property {() => void} [onControlled] - Called at creation when a worker controls the page, and on every `controllerchange`.
 * @property {SwMessages} [messages] - The message types (default `DEFAULT_MESSAGES`).
 * @property {number} [installWait] - Milliseconds a check waits for a found release to install (default 30000).
 * @property {number} [versionWait] - Milliseconds `version()` waits for the worker's answer (default 2000).
 */

/**
 * The update controller resolved by `create()`.
 * @typedef {object} SwUpdateController
 * @property {'registered'|'unsupported'|'failed'} state - Registration outcome.
 * @property {() => boolean} updateReady - A newer release waits and a worker controls the page.
 * @property {() => Promise<CheckResult>} checkForUpdates - Ask the server for a newer release.
 * @property {() => boolean} applyUpdate - Let the waiting release take over, then reload; `false` when none waits.
 * @property {() => Promise<string|null>} version - The release the active worker serves, `null` when unknown.
 * @property {() => boolean} controlled - A worker controls the page.
 * @property {() => void} dispose - Remove the listeners `create()` added.
 */

/**
 * Public surface returned by the swUpdate factory.
 * @typedef {object} SwUpdateAPI
 * @property {(opts: SwUpdateOptions) => Promise<SwUpdateController>} create - Register the worker and drive its updates.
 * @property {Readonly<SwMessages>} DEFAULT_MESSAGES - The default wire protocol.
 */

export const swUpdate = {
    name: 'swUpdate',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: ['serviceWorker'],
    deps: [serviceWorker],

    /**
     * @param {{isSupported: () => boolean, register: (url: string, o?: RegistrationOptions) => Promise<ServiceWorkerRegistration>}} serviceWorker - Module serviceWorker (fw)
     * @returns {SwUpdateAPI}
     */
    factory(serviceWorker) {
        const DEFAULT_MESSAGES = Object.freeze({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });

        /**
         * Resolve once a worker leaves `installing` (or after `ms`).
         * @param {ServiceWorker} worker
         * @param {number} ms
         * @returns {Promise<void>}
         * @private
         */
        function settled(worker, ms) {
            return new Promise((resolve) => {
                if (worker.state !== 'installing') { resolve(); return; }
                const timer = setTimeout(done, ms);
                function done() {
                    clearTimeout(timer);
                    worker.removeEventListener('statechange', onState);
                    resolve();
                }
                function onState() { if (worker.state !== 'installing') done(); }
                worker.addEventListener('statechange', onState);
            });
        }

        /**
         * Register the worker and drive its waiting-release updates.
         * @param {SwUpdateOptions} opts
         * @returns {Promise<SwUpdateController>}
         * @throws {TypeError} Synchronously, when `swUrl` is not a non-empty string.
         */
        function create({
            swUrl,
            registerOptions = { type: 'module', updateViaCache: 'none' },
            win = globalThis,
            onUpdateReady,
            onControlled,
            messages = DEFAULT_MESSAGES,
            installWait = 30000,
            versionWait = 2000,
        } = /** @type {any} */ ({})) {
            if (typeof swUrl !== 'string' || swUrl === '') {
                throw new TypeError('swUpdate.create: swUrl must be a non-empty string');
            }
            return start();

            /** @returns {Promise<SwUpdateController>} */
            async function start() {
                /** @type {SwUpdateController} */
                const none = {
                    state: 'unsupported',
                    updateReady: () => false,
                    checkForUpdates: async () => 'unavailable',
                    applyUpdate: () => false,
                    version: async () => null,
                    controlled: () => false,
                    dispose() {},
                };
                if (!serviceWorker.isSupported()) return none;
                /** @type {ServiceWorkerRegistration} */
                let reg;
                try {
                    reg = await serviceWorker.register(swUrl, registerOptions);
                } catch {
                    return { ...none, state: 'failed' };
                }
                const sw = win.navigator.serviceWorker;

                let reported = false;
                let accepted = false;
                /** @type {Array<[ServiceWorker, () => void]>} */
                const watched = [];

                /** Report a waiting release once — only to a page a worker already controls. */
                function report() {
                    if (reported || !reg.waiting || !sw.controller) return;
                    reported = true;
                    onUpdateReady?.();
                }
                /** @param {ServiceWorker|null} worker */
                function watch(worker) {
                    if (!worker) return;
                    const onState = () => { if (worker.state === 'installed') report(); };
                    worker.addEventListener('statechange', onState);
                    watched.push([worker, onState]);
                }
                const onUpdateFound = () => watch(reg.installing);
                const onControllerChange = () => {
                    onControlled?.();
                    // The release the user accepted took over: run it.
                    if (accepted) win.location.reload();
                };

                reg.addEventListener('updatefound', onUpdateFound);
                watch(reg.installing);
                report();
                if (sw.controller) onControlled?.();
                sw.addEventListener('controllerchange', onControllerChange);

                return {
                    state: 'registered',
                    updateReady: () => !!reg.waiting && !!sw.controller,
                    async checkForUpdates() {
                        if (win.navigator.onLine === false) return 'offline';
                        try {
                            await reg.update();
                        } catch {
                            return 'offline';
                        }
                        if (reg.installing) await settled(reg.installing, installWait);
                        if (reg.waiting && sw.controller) {
                            report();
                            return 'ready';
                        }
                        return 'current';
                    },
                    applyUpdate() {
                        const waiting = reg.waiting;
                        if (!waiting) return false;
                        accepted = true;
                        waiting.postMessage({ type: messages.skipWaiting });
                        return true;
                    },
                    version() {
                        const active = sw.controller || reg.active;
                        if (!active || typeof MessageChannel === 'undefined') return Promise.resolve(null);
                        return new Promise((resolve) => {
                            const channel = new MessageChannel();
                            const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, versionWait);
                            channel.port1.onmessage = (e) => {
                                clearTimeout(timer);
                                channel.port1.close();
                                resolve(typeof e.data?.version === 'string' ? e.data.version : null);
                            };
                            active.postMessage({ type: messages.version }, [channel.port2]);
                        });
                    },
                    controlled: () => !!sw.controller,
                    dispose() {
                        reg.removeEventListener('updatefound', onUpdateFound);
                        for (const [worker, onState] of watched) worker.removeEventListener('statechange', onState);
                        watched.length = 0;
                        sw.removeEventListener('controllerchange', onControllerChange);
                    },
                };
            }
        }

        return { create, DEFAULT_MESSAGES };
    },
};
