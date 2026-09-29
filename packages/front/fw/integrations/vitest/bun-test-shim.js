// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/integrations/vitest/bun-test-shim.js
/**
 * @fileoverview Drop-in replacement for the `bun:test` module under Vitest.
 *
 * The whole `@awacloud/fw` test suite imports ONLY these 7 symbols from `bun:test`
 * (verified across all 174 `*.test.js` files — zero `mock` / `spyOn` / `it`).
 * `bun:test` is a Jest-compatible API, so each symbol exists identically in
 * Vitest. Aliasing `bun:test` → this shim lets the suite run under Vitest
 * WITHOUT touching a single test file.
 *
 * ONE API gap is bridged here : the **`done` callback** style
 * (`test('x', (done) => { … done() })`). bun:test supports it ; Vitest 4
 * removed it (`done() callback is deprecated`). Since the suite is bun-authored,
 * a 1-arg test function ALWAYS means `done` (never Vitest's TestContext), so we
 * detect it and convert to a promise — transparently, without editing tests.
 *
 * @see ./vitest.config.js   wires the alias `bun:test` → this file
 */

import {
    describe,
    test as _vitestTest,
    expect,
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
} from 'vitest';

/**
 * Wrap a `done`-style test body into a promise-returning function. A 0-arg
 * body is returned untouched (no `done` expected).
 * @param {Function} fn
 * @returns {Function}
 */
function adaptDone(fn) {
    if (typeof fn !== 'function' || fn.length === 0) return fn;
    return function (...args) {
        return new Promise((res, rej) => {
            let settled = false;
            const done = (err) => {
                if (settled) return;
                settled = true;
                if (err) rej(err instanceof Error ? err : new Error(String(err)));
                else res();
            };
            done.fail = (err) => done(err ?? new Error('done.fail() called'));
            let ret;
            try { ret = fn.call(this, done, ...args); }
            catch (e) { rej(e); return; }
            // Support `async (done) => { … }` : also settle on the returned promise.
            if (ret && typeof ret.then === 'function') ret.then(res, rej);
        });
    };
}

// Sub-methods that, like `test(...)`, take a `(name, fn)` body and may use
// `done`. `test.each(...)` is intentionally NOT here : its body receives row
// data, not `done`, so it must pass through untouched.
const DONE_AWARE = new Set(['skip', 'only', 'concurrent', 'sequential', 'fails']);

/**
 * Proxy a Vitest test function so direct calls (and `done`-aware sub-methods)
 * adapt the `done` callback, while everything else (`each`, `todo`, `extend`…)
 * passes through unchanged.
 * @param {Function} orig
 * @returns {Function}
 */
function wrapTest(orig) {
    return new Proxy(orig, {
        apply(target, thisArg, args) {
            const [name, fn, timeout] = args;
            return Reflect.apply(target, thisArg, [name, adaptDone(fn), timeout]);
        },
        get(target, prop, receiver) {
            // bun's `test.if(cond)` → Vitest's `test.runIf(cond)` (same semantics).
            if (prop === 'if') {
                return (...condArgs) => wrapTest(Reflect.apply(target.runIf, target, condArgs));
            }
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === 'function' && DONE_AWARE.has(prop)) return wrapTest(value);
            return value;
        },
    });
}

export const test = wrapTest(_vitestTest);
export { describe, expect, beforeEach, afterEach, beforeAll, afterAll };
