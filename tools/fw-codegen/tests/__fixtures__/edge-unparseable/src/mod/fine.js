// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture module — the parseable NEAREST NEIGHBOUR of `broken.js`: same shape,
// but `dependencies` holds string literals only. Its presence is what makes the
// "one file is unparseable" assertions non-vacuous — the scan still yields a
// real module catalog alongside the rejected file.
export const fine = {
    name: 'fine',
    version: '1.0.0',
    dependencies: [],
    factory() {
        return { fine: true };
    },
};
