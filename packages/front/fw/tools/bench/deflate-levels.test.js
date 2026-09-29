// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench } from './deflate-levels.js';

const DEFLATE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/io/compress/deflate.js');

describe('deflate-levels bench harness', () => {
    test('runBench returns the documented JSON shape, same engine both sides', async () => {
        const result = await runBench({
            oldPath: DEFLATE_PATH,
            newPath: DEFLATE_PATH,
            levels: [1, 6],
            reps: 1,
            warmup: 0,
            corpora: ['repeat', 'small'],
        });

        expect(typeof result).toBe('object');
        expect(result.host).toBeDefined();
        expect(typeof result.host.platform).toBe('string');
        expect(typeof result.host.arch).toBe('string');
        expect(typeof result.host.cpuModel).toBe('string');
        expect(typeof result.host.bunVersion).toBe('string');
        expect(result.baseline).toBeNull();
        expect(typeof result.generatedAt).toBe('string');

        expect(Object.keys(result.levels).sort()).toEqual(['1', '6']);

        for (const levelKey of ['1', '6']) {
            const lvl = result.levels[levelKey];
            expect(Object.keys(lvl.corpora).sort()).toEqual(['repeat', 'small']);

            for (const corpusName of ['repeat', 'small']) {
                const c = lvl.corpora[corpusName];
                expect(Number.isFinite(c.deltaTimePct)).toBe(true);
                expect(c.deltaBytesPct).toBe(0);
                expect(c.oldBytes).toBe(c.newBytes);
                expect(c.oldBytes).toBeGreaterThan(0);
            }

            expect(Number.isFinite(lvl.deltaTimePct)).toBe(true);
            expect(lvl.deltaBytesPct).toBe(0);
        }
    });

    test('runs against the live deflate.js by default (no old/new given)', async () => {
        const result = await runBench({ levels: [1], reps: 1, warmup: 0, corpora: ['repeat'] });
        expect(result.levels['1'].corpora.repeat.deltaBytesPct).toBe(0);
    });
});
