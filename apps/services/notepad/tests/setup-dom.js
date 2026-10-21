// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Happy-DOM registration. Import this FIRST (before any `@awacloud/fw`
 * import) in DOM-touching notepad tests so `window`/`document` exist before
 * those modules evaluate — mirrors `apps/services/viewer/tests/setup-dom.js`.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

try {
    GlobalRegistrator.register();
} catch {
    /* already registered in this process */
}
