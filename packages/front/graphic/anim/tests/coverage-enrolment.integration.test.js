// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage enrolment: the package declares `awa.coverageFloor`, the key the
 * repo's `coverage-gate` discovers floor-bearing packages by
 * (`ai/conventions/testing.md` § Coverage, point 4). The floor was seeded at
 * `floor(baseline %) − 2` on the canonical basis and capped at 0.85 (the
 * first recommended floor); the gate itself checks the measured coverage
 * against it. The level is L3 since the owner raised it with the docs/api
 * mirror in place; the floor itself raised nothing.
 *
 * Re-based 0.82 -> 0.81 on 2026-11-18 (owner ruling OP-P5-B3-1118): the spike
 * tests and their sources left the package when its dated records were
 * archived (repo/BATCH_81/14), so they left the coverage basis too. The
 * shipped `src/` coverage did not change; the measured aggregate went from
 * 84.18 % to 81.48 %, and 0.81 is the floor of that measure.
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('coverage enrolment', () => {
    test('the package declares a numeric coverage floor in (0, 0.85]', () => {
        const floor = pkg.awa && pkg.awa.coverageFloor;
        expect(typeof floor).toBe('number');
        expect(floor).toBeGreaterThan(0);
        expect(floor).toBeLessThanOrEqual(0.85);
    });

    test('the floor reads the canonical aggregate (no coverageBasis); the level is L3', () => {
        expect(pkg.awa.coverageBasis).toBeUndefined();
        expect(pkg.awa.maturity).toBe('L3');
    });
});
