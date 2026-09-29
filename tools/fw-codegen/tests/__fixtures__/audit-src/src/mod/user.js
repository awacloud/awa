// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — depends on lossyMod, so lossyMod's dependent count is 1.
import { lossyMod } from './lossy.js';

export const userMod = {
    name: 'userMod',
    version: '1.0.0',
    dependencies: ['lossyMod'],
    deps: [lossyMod],
    /**
     * @returns {SomeTypedef}
     */
    factory(lossyMod) {
        return { base: lossyMod };
    },
};
