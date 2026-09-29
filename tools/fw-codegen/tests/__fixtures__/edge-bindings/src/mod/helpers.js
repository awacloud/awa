// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture helper — NOT an fw module (no `export const X = { … factory … }`),
// so `parseFile` returns null for it and the scan skips it. It exists only so
// `nsimport.js`'s `import * as helpers from './helpers.js'` names a real file.
export function helper() {
    return 'h';
}
