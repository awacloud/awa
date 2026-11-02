// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * Page-side PWA install helpers: the `beforeinstallprompt` deferral (with
 * `appinstalled`) and the File Handling `launchQueue` consumer. Both APIs are
 * feature-detected, never assumed — they are Chromium-only today.
 *
 * `install()` keeps the browser's install offer until the page asks for it
 * (`prompt()`, on a user gesture — never a nag). `launchQueue()` hands the
 * files an installed app was opened with to a callback, as
 * `FileSystemFileHandle`s (the consumer calls `handle.getFile()`, and may
 * keep the handle to write back).
 *
 * Not worker-safe: both events fire on the page's window.
 *
 * @example
 * const installPrompt = runtime.resolve('installPrompt');
 * const offer = installPrompt.install({
 *     onAvailable: () => { button.hidden = false; },
 *     onInstalled: () => { button.hidden = true; },
 * });
 * button.addEventListener('click', async () => { await offer.prompt(); });
 * installPrompt.launchQueue({ onFiles: async (handles) => open(await handles[0].getFile()) });
 */

/**
 * Options of `install()`.
 * @typedef {object} InstallOptions
 * @property {EventTarget} [win] - The window the events fire on (default `globalThis`).
 * @property {() => void} [onAvailable] - Called when the browser offers installation.
 * @property {() => void} [onInstalled] - Called once the app is installed.
 */

/**
 * The install offer returned by `install()`.
 * @typedef {object} InstallOffer
 * @property {() => boolean} available - An install offer is deferred and can be prompted.
 * @property {() => Promise<'accepted'|'dismissed'|'unavailable'>} prompt - Show the deferred offer; never rejects.
 * @property {() => void} dispose - Remove both listeners and drop the deferred offer.
 */

/**
 * Options of `launchQueue()`.
 * @typedef {object} LaunchQueueOptions
 * @property {any} [win] - The window carrying `launchQueue` (default `globalThis`).
 * @property {(handles: FileSystemFileHandle[]) => void} onFiles - Receives the launched files' handles (never an empty list).
 */

/**
 * The launch-queue consumer returned by `launchQueue()`.
 * @typedef {object} LaunchQueueConsumer
 * @property {boolean} supported - The File Handling launch queue exists on this page.
 * @property {() => void} dispose - Neutralise the consumer (a consumer cannot be removed).
 */

/**
 * Public surface returned by the installPrompt factory.
 * @typedef {object} InstallPromptAPI
 * @property {(opts?: InstallOptions) => InstallOffer} install - Defer the browser's install offer.
 * @property {(opts: LaunchQueueOptions) => LaunchQueueConsumer} launchQueue - Consume the File Handling launch queue.
 */

export const installPrompt = {
    name: 'installPrompt',
    version: '1.0.0',
    type: 'fw.dom.sw',
    dependencies: [],

    /**
     * @returns {InstallPromptAPI}
     */
    factory() {
        /**
         * Defer the `beforeinstallprompt` offer until the page prompts it.
         * @param {InstallOptions} [opts]
         * @returns {InstallOffer}
         * @throws {TypeError} When `win` is not an EventTarget.
         */
        function install({ win = globalThis, onAvailable, onInstalled } = {}) {
            if (!win || typeof win.addEventListener !== 'function') {
                throw new TypeError('installPrompt.install: win must be an EventTarget');
            }
            /** @type {any} */
            let deferred = null;

            /** @param {Event} e */
            function onBeforeInstall(e) {
                e.preventDefault();
                deferred = e;
                onAvailable?.();
            }
            function onAppInstalled() {
                deferred = null;
                onInstalled?.();
            }
            win.addEventListener('beforeinstallprompt', onBeforeInstall);
            win.addEventListener('appinstalled', onAppInstalled);

            return {
                available: () => deferred !== null,
                async prompt() {
                    if (deferred === null) return 'unavailable';
                    const e = deferred;
                    deferred = null;
                    try {
                        await e.prompt();
                        if (!e.userChoice) return 'dismissed';
                        const c = await e.userChoice;
                        return c && c.outcome === 'accepted' ? 'accepted' : 'dismissed';
                    } catch {
                        return 'dismissed';
                    }
                },
                dispose() {
                    win.removeEventListener('beforeinstallprompt', onBeforeInstall);
                    win.removeEventListener('appinstalled', onAppInstalled);
                    deferred = null;
                },
            };
        }

        /**
         * Hand the files an installed app was launched with to `onFiles`.
         * @param {LaunchQueueOptions} opts
         * @returns {LaunchQueueConsumer}
         * @throws {TypeError} When `onFiles` is not a function.
         */
        function launchQueue({ win = globalThis, onFiles } = /** @type {any} */ ({})) {
            if (typeof onFiles !== 'function') {
                throw new TypeError('installPrompt.launchQueue: onFiles must be a function');
            }
            const queue = /** @type {any} */ (win)?.launchQueue;
            const supported = !!queue && typeof queue.setConsumer === 'function';
            if (!supported) return { supported: false, dispose() {} };

            queue.setConsumer((params) => {
                const handles = params && params.files ? [...params.files] : [];
                if (handles.length) onFiles(handles);
            });
            return {
                supported: true,
                dispose() { queue.setConsumer(() => {}); },
            };
        }

        return { install, launchQueue };
    },
};
