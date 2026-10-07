// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Extension walker for `odp` — thin wrapper over the shared
 * `odfWalker` factory, parameterised with the odp-specific node types
 * (slide / paragraph / span / frame) and root field (`slides`).
 *
 * One walker instance is created per `odp.factory(...)` invocation.
 *
 * @module odf/odp/odpWalker
 */

import { odfWalker } from '../_shared/walker.js';

export const odpWalker = {
    name: 'odpWalker',
    dependencies: ['odfWalker'],
    deps: [odfWalker],

    factory(shared) {
        const CONFIG = {
            rootField: 'slides',
            recurseFields: ['frames', 'children', 'spans', 'body'],
            typeHooks: {
                slide:     'Slide',
                paragraph: 'Paragraph',
                span:      'Span',
                frame:     'Frame'
            }
        };

        function createWalker() { return shared.createWalker(CONFIG); }
        return { createWalker };
    }
};
