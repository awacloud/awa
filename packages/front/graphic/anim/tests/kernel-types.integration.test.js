// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Integration test — sibling `.d.ts` type coverage for the
 * eight `./kernels/*` exports-map subpaths (`graphic/BATCH_21` task 03).
 *
 * Before this task, `types/main.d.ts` covered the root barrel completely but
 * declared 0 of 8 kernel exports (`ai/memory/types/graphic.md`, 2026-08-05
 * "Types gap for L4" entry) — a TS consumer resolving a kernel subpath got no
 * type information at all. Rather than adding a `"types"` condition to the
 * frozen exports map (rejected — see the plan's Scope §Out), each kernel's
 * resolved `.js` source gets a hand-authored SIBLING `.d.ts`: under
 * `moduleResolution: "nodenext"`, TypeScript resolves the `default` target and
 * then looks for the adjacent `.d.ts` automatically.
 *
 * This suite proves, driven live off `package.json` (never a hardcoded
 * count — the coupled-site growth lesson in `ai/memory/types/graphic.md`):
 *
 *   (a) every `./kernels/*` entry's `default` target has a sibling `.d.ts`;
 *   (b) that `.d.ts` declares EXACTLY the identifier the `.js` exports
 *       (1:1 export parity — no more, no fewer);
 *   (c) no OTHER `.d.ts` exists anywhere under `src/**` (an exact-set
 *       assertion: reddens on both a stray extra file and a missing one).
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { Glob } from 'bun';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, '..');
const SRC = join(PKG_ROOT, 'src');

/** @type {{ exports: Record<string, any> }} */
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));

/** Live `./kernels/*` entries — never hardcode the count/list. */
const kernelEntries = Object.entries(pkg.exports).filter(([key]) => key.startsWith('./kernels/'));

/** Resolve an exports-map `default` target (e.g. `./src/pageflip/fold.js`) to an absolute path. */
function targetPath(target) {
    return join(PKG_ROOT, target.replace(/^\.\//, ''));
}

/** Parse the single `export const <name>` (or `export declare const <name>`) identifier from a file. */
function exportedConstName(absPath) {
    const src = readFileSync(absPath, 'utf8');
    const matches = [...src.matchAll(/export\s+(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    return matches;
}

describe('kernel `.d.ts` sibling coverage (package.json-driven)', () => {
    test('package.json declares exactly 8 `./kernels/*` entries', () => {
        // Non-vacuity guard for the loop below: if this count drifts, the
        // per-entry tests below still run correctly, but a silent 0/1-entry
        // manifest would make them vacuously pass.
        expect(kernelEntries.length).toBe(8);
    });

    for (const [subpath, entry] of kernelEntries) {
        const jsPath = targetPath(entry.default);
        const dtsPath = jsPath.replace(/\.js$/, '.d.ts');

        test(`${subpath}: sibling .d.ts exists next to the default target`, () => {
            expect(() => readFileSync(dtsPath, 'utf8')).not.toThrow();
        });

        test(`${subpath}: .d.ts declares exactly the identifier the .js exports`, () => {
            const jsExports = exportedConstName(jsPath);
            const dtsExports = exportedConstName(dtsPath);

            // The source's own single `export const` — 1:1 export parity is the
            // contract; if the source ever grows a second export, this test
            // reddens rather than silently under-declaring.
            expect(jsExports.length).toBe(1);
            expect(dtsExports.length).toBe(1);
            expect(dtsExports[0]).toBe(jsExports[0]);
        });

        test(`${subpath}: .d.ts imports GraphicModuleDescriptor from the package root (self-reference)`, () => {
            const dtsSrc = readFileSync(dtsPath, 'utf8');
            expect(dtsSrc).toMatch(
                /import\s+type\s+\{\s*GraphicModuleDescriptor\s*\}\s+from\s+['"]@awacloud\/graphic-anim['"]/,
            );
            expect(dtsSrc).toMatch(/:\s*GraphicModuleDescriptor;/);
        });
    }

    test('no OTHER .d.ts exists under src/** (exact-set: fails on grow AND shrink)', async () => {
        const expected = new Set(
            kernelEntries.map(([, entry]) => targetPath(entry.default).replace(/\.js$/, '.d.ts')),
        );

        const found = new Set();
        for await (const file of new Glob('**/*.d.ts').scan({ cwd: SRC, absolute: true, dot: false })) {
            found.add(file);
        }

        // Symmetric-difference assertions so a mismatch names the exact file(s)
        // involved rather than a bare count.
        const stray = [...found].filter((f) => !expected.has(f)).map((f) => relative(PKG_ROOT, f));
        const missing = [...expected].filter((f) => !found.has(f)).map((f) => relative(PKG_ROOT, f));
        expect(stray).toEqual([]);
        expect(missing).toEqual([]);
        expect(found.size).toBe(8);
    });
});
