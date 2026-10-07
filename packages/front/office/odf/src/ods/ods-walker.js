// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `ods` — thin wrapper over the shared
 * `odfWalker` factory, parameterised with the ods-specific node types
 * (paragraph / span / table / cell / frame) and root field
 * (`spreadsheet`).
 *
 * One walker instance is created per `ods.factory(...)` invocation.
 *
 * @module odf/ods/odsWalker
 */

import { odfWalker } from '../_shared/walker.js';

export const odsWalker = {
    name: 'odsWalker',
    dependencies: ['odfWalker'],
    deps: [odfWalker],

    factory(shared) {
        const CONFIG = {
            rootField: 'spreadsheet',
            recurseFields: ['tables', 'rows', 'cells', 'children', 'frames', 'spans'],
            typeHooks: {
                paragraph: 'Paragraph',
                span:      'Span',
                table:     'Table',
                cell:      'Cell',
                frame:     'Frame'
            }
        };

        function createWalker() { return shared.createWalker(CONFIG); }
        return { createWalker };
    }
};
