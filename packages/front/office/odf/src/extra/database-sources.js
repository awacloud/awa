// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Opt-in extra : typed passthrough coverage of the
 * complete `db:*` namespace (~50 elements). Each element becomes
 * `{ type: 'db-node', kind, attrs, children?, _passthrough: true }`
 * so the full ODF database subtree survives a roundtrip.
 *
 * Implemented as a thin shell over `odfTypedHelper` with the
 * `passthrough: true` flag, eliminating the previously hand-rolled
 * parse/render loop.
 *
 * @module odf/extra/database-sources
 */


import { odfTypedHelper } from './_typed-helper.js';

export const databaseSources = {
    name: 'databaseSources',
    dependencies: ['odfTypedHelper'],
    deps: [odfTypedHelper],

    factory(typedHelper) {
        const ELEMENTS = new Set([
            'db:data-source', 'db:data-source-settings', 'db:data-source-setting',
            'db:data-source-setting-value', 'db:data-source-setting-values',
            'db:driver-settings', 'db:auto-increment', 'db:character-set',
            'db:delimiter', 'db:delimiters', 'db:login', 'db:application-connection-settings',
            'db:table-settings', 'db:table-setting', 'db:table-include-list',
            'db:table-exclude-list', 'db:table-filter-pattern', 'db:table-filter',
            'db:table-type-filter', 'db:table-type', 'db:connection-data',
            'db:database-description', 'db:server-database', 'db:file-based-database',
            'db:connection-resource', 'db:component-collection', 'db:component',
            'db:queries', 'db:query', 'db:query-collection',
            'db:column-definitions', 'db:column-definition', 'db:columns', 'db:column',
            'db:filter-statement', 'db:order-statement',
            'db:update-table', 'db:forms', 'db:reports', 'db:report',
            'db:schema-definition', 'db:table-definitions', 'db:table-definition',
            'db:keys', 'db:key', 'db:key-column', 'db:key-columns',
            'db:indices', 'db:index', 'db:index-column', 'db:index-columns',
            'db:positive-integer'
        ]);

        const h = typedHelper.buildTypedFamily(
            ELEMENTS, 'db:', 'db-node', { passthrough: true });

        // Aliases kept for backward compatibility with callers that
        // referenced the historical names directly.
        return {
            parseElement: h.parseElement,
            renderElement: h.renderElement,
            parseDb: h.parseElement,
            renderDb: h.renderElement,
            isDb: h.isCovered,
            ELEMENTS,
            _passthrough: true
        };
    }
};
