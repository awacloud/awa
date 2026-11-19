// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// An installable, offline-capable page: a service worker caches the app and
// IndexedDB counts the visits.
import fw from '@awacloud/fw';
import modules from '@awacloud/fw/core/modules.js';

fw.runtime.registerAll(modules);
const serviceWorker = fw.runtime.resolve('serviceWorker');
const idb = fw.runtime.resolve('indexedDB');

const status = document.getElementById('sw');
const visits = document.getElementById('visits');

// The worker URL and its scope come from this module's own location: the
// page works from any directory.
const swUrl = new URL('./sw.js', import.meta.url);
const scope = new URL('./', import.meta.url).pathname;

async function startServiceWorker() {
    if (!serviceWorker.isSupported()) {
        status.textContent = 'not supported in this browser';
        return;
    }
    try {
        const reg = await serviceWorker.register(swUrl.href, { scope, type: 'module' });
        await navigator.serviceWorker.ready;
        status.textContent = `registered for ${reg.scope} — reload offline to see the cache at work`;
    } catch (e) {
        status.textContent = `registration failed: ${e.message}`;
    }
}

async function countVisit() {
    const db = await idb.open('fw-pwa-usecase', 1, (database, oldVersion) => {
        if (oldVersion < 1) database.createObjectStore('stats');
    });
    const stats = db.store('stats');
    const n = ((await stats.get('visits')) || 0) + 1;
    await stats.set('visits', n);
    visits.textContent = String(n);
}

startServiceWorker();
countVisit().catch((e) => { visits.textContent = `IndexedDB unavailable: ${e.message}`; });
