// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `odt` — thin wrapper over the shared
 * `odfWalker` factory, parameterised with the odt-specific node types
 * (paragraph / span / heading / list / table / cell / frame) and root
 * field (`body`).
 *
 * One walker instance is created per `odt.factory(...)` invocation so
 * registered extensions are scoped per consumer.
 *
 * @module odf/odt/odtWalker
 */

import { odfWalker } from '../_shared/walker.js';

export const odtWalker = {
    name: 'odtWalker',
    dependencies: ['odfWalker'],
    deps: [odfWalker],

    factory(shared) {
        const CONFIG = {
            rootField: 'body',
            recurseFields: ['children', 'body', 'rows', 'cells', 'items', 'frames', 'spans'],
            typeHooks: {
                paragraph: 'Paragraph',
                span:      'Span',
                heading:   'Heading',
                list:      'List',
                table:     'Table',
                cell:      'Cell',
                frame:     'Frame'
            }
        };

        function createWalker() { return shared.createWalker(CONFIG); }
        return { createWalker };
    }
};
