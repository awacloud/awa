// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The notepad's service worker (module worker): offline once
 * visited, same origin, GET only, and updates that never break a running
 * page. A script over fw's worker-safe `precache`.
 *
 * A build (`tools/build-sw.js`) stamps the worker with the dist's content
 * version and the list of every file the app needs — the page, the bundle,
 * the sheets, the icons, and the licence texts, so the About panel's
 * licences open offline too. Install PRE-CACHES that list into a cache
 * named after the version. The versioned shell is served CACHE-FIRST: the
 * page and its code always come from one release, online or offline.
 *
 * A new release installs into its own cache and then WAITS: it never takes
 * over a page running the previous release. When the user accepts, the page
 * asks this worker to take over (`awa-sw-skip-waiting`) and reloads; only
 * then does `activate` delete the previous release's cache — only caches of
 * this app (`awa-notepad-`), never the page's other storage. The very first
 * install takes over at once, so the first visit already works offline.
 * From the sources (`dev`, nothing stamped) every request goes to the
 * network first, so development always runs the code on disk.
 *
 * Text files never pass through here: the notepad reads and writes them
 * on the device, it never requests them. Before it accepts an update, the
 * page keeps the unsaved text as a draft (`app.js`).
 *
 * The imports are fw's worker-safe `cache` and `precache` descriptors; the
 * relative paths resolve against the repo layout in development, and
 * `tools/build-sw.js` bundles the worker into a dist.
 *
 * @module notepad/sw
 */
import { cache as cacheMod } from '../../../../packages/front/fw/src/dom/sw/cache.js';
import { precache as precacheMod } from '../../../../packages/front/fw/src/dom/sw/precache.js';

/* global __AWA_NOTEPAD_VERSION__, __AWA_NOTEPAD_PRECACHE__ */
/** The release: the dist's content hash (tools/build-sw.js), `dev` from the sources. */
const VERSION = typeof __AWA_NOTEPAD_VERSION__ === 'string' ? __AWA_NOTEPAD_VERSION__ : 'dev';
/** The app's files, relative to the worker (tools/build-sw.js); the page alone from the sources. */
const PRECACHE = typeof __AWA_NOTEPAD_PRECACHE__ === 'object' ? __AWA_NOTEPAD_PRECACHE__ : ['./'];

precacheMod.factory(cacheMod.factory()).create({
    scope: self, prefix: 'awa-notepad-', version: VERSION, urls: PRECACHE,
    messages: { skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' },
    // From the sources (nothing stamped) every request goes to the network first.
    strategy: () => (VERSION === 'dev' ? 'network-first' : 'cache-first')
}).listen();
