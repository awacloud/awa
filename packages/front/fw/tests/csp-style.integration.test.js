// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FW_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The driver runs under node (own Chromium process), never inside this process.
const probe = spawnSync('node', ['--version'], { encoding: 'utf8' });
const hasNode = !probe.error && probe.status === 0;
const r = hasNode
    ? spawnSync('node', ['tools/browser/csp-style/run.js'], {
        cwd: FW_ROOT, encoding: 'utf8', timeout: 120_000, env: { ...process.env },
    })
    : null;
const skipped = !hasNode || r.status === 3;
if (skipped) {
    console.warn('csp-style leg SKIPPED (node or Chromium unavailable): provision with `bun run e2e:preview:install`. A skip is not evidence.');
}

describe('CSP style leg (Chromium, style-src self)', () => {
    test.skipIf(skipped)('adopted mode applies the CSS; element mode is refused', () => {
        expect(r.status).toBe(0);
        const lines = r.stdout.trim().split('\n');
        const out = JSON.parse(lines[lines.length - 1]);
        const { adopted: a, element: e } = out;
        expect(a.error).toBeUndefined();
        expect(e.error).toBeUndefined();
        expect(a.color).toBe('rgb(1, 2, 3)');
        expect(a.token).toBe('rgb(4, 5, 6)');
        expect(a.styleElements).toBe(0);
        expect(a.adopted).toBeGreaterThanOrEqual(2);
        expect(a.violations).toEqual([]);
        expect(e.color).not.toBe('rgb(1, 2, 3)');
        expect(e.token).not.toBe('rgb(4, 5, 6)');
        expect(e.styleElements).toBeGreaterThanOrEqual(1);
        expect(e.adopted).toBe(0);
        expect(e.violations.some((v) => v.startsWith('style-src'))).toBe(true);
        expect(out.pageErrors.adopted).toEqual([]);
    });
});
