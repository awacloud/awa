// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Tests for `oconvDefaultFacesAbsent` — the `oconvDefaultFaces` stand-in the
 * `md → pdf` facade depends on by NAME (gate G-OF1).
 *
 * The load-bearing property is version displacement: `ModuleRuntime#register`
 * re-points an entry's latest definition only when the new version sorts
 * `>=` the current one, so a registered face pack at `0.1.0` must win over
 * the `0.0.0` stand-in in BOTH registration orders.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../../main.js';
import { pdfWriterRuntime } from './_test-runtime.js';
import { oconvDefaultFacesAbsent } from './default-faces.js';

/** A same-name test pack: plain bytes, never parsed by these tests. */
const MAP = Object.freeze({ regular: new Uint8Array([1, 2, 3]) });
const testPack = {
    name: 'oconvDefaultFaces',
    version: '0.1.0',
    dependencies: [],
    factory() {
        return { defaultFaces: () => MAP, family: 'test', release: 'test' };
    }
};

describe('oconvDefaultFacesAbsent — descriptor', () => {
    test('exact shape: name, lowest version, no dependency, no deps', () => {
        expect(Object.keys(oconvDefaultFacesAbsent).sort())
            .toEqual(['dependencies', 'deps', 'factory', 'name', 'version']);
        expect(oconvDefaultFacesAbsent.name).toBe('oconvDefaultFaces');
        expect(oconvDefaultFacesAbsent.version).toBe('0.0.0');
        expect(oconvDefaultFacesAbsent.dependencies).toEqual([]);
        expect(oconvDefaultFacesAbsent.deps).toEqual([]);
        expect(typeof oconvDefaultFacesAbsent.factory).toBe('function');
    });

    test('the API mirrors the registered surface with the absent values; defaultFaces() is null', () => {
        const api = oconvDefaultFacesAbsent.factory();
        expect(Object.keys(api).sort()).toEqual(['defaultFaces', 'family', 'release']);
        expect(api.defaultFaces()).toBeNull();
        expect(api.family).toBeNull();
        expect(api.release).toBeNull();
    });

    test('main.js registers it: the published runtime resolves the stand-in', () => {
        const api = pdfWriterRuntime().resolve('oconvDefaultFaces');
        expect(api.defaultFaces()).toBeNull();
        expect(api.family).toBeNull();
    });
});

describe('oconvDefaultFacesAbsent — displaced by a registered pack', () => {
    test('a 0.1.0 same-name descriptor registered AFTER `modules` wins', () => {
        const rt = pdfWriterRuntime([testPack]);
        const api = rt.resolve('oconvDefaultFaces');
        expect(api.family).toBe('test');
        expect(api.defaultFaces()).toBe(MAP);
        expect(typeof rt.resolve('oconvIrToPdf').irToPdf).toBe('function');
    });

    test('one registered BEFORE `modules` also wins (order independence)', () => {
        const rt = new ModuleRuntime();
        rt.register(testPack);
        for (const m of [...fw_require, ...modules, ...extras, ...bundle]) rt.register(m);
        const api = rt.resolve('oconvDefaultFaces');
        expect(api.family).toBe('test');
        expect(api.defaultFaces()).toBe(MAP);
        expect(typeof rt.resolve('oconvIrToPdf').irToPdf).toBe('function');
    });

    test('non-vacuity: with no pack registered the stand-in is what resolves', () => {
        const rt = new ModuleRuntime();
        rt.register(oconvDefaultFacesAbsent);
        expect(rt.resolve('oconvDefaultFaces').family).toBeNull();
        // Stand-in first, pack second, on a fresh runtime (instances are
        // cached by (name, version), so reusing `rt` would prove nothing).
        const later = new ModuleRuntime();
        later.register(oconvDefaultFacesAbsent);
        later.register(testPack);
        expect(later.resolve('oconvDefaultFaces').family).toBe('test');
    });
});

describe('oconvDefaultFacesAbsent — serializable (capture-free)', () => {
    test('a `serialize` round trip of the stand-in resolves in a fresh runtime', () => {
        const rt = new ModuleRuntime();
        rt.register(oconvDefaultFacesAbsent);
        const { list, content } = rt.serialize(['oconvDefaultFaces']);
        expect(list).toBe("['oconvDefaultFaces@0.0.0']");

        const revived = new Function(`return ${content};`)();
        expect(revived).toHaveLength(1);
        const fresh = new ModuleRuntime();
        fresh.registerAll(revived);
        const api = fresh.resolve('oconvDefaultFaces');
        expect(api.defaultFaces()).toBeNull();
        expect(api.family).toBeNull();
        expect(api.release).toBeNull();
    });
});
