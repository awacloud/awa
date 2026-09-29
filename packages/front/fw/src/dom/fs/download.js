// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview File download helpers using the HTML anchor element and the
 * Blob / Object URL APIs.
 *
 * All methods trigger a browser "Save file" prompt (or auto-save to the
 * Downloads folder) without navigating away from the current page.
 * Requires a browser environment with `document` and `URL.createObjectURL`.
 *
 * ## API
 *
 * | Method | Description |
 * |---|---|
 * | `url(href, name)` | Download from an existing `data:` or `blob:` URL |
 * | `blob(blob, name)` | Download a `Blob` (Object URL created and revoked automatically) |
 * | `bytes(data, name, type?)` | Download a `Uint8Array` |
 * | `text(content, name, type?)` | Download a plain string |
 *
 */

/**
 * Object returned by `download.factory()`. All methods trigger a browser
 * download synchronously and return `void`.
 *
 * @typedef {Object} DownloadAPI
 * @property {(href: string, name: string) => void} url Download from an existing `data:`/`blob:` URL.
 * @property {(blob: Blob, name: string) => void} blob Download a `Blob` (Object URL created and revoked automatically).
 * @property {(data: Uint8Array, name: string, type?: string) => void} bytes Download a `Uint8Array`.
 * @property {(content: string, name: string, type?: string) => void} text Download a plain string.
 */

export const download = {
    name: 'download',
    version: '1.0.0',
    type: 'fw.dom.fs',
    dependencies: [],

    /** @returns {DownloadAPI} */
    factory() {

        /**
         * Create a temporary `<a>` element, set its `href` / `download` attributes,
         * append it to the document body, click it, and remove it.
         * When `revoke` is `true` the Object URL is revoked immediately after the
         * click (the browser retains the underlying data until the download is done).
         *
         * @param {string}  href
         * @param {string}  name   - suggested filename
         * @param {boolean} revoke - revoke `href` as an Object URL after click
         */
        function _trigger(href, name, revoke) {
            const a = document.createElement('a');
            a.href = href;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (revoke) URL.revokeObjectURL(href);
        }

        return {

            /**
             * Trigger a download from an existing `data:` or `blob:` URL.
             *
             * When `href` is an Object URL created with `URL.createObjectURL`,
             * the caller is responsible for revoking it. Use `blob()` instead
             * to have revocation handled automatically.
             *
             * @param {string} href - `data:` or `blob:` URL to download.
             * @param {string} name - Suggested filename.
             */
            url(href, name) {
                _trigger(href, name, false);
            },

            /**
             * Trigger a download for a `Blob` object.
             *
             * Creates a temporary Object URL, triggers the download, then revokes
             * the URL so the browser can free the memory once the download finishes.
             *
             * @param {Blob}   blob
             * @param {string} name - Suggested filename.
             */
            blob(blob, name) {
                _trigger(URL.createObjectURL(blob), name, true);
            },

            /**
             * Trigger a download for a `Uint8Array` (or any `ArrayBuffer`-backed
             * typed array).
             *
             * @param {Uint8Array} data
             * @param {string}     name - Suggested filename.
             * @param {string}     [type='application/octet-stream'] - MIME type.
             */
            bytes(data, name, type = 'application/octet-stream') {
                // @ts-ignore - Uint8Array<ArrayBufferLike> is valid BlobPart; TS strict SharedArrayBuffer check is overly conservative
                this.blob(new Blob([data], { type }), name);
            },

            /**
             * Trigger a download for a plain string.
             *
             * @param {string} content
             * @param {string} name   - Suggested filename.
             * @param {string} [type='text/plain;charset=utf-8'] - MIME type.
             */
            text(content, name, type = 'text/plain;charset=utf-8') {
                this.blob(new Blob([content], { type }), name);
            }
        };
    }
};
