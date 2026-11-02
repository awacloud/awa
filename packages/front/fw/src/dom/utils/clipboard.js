// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Clipboard and Web Share API factory.
 *
 * Wraps the modern Clipboard API (`navigator.clipboard`) and the
 * Web Share API (`navigator.share`). Availability is checked **once at factory
 * initialisation** - no per-call overhead. Callers should inspect `isSupported()`
 * before invoking `set`, `setRich`, `get`, or `share`.
 *
 * Both APIs require a secure context (HTTPS or localhost). Clipboard reads
 * additionally require explicit `clipboard-read` user permission.
 *
 * ## API
 *
 * | Method | Returns |
 * |---|---|
 * | `isSupported()` | `{ read, write, richWrite, share }` (booleans) - capability flags |
 * | `set(text)` | Copy text to clipboard → `Promise<void>` (browser API) |
 * | `setRich({ html, text })` | Copy one `text/html` + `text/plain` item → `Promise<void>` |
 * | `get()` | Read text from clipboard → `Promise<string>` (browser API) |
 * | `share(opts)` | Invoke the native share sheet → `Promise<void>` (browser API) |
 *
 */

/**
 * Public surface returned by `clipboard.factory()`.
 * @typedef {object} ClipboardAPI
 * @property {() => { read: boolean, write: boolean, richWrite: boolean, share: boolean }} isSupported
 *   Capability flags computed once at factory initialisation.
 * @property {(text: string) => Promise<void>} set
 *   Write `text` to the system clipboard.
 * @property {(content: { html: string | Promise<string>, text: string | Promise<string> }) => Promise<void>} setRich
 *   Write one clipboard item carrying `text/html` and `text/plain`.
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
        const _Item     = typeof globalThis.ClipboardItem === 'function' ? globalThis.ClipboardItem : null;
        const _canRich  = !!(_clip && typeof _clip.write === 'function' && _Item);

        /**
         * @param {string | Promise<string>} value
         * @param {string} type
         * @returns {Promise<Blob>}
         */
        const _blob = (value, type) => Promise.resolve(value).then((s) => new Blob([s], { type }));

        return {

            /**
             * Return the capability flags computed at factory initialisation.
             * All checks require a secure context (HTTPS / localhost).
             *
             * @returns {{ read: boolean, write: boolean, richWrite: boolean, share: boolean }}
             */
            isSupported() {
                return {
                    read:_canRead,
                    write:_canWrite,
                    richWrite:_canRich,
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
             * Write ONE clipboard item carrying a `text/html` and a
             * `text/plain` flavour, so a paste into a word processor keeps
             * the formatting and a plain-text target still gets text.
             * Check `isSupported().richWrite` before calling; there is no
             * implicit fallback - a caller without rich write uses `set(text)`.
             *
             * `html` and `text` may each be a string or a `Promise<string>`.
             * The item is built and `navigator.clipboard.write` is called
             * **synchronously**, inside the caller's user gesture, with the
             * values still pending: WebKit refuses a write whose item is
             * created after an `await`, so a slow conversion started in a
             * click handler is passed as a promise, never awaited first.
             *
             * The HTML is written as given: this module does not sanitize it.
             * It is the caller's, sanitized before it reaches the clipboard.
             *
             * Rejects when rich write is unsupported (message starting
             * `clipboard: rich write unsupported`), when either value
             * rejects, or when the browser refuses the write.
             *
             * @param {{ html: string | Promise<string>, text: string | Promise<string> }} content
             * @returns {Promise<void>}
             */
            setRich({ html, text }) {
                if (!_canRich) {
                    return Promise.reject(new Error(
                        'clipboard: rich write unsupported (navigator.clipboard.write or ClipboardItem missing)'));
                }
                const htmlBlob = _blob(html, 'text/html');
                const textBlob = _blob(text, 'text/plain');
                const written  = _clip.write([new _Item({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
                // Settle on the values too: a rejected value rejects the
                // call whatever the browser does with the pending item.
                return Promise.all([htmlBlob, textBlob, written]).then(() => undefined);
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
