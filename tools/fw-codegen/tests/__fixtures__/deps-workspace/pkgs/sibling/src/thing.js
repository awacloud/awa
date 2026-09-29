// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Publicly exported by the sibling as `./thing`.
export const siblingThing = {
    name: 'siblingThing',
    dependencies: [],
    factory() { return { t: 1 }; },
};
