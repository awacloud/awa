// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The sibling binding comes from an `@awacloud/fw/...` import: the fw specifier
// must be emitted verbatim, never rewritten into a sibling subpath.
export const usesFwViaSibling = {
    name: 'usesFwViaSibling',
    dependencies: ['sharedFw'],
    factory(sharedFw) { return { f: sharedFw }; },
};
