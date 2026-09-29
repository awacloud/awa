// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture helper — NOT an fw module. Carries both a default export and a named
// one so `nsimport.js` can use the `import def, * as ns from '…'` form.
const base = { b: 1 };

export function extra() {
    return 'x';
}

export default base;
