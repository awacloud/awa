// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — cites an fw name that IS imported by the package entry but
// is NOT listed in `fw_require`. The guard makes it unresolved.
export const guarded = {
    name: 'guarded',
    version: '1.0.0',
    dependencies: ['secPolicy'],
    factory(secPolicy) {
        return { p: secPolicy };
    },
};
