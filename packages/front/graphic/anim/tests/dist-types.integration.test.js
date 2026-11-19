// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Every `dist` JavaScript file has a declaration that matches it.
 *
 * `gen:bundles` writes a `.d.ts` beside each `.js` / `.min.js` of
 * `dist/standalone` and `dist/build`. This test imports every file and checks
 * that its sibling declaration names the same exports and, for a descriptor,
 * the same literal `name` and `dependencies` tuple. The declarations are read
 * as text (the tuple is the contract a consumer's type-checker sees); the
 * consumer smoke (`tests/types-consumer`) compiles a sample of them.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
try { GlobalRegistrator.register(); } catch { /* already registered */ }

import { describe, test, expect } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PKG = join(import.meta.dir, '..');
const DIRS = [join(PKG, 'dist', 'standalone'), join(PKG, 'dist', 'build')];
const FILES = DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => join(d, f)));

/** The sibling declaration of a `.js` file (`x.min.js` → `x.min.d.ts`). */
const dtsOf = (file) => file.replace(/\.js$/, '.d.ts');

describe('dist declarations', () => {
    test('the dist JavaScript files are all seen', () => {
        expect(FILES.length).toBe(34);
    });

    for (const file of FILES) {
        const rel = file.slice(PKG.length + 1).replace(/\\/g, '/');
        test(`${rel} has a matching .d.ts`, async () => {
            expect(existsSync(dtsOf(file))).toBe(true);
            const dts = readFileSync(dtsOf(file), 'utf8');
            const mod = await import(file);
            const names = Object.keys(mod).sort();
            const declared = [...dts.matchAll(/^export declare const (\w+)/gm)].map((m) => m[1])
                .concat([...dts.matchAll(/^export \{([^}]*)\}/gm)].flatMap((m) => m[1].split(',').map((n) => n.trim()).filter(Boolean)))
                .sort();
            expect(declared).toEqual(names);
            if (names.length !== 1) return; // the barrel re-exports the registry
            const desc = mod[names[0]];
            expect(dts).toContain(`name: '${desc.name}';`);
            const tuple = `dependencies: [${desc.dependencies.map((d) => `'${d}'`).join(', ')}];`;
            expect(dts).toContain(tuple);
        });
    }
});
