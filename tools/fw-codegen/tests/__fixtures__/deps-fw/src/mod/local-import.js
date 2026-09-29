// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — already imports its fw dependency itself, from a DIFFERENT
// specifier than the package entry's. The descriptor-local import must win and
// no new import may be added.
import { url } from '@awacloud/fw/io/codec/url-alt.js';

export const localImport = {
    name: 'localImport',
    version: '1.0.0',
    dependencies: ['url'],
    factory(url) {
        return { u: url };
    },
};
