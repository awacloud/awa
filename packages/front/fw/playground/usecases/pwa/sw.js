// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The service worker (a module worker). A worker gets no import map, so it
// imports fw's sources by relative path; a published app imports
// '@awacloud/fw/dom/sw/precache.js' through its bundler instead.
import { cache } from '../../../src/dom/sw/cache.js';
import { precache } from '../../../src/dom/sw/precache.js';

// Every URL is relative to this file, so the use case works wherever it is
// served. The fw sources the page imports are cached with it.
precache.factory(cache.factory()).create({
    scope: self,
    prefix: 'fw-pwa-usecase-',
    version: 'v1',
    urls: [
        './',
        './index.html',
        './app.js',
        './manifest.webmanifest',
        './icon.svg',
        '../usecases.css',
    ],
    strategy: () => 'network-first',
}).listen();
