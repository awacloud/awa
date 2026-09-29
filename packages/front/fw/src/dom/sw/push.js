// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Wrapper around PushManager on the browser side (main thread / window).
 * Covers: subscribe/unsubscribe with a VAPID public key, inspection of the
 * current subscription, and reading the permission state.
 *
 * Out of scope: server-side VAPID generation/management and payload
 * encryption (RFC 8291). Those responsibilities belong to dedicated server
 * libraries (Bun/Node) on the SDE side.
 *
 * References: Web Push Protocol RFC 8030, VAPID RFC 8292.
 *
 * @example
 * const push = runtime.resolve('push');
 * if (push.support().available) {
 *     const sub = await push.subscribe({ applicationServerKey: vapidPublicKey });
 *     console.log(sub.endpoint);
 * }
 */
import { serviceWorker } from './serviceWorker.js';
import { b64 } from '../../io/codec/b64.js';

/**
 * JSON-friendly serialization of a native PushSubscription.
 * @typedef {object} PushSubscriptionInfo
 * @property {string} endpoint
 * @property {number|null} expirationTime
 * @property {{p256dh: string|null, auth: string|null}} keys
 * @property {PushSubscription} raw - Native subscription escape hatch.
 */

/**
 * Push API returned by `factory()`.
 * @typedef {object} PushAPI
 * @property {(opts: {applicationServerKey: Uint8Array|string, userVisibleOnly?: boolean}) => Promise<PushSubscriptionInfo>} subscribe - Subscribe with a VAPID public key.
 * @property {() => Promise<boolean>} unsubscribe - Unsubscribe the current subscription; resolves false when none.
 * @property {() => Promise<PushSubscriptionInfo|null>} current - Current serialized subscription, or null.
 * @property {() => Promise<'granted'|'denied'|'prompt'>} permission - Current push permission state.
 * @property {() => {available: boolean, sw: boolean}} support - Synchronous capability report.
 */

export const push = {
    name: 'push',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: ['serviceWorker', 'b64'],
    deps: [serviceWorker, b64],

    /**
     * @param {Object} serviceWorker - Resolved fw `serviceWorker` module.
     * @param {Object} b64 - Resolved fw `b64` module.
     * @returns {PushAPI}
     */
    factory(serviceWorker, b64) {
        /**
         * Convert an applicationServerKey (Uint8Array or base64url string)
         * to a Uint8Array suitable for PushManager.subscribe.
         * Validates that a decoded key is the expected 65 bytes (P-256 uncompressed).
         * @param {Uint8Array|string} key
         * @returns {Uint8Array}
         * @private
         */
        function _toKeyBytes(key) {
            if (key instanceof Uint8Array) return key;
            if (typeof key === 'string') {
                // base64url → standard base64, then decode
                const std = key.replace(/-/g, '+').replace(/_/g, '/');
                const padded = std + '='.repeat((4 - std.length % 4) % 4);
                const bytes = b64.toBytes(padded);
                if (bytes.length !== 65) {
                    throw new TypeError(
                        `push: applicationServerKey must decode to 65 bytes (got ${bytes.length})`
                    );
                }
                return bytes;
            }
            throw new TypeError('push: applicationServerKey must be Uint8Array or base64url string');
        }

        /**
         * Serialize a native PushSubscription into a JSON-friendly object.
         * Note: the `raw` field exposes the native subscription as an escape
         * hatch (e.g. for direct `.unsubscribe()`); mutating it bypasses the
         * wrapper's serialization guarantees.
         * @param {PushSubscription|null} sub
         * @returns {{endpoint: string, expirationTime: number|null, keys: {p256dh: string|null, auth: string|null}, raw: PushSubscription}|null}
         * @private
         */
        function _serialize(sub) {
            if (!sub) return null;
            const json = sub.toJSON ? sub.toJSON() : {};
            return {
                endpoint: sub.endpoint,
                expirationTime: sub.expirationTime ?? null,
                keys: {
                    p256dh: json.keys?.p256dh ?? null,
                    auth: json.keys?.auth ?? null,
                },
                raw: sub,
            };
        }

        /**
         * Obtain the ServiceWorkerRegistration via `serviceWorker.ready()`.
         * @returns {Promise<ServiceWorkerRegistration>}
         * @private
         */
        async function _registration() {
            return serviceWorker.ready();
        }

        /**
         * Subscribe to push notifications using the provided VAPID public key.
         * @param {Object} opts
         * @param {Uint8Array|string} opts.applicationServerKey - VAPID public key (Uint8Array or base64url string).
         * @param {boolean} [opts.userVisibleOnly=true] - Required `true` by Chrome.
         * @returns {Promise<{endpoint: string, expirationTime: number|null, keys: {p256dh: string|null, auth: string|null}, raw: PushSubscription}>}
         */
        // @ts-ignore - opts = {} initialized then filled below; TS cannot see required property added after
        async function subscribe({ applicationServerKey, userVisibleOnly = true } = {}) {
            const reg = await _registration();
            const keyBytes = _toKeyBytes(applicationServerKey);
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly,
                // @ts-ignore - Uint8Array is valid as BufferSource; SharedArrayBuffer strictness check
                applicationServerKey: keyBytes,
            });
            return _serialize(sub);
        }

        /**
         * Unsubscribe the current push subscription, if any.
         * @returns {Promise<boolean>} true if unsubscribed, false if no active subscription.
         */
        async function unsubscribe() {
            const reg = await _registration();
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return false;
            return sub.unsubscribe();
        }

        /**
         * Return the currently active push subscription serialized, or null.
         * @returns {Promise<{endpoint: string, expirationTime: number|null, keys: {p256dh: string|null, auth: string|null}, raw: PushSubscription}|null>}
         */
        async function current() {
            const reg = await _registration();
            const sub = await reg.pushManager.getSubscription();
            return _serialize(sub);
        }

        /**
         * Return the push permission state.
         * Note: `userVisibleOnly: true` is hard-coded by deliberate policy;
         * Chromium-based browsers require it for push subscriptions.
         * @returns {Promise<'granted'|'denied'|'prompt'>}
         */
        async function permission() {
            const reg = await _registration();
            return reg.pushManager.permissionState({ userVisibleOnly: true });
        }

        /**
         * Report push capabilities for the current context.
         * Main-thread oriented: `available` checks `PushManager` on `globalThis`,
         * which covers both window and Service Worker scopes.
         * @returns {{ available: boolean, sw: boolean }}
         */
        function support() {
            const available = typeof globalThis !== 'undefined' && 'PushManager' in globalThis;
            const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
            return { available, sw };
        }

        return { subscribe, unsubscribe, current, permission, support };
    },
};
