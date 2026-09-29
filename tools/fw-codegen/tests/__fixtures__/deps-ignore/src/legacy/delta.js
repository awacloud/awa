// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — target of the custom `--ignore legacy/**` glob. Declares an
// unresolvable dependency, so it is only harmless while it stays ignored.
export const delta = {
    name: 'delta',
    version: '1.0.0',
    dependencies: ['ghostFromHost'],
    factory(ghostFromHost) {
        return { d: ghostFromHost };
    },
};
