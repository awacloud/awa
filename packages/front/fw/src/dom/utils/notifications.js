// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Wrapper around the Web Notifications API. Tracks active notifications so
 * they can be closed in bulk via {@link closeAll}, supports an `autoCloseMs`
 * option to dismiss a notification after a delay, and exposes a
 * {@link showFromSW} helper that forwards to a ServiceWorker registration's
 * `showNotification` method.
 *
 * Worker: partial - the `Notification` constructor is main-thread only, but
 * {@link showFromSW} is usable from inside a ServiceWorker context where
 * `registration.showNotification` is available.
 */

/**
 * Options accepted by `show`. Extends the native `NotificationOptions`
 * with a few framework-level extras.
 *
 * @typedef {object} ShowOptions
 * @property {(event: Event) => void} [onclick]      Click handler attached to the notification.
 * @property {() => void}              [onclose]     Called when the notification is closed by the user or system. Not invoked when {@link NotificationHandle.close} is called explicitly.
 * @property {(event: Event) => void} [onerror]      Error handler attached to the notification.
 * @property {(event: Event) => void} [onshow]       Show handler attached to the notification.
 * @property {number}                  [autoCloseMs] If > 0, automatically closes the notification after this many milliseconds.
 * @property {string}                  [body]        Native option - body text.
 * @property {string}                  [icon]        Native option - icon URL.
 * @property {string}                  [tag]         Native option - tag for grouping/replacement.
 * @property {*}                       [data]        Native option - arbitrary data attached to the notification.
 */

/**
 * Handle returned by `show`. Wraps the underlying `Notification`
 * instance and provides a `close()` method that also cleans up the internal
 * tracking set and any pending auto-close timer.
 *
 * @typedef {object} NotificationHandle
 * @property {Notification} notification The underlying native Notification instance.
 * @property {() => void}   close        Closes the notification, clears the auto-close timer (if any) and removes the handle from internal tracking. Does NOT invoke the user-supplied `onclose` callback.
 */

/**
 * Public API returned by the {@link notifications} factory.
 *
 * @typedef {object} NotificationsApi
 * @property {() => boolean}                                                                          isSupported       Whether the Web Notifications API is available in the current environment.
 * @property {() => ('granted'|'denied'|'default')}                                                   permission        Current permission state. Returns `'denied'` when unsupported.
 * @property {() => Promise<('granted'|'denied')>}                                                    requestPermission Requests permission from the user. Returns `'denied'` when unsupported or refused.
 * @property {(title: string, options?: ShowOptions) => NotificationHandle}                           show              Displays a notification. Throws synchronously if permission is not `'granted'`.
 * @property {(handle: NotificationHandle) => void}                                                   close             Closes a specific handle. Equivalent to `handle.close()`, kept for symmetry with {@link closeAll}.
 * @property {() => void}                                                                             closeAll          Closes every currently tracked notification.
 * @property {(registration: ServiceWorkerRegistration, title: string, options?: object) => Promise<void>} showFromSW    Forwards to `registration.showNotification`. Use from a ServiceWorker context; on the main thread use `show` instead.
 */

/**
 * Strict factory descriptor for the notifications module.
 *
 * @type {{
 *   name: 'notifications',
 *   version: '1.0.0',
 *   type: 'fw.dom.utils',
 *   dependencies: [],
 *   worker: 'partial',
 *   factory: () => NotificationsApi
 * }}
 */
export const notifications = {
    name: 'notifications',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: [],
    worker: 'partial',

    /**
     * Builds a fresh notifications API with its own internal tracking set.
     * Each call produces an isolated instance - handles created by one
     * factory call are not visible to {@link NotificationsApi.closeAll} of
     * another.
     *
     * @returns {NotificationsApi} The notifications API surface.
     */
    factory() {
        const _active = new Set();

        /**
         * Checks whether the Web Notifications API is available in the
         * current global scope.
         *
         * @returns {boolean} `true` when `Notification` is defined globally, `false` otherwise.
         */
        function isSupported() {
            return typeof Notification !== 'undefined';
        }

        /**
         * Returns the current notification permission state.
         *
         * @returns {('granted'|'denied'|'default')} The current permission state, or `'denied'` when the API is unsupported.
         */
        function permission() {
            if (!isSupported()) return 'denied';
            return Notification.permission;
        }

        /**
         * Prompts the user for notification permission. Resolves with the
         * resulting permission state, normalized to either `'granted'` or
         * `'denied'`.
         *
         * @returns {Promise<('granted'|'denied')>} Resolves to the final permission state.
         */
        async function requestPermission() {
            if (!isSupported()) return 'denied';
            const result = await Notification.requestPermission();
            return result === 'granted' ? 'granted' : 'denied';
        }

        /**
         * Displays a notification and returns a {@link NotificationHandle}
         * that can be used to close it. Throws synchronously when
         * {@link permission} is not `'granted'` - callers that want to branch
         * on permission state should check {@link permission} first.
         *
         * The returned handle is tracked internally and removed automatically
         * when the notification fires `onclose` or when `handle.close()` is
         * called.
         *
         * @param {string}        title     Notification title.
         * @param {ShowOptions} [options={}] Notification options, including framework-level extras like `autoCloseMs` and lifecycle callbacks.
         * @returns {NotificationHandle} Handle wrapping the underlying notification.
         * @throws {Error} When the current permission is not `'granted'`.
         */
        function show(title, options = {}) {
            if (permission() !== 'granted') throw new Error('notifications: permission denied');
            const { onclick, onclose, onerror, onshow, autoCloseMs, ...nativeOptions } = options;
            const notification = new Notification(title, nativeOptions);
            let autoCloseTimer = null;

            if (onclick) notification.onclick = onclick;
            if (onerror) notification.onerror = onerror;
            if (onshow) notification.onshow = onshow;

            const handle = {
                notification,
                close() {
                    if (autoCloseTimer !== null) clearTimeout(autoCloseTimer);
                    autoCloseTimer = null;
                    notification.onclose = null;
                    _active.delete(handle);
                    notification.close();
                },
            };

            notification.onclose = () => {
                if (autoCloseTimer !== null) clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
                _active.delete(handle);
                if (onclose) onclose();
            };

            _active.add(handle);

            if (autoCloseMs != null && autoCloseMs > 0) {
                autoCloseTimer = setTimeout(() => {
                    autoCloseTimer = null;
                    handle.close();
                }, autoCloseMs);
            }

            return handle;
        }

        /**
         * Closes the notification associated with the given handle.
         * Equivalent to calling `handle.close()` directly; kept for API
         * symmetry with {@link closeAll}.
         *
         * @param {NotificationHandle} handle Handle previously returned by `show`.
         * @returns {void}
         */
        function close(handle) {
            handle.close();
        }

        /**
         * Closes every notification currently tracked by this factory
         * instance. Iterates over a snapshot of the active set so it is safe
         * even though `handle.close()` mutates the set during iteration.
         *
         * @returns {void}
         */
        function closeAll() {
            for (const handle of [..._active]) {
                handle.close();
            }
        }

        /**
         * Forwards to a ServiceWorker registration's `showNotification`
         * method. Use this from within a ServiceWorker context (e.g. inside
         * a `push` event handler) where the `Notification` constructor is
         * not available. On the main thread, prefer `show`, which
         * returns a handle and supports `autoCloseMs`.
         *
         * @param {ServiceWorkerRegistration} registration A ServiceWorker registration with a `showNotification` method.
         * @param {string}                    title        Notification title.
         * @param {object}                  [options={}]   Native notification options forwarded as-is.
         * @returns {Promise<void>} Resolves once the registration has displayed the notification.
         */
        async function showFromSW(registration, title, options = {}) {
            return registration.showNotification(title, options);
        }

        return { isSupported, permission, requestPermission, show, close, closeAll, showFromSW };
    },
};
