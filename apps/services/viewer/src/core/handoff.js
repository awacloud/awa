// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Several files, one window each (one window per file, by design).
 *
 * The system opens an installed app once per file (`launch_type:
 * multiple-clients` in the manifest). Files chosen or dropped together
 * INSIDE the app arrive in one window: the first opens there, the others
 * wait, and each "Open the next one" click opens one in a new window of the
 * app. A page cannot pass a File to a window it opens (fw sanity `base`
 * blocks `window.open`, and a plain link carries no data), so the file goes
 * through IndexedDB: `give` stores it under a random token, the link opens
 * `./?open=<token>`, the new window `take`s it (and deletes it). One window
 * per click: browsers allow one new window per user gesture.
 *
 * Files and file handles are both structured-cloneable, so a handle passed
 * this way still saves back to its file (notepad). Entries older than
 * `TTL_MS` are swept, so an unopened link leaves nothing behind for long.
 *
 * Storage is injected (`store`: the fw `indexedDB` accessor's shape); the
 * page passes an IndexedDB store, the tests a map.
 *
 * @module viewer/core/handoff
 */

/** A handed file not taken within this time is dropped. */
export const TTL_MS = 10 * 60 * 1000;

/** The URL parameter that names a handed file. */
export const PARAM = 'open';

/**
 * @typedef {{file?: File|Blob, handle?: FileSystemFileHandle|null, name?: string}} Item
 * @typedef {{get: (k: string) => Promise<any>, set: (k: string, v: any) => Promise<any>,
 *   del: (k: string) => Promise<void>, getAllKeys: () => Promise<string[]>}} Store
 */

/** @param {{store: Store, now?: () => number}} opts */
export function createHandoff({ store, now = Date.now }) {
    async function sweep() {
        for (const key of await store.getAllKeys()) {
            const entry = await store.get(key);
            if (!entry || now() - entry.at > TTL_MS) await store.del(key);
        }
    }
    return {
        /**
         * Keep a file for the window about to open; its token.
         * @param {Item} item
         * @returns {Promise<string>}
         */
        async give(item) {
            const words = globalThis.crypto.getRandomValues(new Uint32Array(4));
            const token = [...words].map((w) => w.toString(36)).join('');
            await store.set(token, { at: now(), file: item.file || null, handle: item.handle || null });
            return token;
        },
        /**
         * Take the file handed under `token` (once); `null` when there is none.
         * @param {string|null} token
         * @returns {Promise<Item|null>}
         */
        async take(token) {
            if (!token || !/^[0-9a-z]{4,64}$/.test(token)) return null;
            const entry = await store.get(token);
            await store.del(token);
            void sweep().catch(() => {});
            if (!entry || now() - entry.at > TTL_MS) return null;
            return { file: entry.file || undefined, handle: entry.handle || null };
        },
        /**
         * The address of a window that opens the handed file.
         * @param {string} token
         * @param {string} base The page's own address.
         */
        url(token, base) {
            const u = new URL('./', base);
            u.searchParams.set(PARAM, token);
            return u.href;
        }
    };
}
