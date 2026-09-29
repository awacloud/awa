// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Wrapper around the Background Sync API (W3C, currently Chromium-only).
 * Allows registering sync tags via SyncManager: the browser fires the `sync`
 * event in the Service Worker once connectivity is judged sufficient.
 * Not worker-safe: SyncManager is reached via ServiceWorkerRegistration on the
 * main thread; the `self.addEventListener('sync', ...)` handler belongs to the
 * Service Worker itself.
 *
 * Out of scope: Periodic Background Sync (a distinct, less-supported API).
 *
 * @example
 * const backgroundSync = registry.resolve('backgroundSync');
 * if (backgroundSync.support().available) {
 *     await backgroundSync.register('sync-uploads');
 * }
 */

/**
 * @typedef {Object} SyncManager
 * @property {function(string): Promise<void>} register
 * @property {function(): Promise<string[]>} getTags
 */

/**
 * Background Sync helper surface returned by `factory()`.
 * @typedef {object} BackgroundSyncAPI
 * @property {(tag: string) => Promise<void>} register - Register a sync tag (throws `BackgroundSyncNotSupported` if SyncManager is unavailable).
 * @property {() => Promise<string[]>} list - List currently registered sync tags (throws `BackgroundSyncNotSupported` if SyncManager is unavailable).
 * @property {() => { available: boolean, sw: boolean }} support - Detect availability of the Background Sync API.
 */

import { serviceWorker } from './serviceWorker.js';

export const backgroundSync = {
    name: 'backgroundSync',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: ['serviceWorker'],
    deps: [serviceWorker],

    /**
     * @param {Object} serviceWorker - Resolved instance of the serviceWorker module.
     * @returns {BackgroundSyncAPI}
     */
    factory(serviceWorker) {
        /**
         * Returns the SyncManager from the active registration.
         // @ts-ignore - vendor/experimental API not yet in TS lib types
         * @returns {Promise<SyncManager>}
         * @private
         */
        async function _getSyncManager() {
            const registration = await serviceWorker.ready();
            if (!registration || !registration.sync) {
                const err = new Error('backgroundSync: SyncManager is not available in this environment');
                err.name = 'BackgroundSyncNotSupported';
                throw err;
            }
            return registration.sync;
        }

        /**
         * Registers a sync tag.
         * The Service Worker will receive the `sync` event with `event.tag === tag`
         * as soon as the browser deems connectivity sufficient.
         *
         * @param {string} tag - Unique identifier for the sync task.
         * @returns {Promise<void>}
         * @throws {Error} A plain Error with `name === 'BackgroundSyncNotSupported'` if SyncManager is unavailable.
         */
        async function register(tag) {
            const sync = await _getSyncManager();
            return sync.register(tag);
        }

        /**
         * Lists sync tags currently registered.
         *
         * @returns {Promise<string[]>} Array of pending tags.
         * @throws {Error} A plain Error with `name === 'BackgroundSyncNotSupported'` if SyncManager is unavailable.
         */
        async function list() {
            const sync = await _getSyncManager();
            return sync.getTags();
        }

        /**
         * Detects availability of the Background Sync API.
         *
         * Note: `available` is a best-effort hint. SyncManager is only reliably
         * detectable on a live ServiceWorkerRegistration; for a definitive check,
         * call `register()` and catch a `BackgroundSyncNotSupported` error.
         *
         * @returns {{ available: boolean, sw: boolean }}
         *   - `sw`: true if navigator.serviceWorker is present.
         *   - `available`: best-effort hint that SyncManager may be reachable.
         */
        function support() {
            const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
            // SyncManager is only reliably detectable on the live registration; this is a hint.
            const selfRef = globalThis.self ?? {};
            const available = sw && ('SyncManager' in globalThis || 'SyncManager' in selfRef);
            return { available, sw };
        }

        return { register, list, support };
    },
};
