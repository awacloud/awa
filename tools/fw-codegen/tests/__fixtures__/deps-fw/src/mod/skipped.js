// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — one resolvable dep and one name that exists nowhere. Must
// be skipped ENTIRELY (never a partial `deps: [alpha]`).
export const skipped = {
    name: 'skipped',
    version: '1.0.0',
    dependencies: ['alpha', 'ghostName'],
    factory(alpha, ghostName) {
        return { alpha, ghostName };
    },
};
