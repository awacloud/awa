// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// The internal slot: the modules that keep test or companion primitives
// keep them under `Symbol.for('@awacloud/fw/internal')`, non-enumerable and
// read-only, and no API object carries a `_` key any more.

import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from './runtime.js';
import modules from './modules.js';
import { INTERNAL, internalOf } from './internal.js';

const rt = new ModuleRuntime();
rt.registerAll(modules);

/** Every object reachable from a resolved API (depth 3, own string keys). */
function* objects(name) {
    const seen = new Set();
    function* walk(v, path, depth) {
        if (v === null || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v) || depth > 3) return;
        seen.add(v);
        yield [path, v];
        for (const k of Object.getOwnPropertyNames(v)) {
            if (k === 'prototype') continue;
            const d = Object.getOwnPropertyDescriptor(v, k);
            if (d && 'value' in d) yield* walk(d.value, `${path}.${k}`, depth + 1);
        }
    }
    yield* walk(rt.resolve(name), name, 0);
}

const SLOTS = [
    'aes', 'argon2', 'brotli', 'brotliShared', 'chacha20', 'cmac', 'ecc', 'ed25519', 'gcm', 'hybridSign',
    'ml_dsa', 'ml_dsa.ml_dsa44', 'ml_dsa.ml_dsa65', 'ml_dsa.ml_dsa87',
    'ml_kem', 'ml_kem.ml_kem512', 'ml_kem.ml_kem768', 'ml_kem.ml_kem1024',
    'random', 'rsa', 'rsaKeygen', 'sha256', 'sha512', 'x25519',
    ...['sha2', 'shake'].flatMap((h) => ['128f', '128s', '192f', '192s', '256f', '256s'].map((p) => `slh_dsa.slh_dsa_${h}_${p}`)),
];

describe('core/internal — the internal slot (D35)', () => {
    test('INTERNAL is the registered symbol, internalOf reads it', () => {
        expect(INTERNAL).toBe(Symbol.for('@awacloud/fw/internal'));
        expect(internalOf(null)).toBeUndefined();
        expect(internalOf({})).toBeUndefined();
    });

    test('exactly the expected API objects carry a slot, non-enumerable and read-only', () => {
        const found = [];
        for (const m of modules) {
            for (const [path, v] of objects(m.name)) {
                const d = Object.getOwnPropertyDescriptor(v, INTERNAL);
                if (!d) continue;
                found.push(path);
                expect([path, d.enumerable, d.writable, d.configurable]).toEqual([path, false, false, false]);
                expect(typeof d.value).toBe('object');
                expect(Object.keys(v)).not.toContain(String(INTERNAL));
            }
        }
        expect(found.sort()).toEqual([...SLOTS].sort());
    });

    test('no API object has a `_` key; the class methods and the uiSessionCore mixin keep theirs (outside semver)', () => {
        const bad = [];
        for (const m of modules) {
            for (const [path, v] of objects(m.name)) {
                if (path === 'uiSessionCore.methods') continue; // methods mixed into a class prototype
                for (const k of Object.getOwnPropertyNames(v)) if (k.startsWith('_')) bad.push(`${path}.${k}`);
            }
        }
        expect(bad).toEqual([]);
    });

    test('the slot carries what the modules and the vector tests read', () => {
        expect(typeof internalOf(rt.resolve('sha256')).makeSha).toBe('function');
        expect(typeof internalOf(rt.resolve('sha256')).compress).toBe('function');
        expect(typeof internalOf(rt.resolve('sha512')).makeSha).toBe('function');
        expect(typeof internalOf(rt.resolve('ml_kem')).ntt).toBe('function');
        expect(typeof internalOf(rt.resolve('hybridSign')).encodeTlv).toBe('function');
        // sha224 and sha384 are built on it
        expect(rt.resolve('sha224').hash('abc').length).toBe(7);
        expect(rt.resolve('sha384').hash('abc').length).toBe(12);
    });
});
