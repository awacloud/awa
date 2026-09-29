// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — descriptor-local fw import under an ALIAS. The injected
// `deps` entry must be the in-scope binding (`urlMod`), not the dep name.
import { url as urlMod } from '@awacloud/fw/io/codec/url.js';

export const aliasedLocal = {
    name: 'aliasedLocal',
    version: '1.0.0',
    dependencies: ['url'],
    factory(u) {
        return { u };
    },
};
