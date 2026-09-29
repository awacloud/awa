// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Clipboard and Web Share API factory.
 *
 * Wraps the modern Clipboard API (`navigator.clipboard`) and the
 * Web Share API (`navigator.share`). Availability is checked **once at factory
 * initialisation** - no per-call overhead. Callers should inspect `isSupported()`
 * before invoking `set`, `get`, or `share`.
 *
 * Both APIs require a secure context (HTTPS or localhost). Clipboard reads
 * additionally require explicit `clipboard-read` user permission.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `isSupported()` | `{ read: boolean, write: boolean, share: boolean }` - capability flags |
 * | `set(text)` | Copy text to clipboard → `Promise<void>` (browser API) |
 * | `get()` | Read text from clipboard → `Promise<string>` (browser API) |
 * | `share(opts)` | Invoke the native share sheet → `Promise<void>` (browser API) |
 *
 */

/**
 * Public surface returned by `clipboard.factory()`.
 * @typedef {object} ClipboardAPI
 * @property {() => { read: boolean, write: boolean, share: boolean }} isSupported
 *   Capability flags computed once at factory initialisation.
 * @property {(text: string) => Promise<void>} set
 *   Write `text` to the system clipboard.
 * @property {() => Promise<string>} get
 *   Read text from the system clipboard.
 * @property {(opts?: { url?: string, title?: string, text?: string, files?: File[] }) => Promise<void>} share
 *   Invoke the native Web Share sheet.
 */

export const clipboard = {
    name: 'clipboard',
    version: '1.0.0',
    type: 'fw.dom.utils',
    dependencies: [],

    /** @returns {ClipboardAPI} */
    factory() {

        const _nav  = typeof navigator !== 'undefined' ? navigator : null;
        const _clip = _nav?.clipboard ?? null;

        // One-time availability checks at factory init - no per-call overhead
        const _canWrite = !!(_clip && typeof _clip.writeText === 'function');
        const _canRead  = !!(_clip && typeof _clip.readText  === 'function');
        const _canShare = !!(_nav  && typeof _nav.share      === 'function');

        return {

            /**
             * Return the capability flags computed at factory initialisation.
             * All three checks require a secure context (HTTPS / localhost).
             *
             * @returns {{ read: boolean, write: boolean, share: boolean }}
             */
            isSupported() {
                return {
                    read:_canRead,
                    write:_canWrite,
                    share:_canShare
                };
            },

            /**
             * Write `text` to the system clipboard.
             * Check `isSupported()` before calling.
             *
             * The returned Promise comes directly from the browser's
             * `navigator.clipboard.writeText` - no additional wrapping is added.
             *
             * @param {string} text
             * @returns {Promise<void>}
             */
            set(text) {
                return _clip.writeText(text);
            },

            /**
             * Read text from the system clipboard.
             * Check `isSupported()` before calling. Requires the `clipboard-read`
             * permission to be granted.
             *
             * @returns {Promise<string>}
             */
            get() {
                return _clip.readText();
            },

            /**
             * Invoke the native Web Share sheet.
             * Check `isSupported().share` before calling.
             *
             * At least one of `url`, `text`, or `title` must be present.
             * File sharing (`files` key) is supported on platforms that implement it.
             *
             * @param {object} [opts] - `{ url?, title?, text?, files?: File[] }`
             * @returns {Promise<void>}
             */
            share(opts = {}) {
                return _nav.share(opts);
            }
        };
    }
};
