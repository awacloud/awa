// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that the descriptor manifest exported by
 * `src/main.js` is dependency-closed: every module declared in
 * `fw_require` / `modules` / `extras` / `bundle` can be resolved through
 * fw's `ModuleRuntime` with no missing dependency.
 *
 * Rationale: when an fw module gains a new dependency (e.g. `sanitize`
 * → `secPolicy`), md's `fw_require` must register the provider too.
 * A gap previously surfaced only as an opaque TDZ ("Cannot access 'md'
 * before initialization") inside `_helpers/build.js`. This test fails
 * instead with an explicit "Module not found: <dep>" message.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../src/main.js';

const ALL = [...fw_require, ...modules, ...extras, ...bundle];

describe('md wiring — manifest is dependency-closed', () => {
    test('every descriptor exposes a string name', () => {
        for (const m of ALL) expect(typeof m.name).toBe('string');
    });

    test('runtime resolves every registered module (no missing dependency)', () => {
        const rt = new ModuleRuntime();
        for (const m of ALL) rt.register(m);
        for (const m of ALL) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });
});
