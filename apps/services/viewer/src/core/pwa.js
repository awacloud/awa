// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's PWA adapter: the page-level wiring of
 * fw's `installPrompt` (the install button, shown only when the browser
 * offers installation and hidden again once installed — no nag; the File
 * Handling launch queue, so an installed viewer opens the files the system
 * hands it) and `swUpdate` (the service worker, its updates and its
 * release), with the offline note shown only once a worker controls the page.
 *
 * Updates (`public/sw.js`): a new release installs beside the running one
 * and waits; it is reported once (`onUpdateReady`), checked on demand (the
 * About panel's button) and, when the user accepts, takes over and the page
 * reloads (`applyUpdate`) — never on its own.
 *
 * @module viewer/core/pwa
 */

/** The messages the worker understands (`public/sw.js`). */
export const SW_MESSAGES = Object.freeze({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });

/** @typedef {import('@awacloud/fw/dom/sw/swUpdate.js').SwUpdateController} PwaController */

/**
 * @param {{installPrompt: any, swUpdate: any, swUrl: string,
 *   installButton: HTMLButtonElement|null, offlineNote: HTMLElement|null,
 *   onFile: (file: File) => void, onMore?: (handles: FileSystemFileHandle[]) => void,
 *   onUpdateReady?: () => void, win?: Window & typeof globalThis}} opts
 *   `installPrompt`, `swUpdate`: the resolved fw modules.
 * @returns {Promise<PwaController>} state, updateReady, checkForUpdates, applyUpdate, version.
 */
export async function mountPwa({ installPrompt, swUpdate, swUrl, installButton, offlineNote, onFile, onMore, onUpdateReady, win = window }) {
    const install = installPrompt.install({
        win,
        onAvailable: () => { if (installButton) installButton.hidden = false; },
        onInstalled: () => { if (installButton) installButton.hidden = true; }
    });
    if (installButton) {
        installButton.addEventListener('click', async () => {
            installButton.hidden = true;
            await install.prompt();
        });
    }

    // One file per launch (`multiple-clients`); several, if a browser sends
    // them together: the first here, the others to `onMore`.
    installPrompt.launchQueue({
        win,
        onFiles: async (/** @type {FileSystemFileHandle[]} */ handles) => {
            const [handle, ...rest] = handles;
            if (rest.length && onMore) onMore(rest);
            if (handle) onFile(await handle.getFile());
        }
    });

    return swUpdate.create({
        swUrl, win, onUpdateReady, messages: SW_MESSAGES,
        onControlled: () => { if (offlineNote) offlineNote.hidden = false; }
    });
}
