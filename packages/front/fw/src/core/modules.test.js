// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Wiring guard for the package's own module array (fw-coding: "a wiring test
// that resolves every module of the package's own array is the guard"). An
// unregistered provider surfaces as an opaque initialisation error, so every
// entry is resolved here, in a plain process with no DOM.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from './runtime.js';
import modules from './modules.js';

const nameOf = (spec) => {
    const at = spec.lastIndexOf('@');
    return at <= 0 ? spec : spec.slice(0, at);
};

describe('core/modules registry wiring', () => {
    test('names are unique', () => {
        const names = modules.map((m) => m.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('every declared dependency is itself in the array', () => {
        const names = new Set(modules.map((m) => m.name));
        const missing = [];
        for (const m of modules) {
            for (const spec of m.dependencies || []) {
                if (!names.has(nameOf(spec))) missing.push(`${m.name} → ${spec}`);
            }
        }
        expect(missing).toEqual([]);
    });

    test('every deps list matches its dependencies by name', () => {
        const drift = [];
        for (const m of modules) {
            if (!Array.isArray(m.deps)) continue;
            const a = m.deps.map((d) => d && d.name);
            const b = (m.dependencies || []).map(nameOf);
            if (JSON.stringify(a) !== JSON.stringify(b)) drift.push(`${m.name}: deps ${a} vs dependencies ${b}`);
        }
        expect(drift).toEqual([]);
    });

    test('every entry resolves to a defined instance', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(modules);
        const failures = [];
        for (const m of modules) {
            try {
                if (rt.resolve(m.name) === undefined) failures.push(`${m.name}: undefined`);
            } catch (e) {
                failures.push(`${m.name}: ${e && e.message}`);
            }
        }
        expect(failures).toEqual([]);
        expect(modules.length).toBeGreaterThan(200);
    });
});
