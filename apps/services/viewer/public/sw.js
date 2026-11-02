// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The viewer's service worker (module worker): offline once
 * visited, same origin, GET only, and updates that never break a running
 * page. A fw `precache` release cache: `tools/build-sw.js` stamps the worker
 * with the dist's content version and the list of every file the app needs
 * (the page, the bundle, the sheets, the icons and the licence texts, so the
 * About panel opens them offline); install pre-caches it into a cache named
 * after the version, the versioned shell is served cache-first (online or
 * offline, one release), and a new release waits until the page accepts it
 * (`awa-sw-skip-waiting`) — only then are the previous release's caches of
 * this app deleted. The very first install takes over at once; from the
 * sources (`dev`, nothing stamped) every request goes to the network first.
 *
 * Documents never pass through here: the viewer reads files from the
 * device, it never requests them.
 *
 * The imports are fw's worker-safe `cache` and `precache` descriptors; the
 * relative paths resolve against the repo layout in development, and
 * `tools/build-sw.js` bundles the worker into a dist.
 *
 * @module viewer/sw
 */
import { cache as cacheMod } from '../../../../packages/front/fw/src/dom/sw/cache.js';
import { precache as precacheMod } from '../../../../packages/front/fw/src/dom/sw/precache.js';

/* global __AWA_VIEWER_VERSION__, __AWA_VIEWER_PRECACHE__ */
/** The release: the dist's content hash (tools/build-sw.js), `dev` from the sources. */
const VERSION = typeof __AWA_VIEWER_VERSION__ === 'string' ? __AWA_VIEWER_VERSION__ : 'dev';
/** The app's files, relative to the worker (tools/build-sw.js); the page alone from the sources. */
const PRECACHE = typeof __AWA_VIEWER_PRECACHE__ === 'object' ? __AWA_VIEWER_PRECACHE__ : ['./'];

precacheMod.factory(cacheMod.factory()).create({
    scope: self,
    prefix: 'awa-viewer-',
    version: VERSION,
    urls: PRECACHE,
    messages: { skipWaiting: 'awa-sw-skip-waiting', version: 'awa-sw-version' },
    // From the sources (nothing stamped) every request goes to the network first.
    strategy: () => (VERSION === 'dev' ? 'network-first' : 'cache-first')
}).listen();
