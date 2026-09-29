// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// bad-module.js
//
// A fw-style module descriptor whose `factory()` CAPTURES a module-scope const.
// `runtime.serialize()` ships `factory.toString()` into a Worker, where the
// outer scope does not exist — so this capture breaks worker bootstrap.
// Expect: `fw/no-factory-capture` errors on the reference to `MULTIPLIER`.

const MULTIPLIER = 2; // module-scope binding

export default {
    name: 'counter',
    dependencies: [],
    factory() {
        let count = 0;
        return {
            inc() {
                count += MULTIPLIER; // ← captures module-scope `MULTIPLIER`
                return count;
            },
        };
    },
};
