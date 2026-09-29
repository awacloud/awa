// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description Wrapper around `navigator.permissions.query` with a `watch()` helper
 *              that surfaces permission state changes via an `onchange` listener.
 */

/**
 * Public surface returned by the permissions factory.
 * @typedef {object} PermissionsAPI
 * @property {() => boolean} isSupported - `true` if `navigator.permissions` is present.
 * @property {(name: string) => Promise<string>} query - Query the current state of a named permission (`"granted"`, `"denied"`, or `"prompt"`).
 * @property {(name: string, callback: (state: string) => void, onError?: (err: Error) => void) => (() => void)} watch - Watch a permission for state changes; returns a `stop` function that detaches the listener.
 */

export const permissions = {
    name: 'permissions',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: [],
    worker: false,

    /**
     * Factory producing the permissions utility instance.
     * @returns {PermissionsAPI}
     */
    factory() {
        /**
         * Detects whether the Permissions API is available in the current environment.
         * @returns {boolean} `true` if `navigator.permissions` is present.
         */
        function isSupported() {
            return 'permissions' in navigator;
        }

        /**
         * Queries the current state of a named permission.
         * @param {string} name - Permission name (e.g. `"geolocation"`, `"camera"`).
         * @returns {Promise<string>} The permission state: `"granted"`, `"denied"`, or `"prompt"`.
         * @throws {Error} If the Permissions API is unavailable, or if `name` is not a supported permission.
         */
        async function query(name) {
            if (!isSupported()) throw new Error('permissions: unsupported');
            try {
                // @ts-ignore - PermissionName is a strict union; custom string names are valid per spec
                const status = await navigator.permissions.query({ name });
                return status.state;
            } catch (err) {
                throw new Error(`permissions: unsupported name "${name}"`, { cause: err });
            }
        }

        /**
         * Watches a permission for state changes and invokes `callback` whenever
         * the permission's `onchange` event fires.
         *
         * Errors from the underlying `navigator.permissions.query` call (e.g. unknown
         * permission name) are asynchronous: they are delivered to the optional
         * `onError` handler. If `onError` is not provided, the rejection is swallowed
         * silently (the caller has opted out of error notification) - it will NOT
         * surface as an unhandled rejection.
         *
         * @param {string} name - Permission name to watch.
         * @param {(state: string) => void} callback - Invoked with the new state on each change.
         * @param {(err: Error) => void} [onError] - Optional handler for async query errors.
         * @returns {() => void} `stop` function that detaches the listener and prevents
         *                       further callbacks (even if the underlying query has not yet resolved).
         * @throws {Error} Synchronously if the Permissions API is unavailable.
         */
        function watch(name, callback, onError) {
            if (!isSupported()) throw new Error('permissions: unsupported');

            let status = null;
            let stopped = false;

            function handler() {
                if (!stopped) callback(status.state);
            }

            // @ts-ignore - PermissionName is a strict union; custom string names are valid per spec
            navigator.permissions.query({ name }).then(s => {
                if (stopped) return;
                status = s;
                status.onchange = handler;
            }).catch(err => {
                if (stopped) return;
                if (onError) {
                    try {
                        onError(new Error(`permissions: unsupported name "${name}"`));
                    } catch {
                        // user-supplied onError threw - suppress to avoid unhandled rejection
                    }
                }
                // else: caller opted out of error notification - swallow silently
            });

            return function stop() {
                stopped = true;
                if (status) status.onchange = null;
            };
        }

        return { isSupported, query, watch };
    },
};
