// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Scaffold guard of `@awacloud/media-video`: the manifest, the
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

/**
 * Collects every file target of an exports map.
 * @param {unknown} node
 * @param {string[]} out
 * @returns {string[]}
 */
function targets(node, out = []) {
    if (typeof node === 'string') out.push(node);
    else if (node && typeof node === 'object') {
        for (const value of Object.values(node)) targets(value, out);
    }
    return out;
}

describe('@awacloud/media-video scaffold', () => {
    test('the manifest states the package identity', () => {
        expect(manifest.name).toBe('@awacloud/media-video');
        expect(manifest.private).toBe(true);
        expect(manifest.type).toBe('module');
        expect(manifest.sideEffects).toBe(false);
        expect(manifest.license).toBe('AGPL-3.0-only');
        expect(manifest.awa.maturity).toBe('L2');
    });

    test('the only runtime dependency is the framework', () => {
        expect(manifest.dependencies).toEqual({ '@awacloud/fw': 'workspace:*', '@awacloud/media-stream': 'workspace:*' });
    });

    test('every target of the exports map exists', () => {
        const files = targets(manifest.exports);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            expect(file.includes('*')).toBe(false);
            expect(existsSync(resolve(ROOT, file))).toBe(true);
        }
    });

    test('the entry point exports the registration array and nothing else', () => {
        expect(Object.keys(main)).toEqual(['mediaVideoModules']);
        expect(Array.isArray(main.mediaVideoModules)).toBe(true);
    });

    test('every module of the array registers and resolves', () => {
        const runtime = new ModuleRuntime();
        runtime.registerAllDeep(main.mediaVideoModules);
        for (const module of main.mediaVideoModules) {
            expect(module.name.startsWith('video.')).toBe(true);
            expect(runtime.resolve(module.name)).toBeDefined();
        }
    });
});
