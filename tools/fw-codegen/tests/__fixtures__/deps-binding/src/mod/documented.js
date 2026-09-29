// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Fixture module — the `wml-run-formatting.js` shape: a JSDoc header whose
 * usage example contains an ALIASED import of the very dependency the
 * descriptor declares.
 *
 * Usage:
 *   import { htmlEntities as entitiesMod } from '@awacloud/fw/io/text/html-entities.js';
 *   const entities = entitiesMod.factory();
 *
 * A parser reading raw text treats that example as an in-scope binding and
 * emits `deps: [entitiesMod]` with no import at all. The real resolution must
 * come from the entry's `fw_require` guard instead.
 */
export const documented = {
    name: 'documented',
    version: '1.0.0',
    dependencies: ['htmlEntities'],
    factory(htmlEntities) {
        return { d: 4, base: htmlEntities };
    },
};
