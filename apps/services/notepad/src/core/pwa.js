// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The standalone page's PWA adapter over `@awacloud/fw`:
 * `installPrompt` (the install button, shown only when the browser offers
 * installation and hidden again once installed — no nag; the File Handling
 * launch queue — an installed notepad opens the files the system hands it,
 * with their handle, so Save writes back to the same file) and `swUpdate`
 * (service worker registration, the offline note, and the update flow).
 *
 * Updates (`public/sw.js`, fw `precache`): a new release installs beside the
 * running one and waits. The page is told once (`onUpdateReady`), checks on
 * demand (`checkForUpdates`, the About panel's button) and, when the user
 * accepts, lets the waiting release take over and reloads (`applyUpdate`) —
 * never on its own. `version()` asks the active worker which release it
 * serves. Same shape as `apps/services/viewer/src/core/pwa.js`.
 *
 * @module notepad/core/pwa
 */

/** The messages the worker understands (`public/sw.js`). */
export const SW_MESSAGES = Object.freeze({ skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' });

/**
 * @typedef {import('@awacloud/fw/dom/sw/swUpdate.js').SwUpdateController} PwaController
 *   The update controller: `state`, `updateReady`, `checkForUpdates`,
 *   `applyUpdate`, `version` (the members the About panel reads).
 */

/**
 * @param {{installPrompt: {install: Function, launchQueue: Function},
 *   swUpdate: {create: Function}, swUrl: string,
 *   installButton: HTMLButtonElement|null, offlineNote: HTMLElement|null,
 *   onFile: (file: File, handle: FileSystemFileHandle) => void,
 *   onMore?: (handles: FileSystemFileHandle[]) => void, onUpdateReady?: () => void,
 *   win?: Window & typeof globalThis}} opts
 * @returns {Promise<PwaController>}
 */
export async function mountPwa({ installPrompt, swUpdate, swUrl, installButton, offlineNote, onFile, onMore, onUpdateReady, win = window }) {
    const offer = installPrompt.install({
        win,
        onAvailable: () => { if (installButton) installButton.hidden = false; },
        onInstalled: () => { if (installButton) installButton.hidden = true; }
    });
    if (installButton) {
        installButton.addEventListener('click', async () => {
            installButton.hidden = true;
            await offer.prompt();
        });
    }

    // File Handling API: files opened with the installed app. One file per
    // launch (`multiple-clients`); several, if a browser sends them together:
    // the first here, the others to `onMore`. The handle travels with the file.
    installPrompt.launchQueue({
        win,
        onFiles: async (/** @type {FileSystemFileHandle[]} */ handles) => {
            const [h, ...rest] = handles;
            if (rest.length && onMore) onMore(rest);
            if (h) onFile(await h.getFile(), h);
        }
    });

    return swUpdate.create({
        swUrl, win, onUpdateReady, messages: SW_MESSAGES,
        onControlled: () => { if (offlineNote) offlineNote.hidden = false; }
    });
}
