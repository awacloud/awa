// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/descriptors.test.ts — unit tests for the typed
 * descriptor adapter (`./descriptors.ts`).
 *
 * The adapter is the only bridge between the imported `@awacloud/oconv` /
 * `@awacloud/md` descriptor arrays and `ModuleRuntime.registerAll`: it must
 * accept the REAL arrays unchanged and reject a malformed entry with a named
 * `internal/descriptor` error, never a bare cast.
 */

import { describe, expect, test } from 'bun:test';
import { fw_require as oconvFwRequire, modules as oconvModules } from '@awacloud/oconv';
import { fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { DescriptorError, toModuleDefinitions } from './descriptors.ts';

describe('toModuleDefinitions — accepts the real descriptor arrays', () => {
    const real: Array<[string, readonly unknown[]]> = [
        ['@awacloud/oconv fw_require', oconvFwRequire],
        ['@awacloud/oconv modules', oconvModules],
        ['@awacloud/md fw_require', mdFwRequire],
        ['@awacloud/md modules', mdModules],
    ];

    for (const [label, list] of real) {
        test(`${label}: every entry passes through unchanged`, () => {
            expect(list.length).toBeGreaterThan(0);
            const out = toModuleDefinitions(label, list);
            expect(out.length).toBe(list.length);
            out.forEach((def, i) => expect(def).toBe(list[i] as typeof def));
        });
    }
});

describe('toModuleDefinitions — rejects a malformed descriptor by name', () => {
    const factory = () => ({});

    test('missing factory: internal/descriptor error naming the entry and the field', () => {
        const list = [{ name: 'good', dependencies: [], factory }, { name: 'broken', dependencies: [] }];
        let caught: unknown;
        try {
            toModuleDefinitions('fixture', list);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(DescriptorError);
        const err = caught as DescriptorError;
        expect(err.code).toBe('internal/descriptor');
        expect(err.usage).toBe(false);
        expect(err.error).toBe(err.message);
        expect(err.message).toBe('internal/descriptor: fixture[1] "broken" is not a module definition (factory is not a function)');
    });

    test('dependencies not an array: named error', () => {
        expect(() => toModuleDefinitions('fixture', [{ name: 'x', dependencies: 'fw', factory }])).toThrow(
            'internal/descriptor: fixture[0] "x" is not a module definition (dependencies is not an array)',
        );
    });

    test('missing name: the entry is named by its index', () => {
        expect(() => toModuleDefinitions('fixture', [{ dependencies: [], factory }])).toThrow(
            'internal/descriptor: fixture[0] <unnamed> is not a module definition (name is not a non-empty string)',
        );
    });

    test('non-object entry: named error', () => {
        expect(() => toModuleDefinitions('fixture', [null])).toThrow(
            'internal/descriptor: fixture[0] <unnamed> is not a module definition (entry is not an object)',
        );
    });

    test('empty array is accepted (nothing to register)', () => {
        expect(toModuleDefinitions('fixture', [])).toEqual([]);
    });
});
