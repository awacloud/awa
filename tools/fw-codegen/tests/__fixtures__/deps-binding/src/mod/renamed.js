// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — the `md.js` shape: the framework module NAME (`renamed`)
// differs from the exported JS BINDING (`renamedMod`). A generator that
// assumes the two are the same writes `import { renamed } from './renamed.js'`
// — an export that does not exist.
export const renamedMod = {
    name: 'renamed',
    version: '1.0.0',
    dependencies: [],
    factory() {
        // A function-scoped `renamed` on purpose: it is NOT a top-level
        // binding and must not be mistaken for one.
        const renamed = { r: 1 };
        return renamed;
    },
};
