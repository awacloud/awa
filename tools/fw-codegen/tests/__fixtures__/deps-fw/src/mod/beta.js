// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — cites an fw module name resolvable ONLY through the
// package entry's `fw_require` + `@awacloud/fw` import map.
export const beta = {
    name: 'beta',
    version: '1.0.0',
    dependencies: ['htmlEntities'],
    factory(htmlEntities) {
        return { b: htmlEntities };
    },
};
