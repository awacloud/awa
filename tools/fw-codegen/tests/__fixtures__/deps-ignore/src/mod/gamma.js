// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — real module missing its `deps` companion. Must be planned
// even though a generated prebuilt bundle in the same tree is unresolvable.
export const gamma = {
    name: 'gamma',
    version: '1.0.0',
    dependencies: ['alpha'],
    factory(alpha) {
        return { g: 3, base: alpha };
    },
};
