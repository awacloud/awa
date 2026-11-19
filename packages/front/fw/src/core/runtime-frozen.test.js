// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The registry is read-only from the outside (D9 G1, BL-469): `list()` hands
// back a frozen array of frozen copies, and the registry array that
// `core/modules.js` exports is frozen, so no importer can edit what another
// importer resolves.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from './runtime.js';
import modules from './modules.js';

const leaf = { name: 'leaf', version: '1.0.0', type: 'fw.test', dependencies: [], factory: () => ({ v: 1 }) };
const top = { name: 'top', version: '1.0.0', type: 'fw.test', dependencies: ['leaf'], factory: (l) => ({ l }) };

describe('ModuleRuntime.list(): frozen copies', () => {
    test('the array and every row are frozen; a row\'s dependencies are a frozen copy', () => {
        const rt = new ModuleRuntime();
        rt.registerAll([leaf, top]);
        const rows = rt.list();
        expect(Object.isFrozen(rows)).toBe(true);
        expect(() => { 'use strict'; rows.push({}); }).toThrow();
        const row = rows.find((r) => r.name === 'top');
        expect(Object.isFrozen(row)).toBe(true);
        expect(Object.isFrozen(row.dependencies)).toBe(true);
        expect(row.dependencies).toEqual(['leaf']);
        expect(row.dependencies).not.toBe(top.dependencies);
        expect(row).not.toBe(top);
        expect(row.factory).toBe(top.factory);
    });

    test('editing what list() returned cannot reach the registry', () => {
        const rt = new ModuleRuntime();
        rt.registerAll([leaf, top]);
        const row = rt.list({ name: 'top' })[0];
        expect(() => { row.dependencies.splice(0, 1); }).toThrow();
        expect(() => { row.factory = () => ({ hijacked: true }); }).toThrow();
        expect(rt.resolve('top').l.v).toBe(1);
        // the caller's own definition objects stay writable
        expect(Object.isFrozen(top)).toBe(false);
        expect(Object.isFrozen(top.dependencies)).toBe(false);
    });

    test('filters still apply', () => {
        const rt = new ModuleRuntime();
        rt.registerAll([leaf, top]);
        expect(rt.list({ type: 'fw.' }).map((r) => r.name).sort()).toEqual(['leaf', 'top']);
        expect(rt.list({ name: 'leaf' }).length).toBe(1);
        expect(rt.list({ name: 'none' })).toEqual([]);
    });
});

describe('core/modules.js: the registry array', () => {
    test('is frozen: an importer cannot add, drop or replace a module', () => {
        expect(Object.isFrozen(modules)).toBe(true);
        const n = modules.length;
        expect(() => { modules.push(leaf); }).toThrow();
        expect(() => { modules.splice(0, 1); }).toThrow();
        expect(() => { modules[0] = leaf; }).toThrow();
        expect(modules.length).toBe(n);
    });

    test('still registers as before', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(modules);
        expect(rt.has('hex')).toBe(true);
    });
});
