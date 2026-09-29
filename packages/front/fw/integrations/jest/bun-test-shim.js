// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/jest/bun-test-shim.js
/**
 * @fileoverview Drop-in replacement for the `bun:test` module under Jest.
 *
 * The suite imports only `describe, test, expect, beforeEach, afterEach,
 * beforeAll, afterAll` from `bun:test` — all present in `@jest/globals`.
 * Aliasing `bun:test` → this shim (via `moduleNameMapper`) lets the suite run
 * under Jest WITHOUT touching a test file.
 *
 * API gaps vs bun:test :
 *   - `done` callback : Jest supports it natively → no adaptation needed
 *     (unlike Vitest 4, which removed it).
 *   - `test.if(cond)` : a bun-only conditional modifier. Jest has no `runIf`,
 *     so we bridge `test.if(cond)` → `cond ? test : test.skip`.
 *
 * @see ./jest.config.mjs   wires the `moduleNameMapper` alias
 */

import {
    describe,
    test as _jestTest,
    expect,
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
} from '@jest/globals';

// Bridge `test.if(cond)` (bun) → conditional skip (Jest). Everything else
// (`each`, `skip`, `only`, `concurrent`, `failing`, direct call with `done`)
// passes straight through to Jest's native `test`.
const test = new Proxy(_jestTest, {
    get(target, prop, receiver) {
        if (prop === 'if') return (cond) => (cond ? target : target.skip);
        return Reflect.get(target, prop, receiver);
    },
});

export { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll };
