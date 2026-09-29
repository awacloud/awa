// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — depends on `renamed` (name ≠ binding) BUT already declares
// a top-level `renamed` of its own. Aliasing the import to `renamed` would
// shadow it, so the module must be reported unresolved instead.
const renamed = 'something else entirely';

export const shadowed = {
    name: 'shadowed',
    version: '1.0.0',
    dependencies: ['renamed'],
    factory(dep) {
        return { s: renamed, base: dep };
    },
};
