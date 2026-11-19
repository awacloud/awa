// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * The API snapshot gate: the package's public surface, measured by
 * `tools/api-surface.js`, must equal the frozen `docs/api/surface.json`.
 * A change to the surface is deliberate: classify it (docs/guide/stability.md),
 * record it in CHANGELOG.md, then `bun run api:surface`.
 */

import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectTypes, diff, staticExports, normaliseDts, resolveTsc, ROOT, SNAPSHOT } from '../tools/api-surface.js';

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const fmt = (d) => d.map((x) => `${x.class} ${x.where}: ${x.detail}`);

describe('api surface gate (docs/api/surface.json)', () => {
    // The runtime surface is measured in a fresh process: it imports every
    // entry and resolves every module, which must neither see what other
    // test files did to shared state nor load the bundler integrations into
    // this process's coverage.
    test('the runtime surface (entries, registry modules and their API key trees) matches the snapshot', () => {
        const res = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'api-surface.js'), '--check', '--no-types'], { cwd: ROOT, encoding: 'utf8' });
        if (res.status !== 0) console.error(res.stdout + res.stderr);
        expect(res.stdout).toContain('[api-surface] OK');
        expect(res.status).toBe(0);
    }, 120_000);

    test('the published declarations (comments removed) match the snapshot hashes', () => {
        if (!resolveTsc()) {
            console.warn('[api-surface] typescript not installed — declaration hashes not checked');
            return;
        }
        const types = collectTypes();
        const d = diff({ entries: {}, modules: {}, types: snapshot.types }, { entries: {}, modules: {}, types });
        expect(fmt(d)).toEqual([]);
    }, 120_000);
});

describe('api surface diff classes', () => {
    const base = {
        entries: { './a': { file: './src/a.js', exports: ['a', 'b'] } },
        modules: { m: { dependencies: ['x'], api: { kind: 'object', keys: { f: 'function', o: { kind: 'object', keys: { g: 'function' } } }, internal: ['_internal'] } } },
        types: { 'dist/types/a.d.ts': '1' },
    };
    const clone = () => JSON.parse(JSON.stringify(base));

    test('an identical surface has no difference', () => {
        expect(diff(base, clone())).toEqual([]);
    });

    test('a removed key, export, entry or a changed kind is breaking; an added one additive', () => {
        const b = clone();
        delete b.modules.m.api.keys.o.keys.g;
        b.modules.m.api.keys.f = 'class';
        b.modules.m.api.keys.h = 'function';
        b.entries['./a'].exports = ['a', 'c'];
        b.entries['./new'] = { file: './src/new.js', exports: [] };
        const d = diff(base, b);
        expect(d.filter((x) => x.class === 'breaking').map((x) => x.detail).sort()).toEqual(['export b removed', 'kind function → class', 'removed g']);
        expect(d.filter((x) => x.class === 'additive').map((x) => x.detail).sort()).toEqual(['added ./new', 'added h', 'export c added']);
    });

    test('a change to the `_` keys is classed internal, dependencies apart, a declaration change types', () => {
        const b = clone();
        b.modules.m.api.internal = [];
        b.modules.m.dependencies = ['x', 'y'];
        b.types['dist/types/a.d.ts'] = '2';
        expect(diff(base, b).map((x) => x.class).sort()).toEqual(['dependencies', 'internal', 'types']);
    });

    test('a removed declaration file is breaking', () => {
        const b = clone();
        b.types = {};
        expect(diff(base, b)).toEqual([{ class: 'breaking', where: 'types', detail: 'removed dist/types/a.d.ts' }]);
    });
});

describe('api surface readers', () => {
    test('staticExports reads declarations, export lists (with `as`) and default', () => {
        const src = 'export const a = 1;\nexport async function b() {}\nexport class C {}\nexport { d, e as f };\nexport default {};\nconst g = 2;\n';
        expect(staticExports(src)).toEqual(['C', 'a', 'b', 'd', 'default', 'f']);
    });

    test('normaliseDts drops comments and blank space, keeps the declaration', () => {
        const a = '/** doc */\nexport declare function f(a: string): number;\n//# sourceMappingURL=x\n';
        const b = '/** other words */\nexport declare function f(a: string):   number;\n';
        expect(normaliseDts(a)).toBe(normaliseDts(b));
        expect(normaliseDts(a)).not.toBe(normaliseDts('export declare function f(b: string): number;'));
    });
});
