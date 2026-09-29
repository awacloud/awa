// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — exercises `topLevelBindings`' NAMESPACE-import arm, the A3
// emit-guard oracle (tools/fw-codegen/src/deps/index.js:383-387):
//
//   `import * as helpers from …`        → namespace only      (m[1] undefined)
//   `import base, * as extras from …`   → default + namespace (m[1] captured)
//
// `alpha` is ALREADY imported here, so the rewrite adds zero imports and the
// A3 phantom check clears it through `bound`, not through `addedBindings`.
import * as helpers from './helpers.js';
import base, * as extras from './base.js';
import { alpha } from './alpha.js';

export const nsimport = {
    name: 'nsimport',
    version: '1.0.0',
    dependencies: ['alpha'],
    factory(alpha) {
        return { alpha, helpers, extras, base };
    },
};
