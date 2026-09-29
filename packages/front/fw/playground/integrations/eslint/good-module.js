// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// good-module.js
//
// The corrected version: the factory is self-contained — every binding it
// references is declared inside the factory (or is an ambient global / param).
// `factory.toString()` therefore serializes cleanly into a Worker.
// Expect: passes lint.

export default {
    name: 'counter',
    dependencies: [],
    factory() {
        const MULTIPLIER = 2; // declared INSIDE the factory — not captured
        let count = 0;
        return {
            inc() {
                count += MULTIPLIER;
                return count;
            },
        };
    },
};
