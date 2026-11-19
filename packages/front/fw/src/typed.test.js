// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { asTyped, createRuntime } from './typed.js';
import { ModuleRuntime } from './core/runtime.js';
import modules from './core/modules.js';
import * as modulesNamespace from './core/modules.js';

describe('typed', () => {
    test('asTyped is the identity', () => {
        const rt = new ModuleRuntime();
        expect(asTyped(rt)).toBe(rt);
    });

    test('createRuntime() with no argument is an empty runtime', () => {
        const rt = createRuntime();
        expect(rt).toBeInstanceOf(ModuleRuntime);
        expect(rt.list().length).toBe(0);
    });

    test('createRuntime(array) registers every module (the default export of core/modules)', () => {
        const rt = createRuntime(modules);
        expect(rt.list().length).toBe(modules.length);
        expect(rt.resolve('hex').fromBytes(new Uint8Array([0xca, 0xfe]))).toBe('cafe');
    });

    test('createRuntime(object of descriptors) registers each value', () => {
        const hex = modules.find((m) => m.name === 'hex');
        const signal = modules.find((m) => m.name === 'signal');
        const rt = createRuntime({ hex, signal });
        expect(rt.has('hex')).toBe(true);
        expect(rt.has('signal')).toBe(true);
    });

    test('createRuntime(module namespace) registers the arrays it holds', () => {
        // `import * as ns from '@awacloud/fw/core/modules'` is `{ default: [...] }`.
        const rt = createRuntime(modulesNamespace);
        expect(rt.list().length).toBe(modules.length);
        expect(rt.has('hex')).toBe(true);
    });

    test('transitive deps come along (deep registration)', () => {
        const withDeps = modules.find((m) => Array.isArray(m.deps) && m.deps.length > 0);
        expect(withDeps).toBeDefined();
        const rt = createRuntime([withDeps]);
        for (const d of withDeps.deps) expect(rt.has(d.name)).toBe(true);
        expect(() => rt.resolve(withDeps.name)).not.toThrow();
    });
});
