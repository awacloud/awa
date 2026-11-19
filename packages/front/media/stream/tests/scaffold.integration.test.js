// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Scaffold guard of `@awacloud/media-stream`: the manifest, the
 * exports map and the fw wiring of the registration array.
 */

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as main from '../src/main.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

describe('@awacloud/media-stream scaffold', () => {
    test('the manifest states the package identity', () => {
        expect(manifest.name).toBe('@awacloud/media-stream');
        expect(manifest.private).toBe(true);
        expect(manifest.type).toBe('module');
        expect(manifest.sideEffects).toBe(false);
        expect(manifest.license).toBe('AGPL-3.0-only');
        expect(manifest.awa.maturity).toBe('L2');
    });

    test('no runtime dependency: the deflate is given, not imported', () => {
        expect(manifest.dependencies).toEqual({});
    });

    test('every target of the exports map exists', () => {
        const files = Object.values(manifest.exports);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) expect(existsSync(resolve(ROOT, file))).toBe(true);
    });

    test('the entry point exports the registration array and nothing else', () => {
        expect(Object.keys(main)).toEqual(['mediaStreamModules']);
    });

    test('every module of the array registers and resolves', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep(main.mediaStreamModules);
        for (const module of main.mediaStreamModules) {
            expect(module.name.startsWith('media.')).toBe(true);
            expect(runtime.resolve(module.name)).toBeDefined();
        }
    });
});
