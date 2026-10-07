// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Gate G-OF1 — the `oconvDefaultFaces` descriptor surface
 * (`ai/plans/oconv/spikes/w0-fonts/FINDINGS.md` § 7, frozen by
 * office/BATCH_37 task 03). Every assertion here pins a FROZEN property:
 * W2 (`oconv` default-route wiring) binds to it immutably.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createOconvDefaultFaces } from './faces.js';

const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const FROZEN_KEYS = ['regular', 'bold', 'italic', 'boldItalic', 'mono'];

/** Five distinct tiny stand-in programs (the descriptor validates shape, not font syntax). */
function fakeFaces() {
    return {
        regular: new Uint8Array([1]),
        bold: new Uint8Array([2]),
        italic: new Uint8Array([3]),
        boldItalic: new Uint8Array([4]),
        mono: new Uint8Array([5])
    };
}

describe('oconvDefaultFaces module', () => {
    test('descriptor carries exactly name / version / dependencies / deps / factory', () => {
        const d = createOconvDefaultFaces(fakeFaces());
        expect(Object.keys(d).sort()).toEqual(['dependencies', 'deps', 'factory', 'name', 'version']);
        expect(typeof d.factory).toBe('function');
    });

    test('name is the literal oconvDefaultFaces', () => {
        expect(createOconvDefaultFaces(fakeFaces()).name).toBe('oconvDefaultFaces');
    });

    test('version equals package.json version', () => {
        expect(createOconvDefaultFaces(fakeFaces()).version).toBe(PKG.version);
    });

    test('dependencies and deps are both empty arrays', () => {
        const d = createOconvDefaultFaces(fakeFaces());
        expect(d.dependencies).toEqual([]);
        expect(d.deps).toEqual([]);
    });

    describe('factory', () => {
        test('resolved API is exactly { defaultFaces, family: Liberation, release: 2.1.5 }', () => {
            const api = createOconvDefaultFaces(fakeFaces()).factory();
            expect(Object.keys(api).sort()).toEqual(['defaultFaces', 'family', 'release']);
            expect(api.family).toBe('Liberation');
            expect(api.release).toBe('2.1.5');
        });

        test('defaultFaces is a function, not a property holding the map', () => {
            const api = createOconvDefaultFaces(fakeFaces()).factory();
            expect(typeof api.defaultFaces).toBe('function');
        });
    });

    describe('defaultFaces()', () => {
        test('returns a frozen map keyed exactly regular | bold | italic | boldItalic | mono', () => {
            const map = createOconvDefaultFaces(fakeFaces()).factory().defaultFaces();
            expect(Object.isFrozen(map)).toBe(true);
            expect(Object.keys(map)).toEqual(FROZEN_KEYS);
        });

        test('values are the caller-supplied Uint8Array instances, unchanged', () => {
            const input = fakeFaces();
            const map = createOconvDefaultFaces(input).factory().defaultFaces();
            for (const key of FROZEN_KEYS) {
                expect(map[key]).toBeInstanceOf(Uint8Array);
                expect(map[key]).toBe(input[key]);
            }
        });

        test('the frozen map rejects writes (strict-mode module)', () => {
            const map = createOconvDefaultFaces(fakeFaces()).factory().defaultFaces();
            expect(() => { map.regular = new Uint8Array([9]); }).toThrow(TypeError);
            expect(() => { map.extra = new Uint8Array([9]); }).toThrow(TypeError);
        });

        test('a later mutation of the caller object does not reach the map', () => {
            const input = fakeFaces();
            const map = createOconvDefaultFaces(input).factory().defaultFaces();
            const before = map.regular;
            input.regular = new Uint8Array([42]);
            expect(map.regular).toBe(before);
            expect(Object.isFrozen(input)).toBe(false);
        });

        test('returns the same frozen map on every call', () => {
            const api = createOconvDefaultFaces(fakeFaces()).factory();
            expect(api.defaultFaces()).toBe(api.defaultFaces());
        });
    });

    describe('validation — oconv-fonts: bad faces <key>', () => {
        test('an unknown key throws (the class name `code` is not a face key)', () => {
            expect(() => createOconvDefaultFaces({ ...fakeFaces(), code: new Uint8Array([6]) }))
                .toThrow('oconv-fonts: bad faces code');
        });

        test('a missing key throws', () => {
            const faces = fakeFaces();
            delete faces.mono;
            expect(() => createOconvDefaultFaces(faces)).toThrow('oconv-fonts: bad faces mono');
        });

        test('a non-Uint8Array value throws (ArrayBuffer, Array, string, null)', () => {
            for (const bad of [new ArrayBuffer(1), [1], 'x', null]) {
                expect(() => createOconvDefaultFaces({ ...fakeFaces(), bold: bad }))
                    .toThrow('oconv-fonts: bad faces bold');
            }
        });

        test('a non-object input throws, naming the first required key', () => {
            for (const bad of [undefined, null, 'faces', 7]) {
                expect(() => createOconvDefaultFaces(bad)).toThrow('oconv-fonts: bad faces regular');
            }
        });
    });

    describe('no side effect at import', () => {
        test('importing faces.js, loader.js and main.js performs no fetch', async () => {
            const original = globalThis.fetch;
            let calls = 0;
            globalThis.fetch = () => { calls++; return Promise.reject(new Error('fetch at import')); };
            try {
                const stamp = `?import-probe=${Date.now()}`;
                await import(new URL(`./faces.js${stamp}`, import.meta.url).href);
                await import(new URL(`./loader.js${stamp}`, import.meta.url).href);
                const main = await import(new URL(`./main.js${stamp}`, import.meta.url).href);
                expect(calls).toBe(0);
                // Non-vacuity: the same spy DOES see the fetches of a real call
                // (an http(s) base: a file: base would recover through the
                // loader's file-system fallback).
                await expect(main.loadDefaultFaces({ baseUrl: 'https://faces.invalid/liberation/' }))
                    .rejects.toThrow('oconv-fonts: cannot load');
                expect(calls).toBe(5);
            } finally {
                globalThis.fetch = original;
            }
        });

        test('main.js re-exports exactly the three public functions', async () => {
            const main = await import('./main.js');
            expect(Object.keys(main).sort()).toEqual(['createOconvDefaultFaces', 'loadDefaultFaces', 'registerDefaultFaces']);
            for (const fn of Object.values(main)) expect(typeof fn).toBe('function');
        });
    });
});
