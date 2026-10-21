// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Standalone entry: harden the realm, then boot the page once
 * the DOM is ready. The only module (with `sanity.js`) with a side effect at
 * import; `app.js` holds `boot()`.
 *
 * @module notepad/main
 */
import { sanity } from './sanity.js';   // FIRST — hardens the realm before any other module evaluates
import fw from '@awacloud/fw';
import { boot } from './app.js';

fw.domReady.loaded(() => {
    const notepad = boot();
    notepad.element.dataset.sanity = sanity.applied ? 'base' : `off:${sanity.reason || 'unknown'}`;
});
