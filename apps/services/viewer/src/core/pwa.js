// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's PWA adapter: service worker
 * registration (fw `serviceWorker`), updates, the install button (shown
 * only when the browser offers installation, hidden again once installed —
 * no nag), the offline note (shown only once a worker controls the page)
 * and the File Handling launch queue (an installed viewer opens the files
 * the system hands it).
 *
 * Updates (`public/sw.js`): a new release installs beside the running one
 * and waits. The adapter reports it once (`onUpdateReady`), checks on
 * demand (`checkForUpdates`, the About panel's button) and, when the user
 * accepts, lets the waiting release take over and reloads the page
 * (`applyUpdate`) — never on its own. `version()` asks the active worker
 * which release it serves.
 *
 * fw has no install-prompt or `launchQueue` helper (the demos' recorded
 * gap); those two are read here, feature-detected, never assumed.
 *
 * @module viewer/core/pwa
 */

/** The messages the worker understands (`public/sw.js`). */
export const SW_MESSAGES = Object.freeze({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });

/** How long a check waits for a found release to finish installing. */
const INSTALL_WAIT = 30000;
/** How long `version()` waits for the worker's answer. */
const VERSION_WAIT = 2000;

/**
 * @typedef {'current'|'ready'|'offline'|'unavailable'} CheckResult
 *   `current`: no newer release; `ready`: one is installed and waits;
 *   `offline`: the check could not reach the server; `unavailable`: no
 *   service worker on this page.
 */

/**
 * @typedef {object} PwaController
 * @property {'registered'|'unsupported'|'failed'} state
 * @property {() => boolean} updateReady A newer release waits.
 * @property {() => Promise<CheckResult>} checkForUpdates
 * @property {() => boolean} applyUpdate Let the waiting release take over, then reload; `false` when none waits.
 * @property {() => Promise<string|null>} version The release the active worker serves, `null` when unknown.
 */

/**
 * Resolve once a worker leaves `installing` (or after `ms`).
 * @param {ServiceWorker} worker
 * @param {number} ms
 */
function settled(worker, ms) {
    return new Promise((resolve) => {
        if (worker.state !== 'installing') { resolve(undefined); return; }
        const timer = setTimeout(done, ms);
        function done() {
            clearTimeout(timer);
            worker.removeEventListener('statechange', onState);
            resolve(undefined);
        }
        function onState() { if (worker.state !== 'installing') done(); }
        worker.addEventListener('statechange', onState);
    });
}

/**
 * @param {{serviceWorker: {isSupported: () => boolean,
 *     register: (url: string, o?: object) => Promise<ServiceWorkerRegistration>}},
 *   swUrl: string, installButton: HTMLButtonElement|null, offlineNote: HTMLElement|null,
 *   onFile: (file: File) => void, onMore?: (handles: FileSystemFileHandle[]) => void,
 *   onUpdateReady?: () => void,
 *   win?: Window & typeof globalThis}} opts
 * @returns {Promise<PwaController>}
 */
export async function mountPwa({ serviceWorker, swUrl, installButton, offlineNote, onFile, onMore, onUpdateReady, win = window }) {
    /** @type {any} */
    let deferred = null;
    if (installButton) {
        win.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferred = e;
            installButton.hidden = false;
        });
        win.addEventListener('appinstalled', () => { deferred = null; installButton.hidden = true; });
        installButton.addEventListener('click', async () => {
            if (!deferred) return;
            const prompt = deferred;
            deferred = null;
            installButton.hidden = true;
            await prompt.prompt();
        });
    }

    // File Handling API: files opened with the installed app.
    const queue = /** @type {any} */ (win).launchQueue;
    if (queue && typeof queue.setConsumer === 'function') {
        queue.setConsumer(async (/** @type {{files?: FileSystemFileHandle[]}} */ params) => {
            // One file per launch (`multiple-clients`); several, if a browser
            // sends them together: the first here, the others to `onMore`.
            const [handle, ...rest] = params.files || [];
            if (rest.length && onMore) onMore(rest);
            if (handle) onFile(await handle.getFile());
        });
    }

    /** @type {PwaController} */
    const none = {
        state: 'unsupported',
        updateReady: () => false,
        checkForUpdates: async () => 'unavailable',
        applyUpdate: () => false,
        version: async () => null
    };
    if (!serviceWorker.isSupported()) return none;
    /** @type {ServiceWorkerRegistration} */
    let reg;
    try {
        // `updateViaCache: 'none'`: an update check always asks the server for the worker.
        reg = await serviceWorker.register(swUrl, { type: 'module', updateViaCache: 'none' });
    } catch {
        return { ...none, state: 'failed' };
    }
    const sw = win.navigator.serviceWorker;

    let reported = false;
    let accepted = false;
    /** Report a waiting release once — only to a page a worker already controls. */
    function report() {
        if (reported || !reg.waiting || !sw.controller) return;
        reported = true;
        if (onUpdateReady) onUpdateReady();
    }
    /** @param {ServiceWorker|null} worker */
    function watch(worker) {
        if (!worker) return;
        worker.addEventListener('statechange', () => { if (worker.state === 'installed') report(); });
    }
    reg.addEventListener('updatefound', () => watch(reg.installing));
    watch(reg.installing);
    report();

    const showOffline = () => { if (offlineNote && sw.controller) offlineNote.hidden = false; };
    showOffline();
    sw.addEventListener('controllerchange', () => {
        showOffline();
        // The release the user accepted took over: run it.
        if (accepted) win.location.reload();
    });

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
            if (reg.installing) await settled(reg.installing, INSTALL_WAIT);
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
            waiting.postMessage({ type: SW_MESSAGES.skipWaiting });
            return true;
        },
        version() {
            const active = sw.controller || reg.active;
            if (!active || typeof MessageChannel === 'undefined') return Promise.resolve(null);
            return new Promise((resolve) => {
                const channel = new MessageChannel();
                const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, VERSION_WAIT);
                channel.port1.onmessage = (e) => {
                    clearTimeout(timer);
                    channel.port1.close();
                    resolve(typeof e.data?.version === 'string' ? e.data.version : null);
                };
                active.postMessage({ type: SW_MESSAGES.version }, [channel.port2]);
            });
        }
    };
}
