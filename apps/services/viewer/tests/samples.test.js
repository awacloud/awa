// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The showcase samples (`public/samples/{en,fr}/`): the page's
 * list is the generator's; every sample exists in both languages and is the
 * generator's output byte for byte — so a sentence or a price changed on
 * the web site reddens this test until `bun run samples` is run again —
 * and every sample opens in the viewer without an error.
 *
 * @module viewer/tests/samples.test
 */
import './setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLES as BUILT, buildSamples } from '../tools/build-samples.js';
import { SAMPLES as PAGE } from '../src/app.js';
import { mountViewer } from '../src/viewer.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

describe('showcase samples', () => {
    test('the page offers exactly the samples the generator builds', () => {
        expect(PAGE).toEqual(BUILT);
        for (const lang of ['en', 'fr']) {
            for (const s of BUILT) expect(existsSync(here(`../public/samples/${lang}/${s.file}`)), `${lang}/${s.file}`).toBe(true);
        }
    });

    test('the committed samples are the generator\'s output (the site\'s text, as published)', async () => {
        const built = await buildSamples();
        expect(built.size).toBe(BUILT.length * 2);
        for (const [name, bytes] of built) {
            const committed = readFileSync(here(`../public/samples/${name}`));
            expect(committed.equals(bytes), `${name}: run bun run samples`).toBe(true);
        }
    }, 60000);

    test('every sample opens in the viewer, English and French', async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const v = mountViewer(host, { locale: 'en' });
        for (const lang of ['en', 'fr']) {
            for (const s of BUILT) {
                const bytes = new Uint8Array(readFileSync(here(`../public/samples/${lang}/${s.file}`)));
                expect(await v.open({ name: s.file, bytes }), `${lang}/${s.file}`).toBe(true);
                expect(v.status.state).toBe('ready');
            }
        }
        v.destroy();
        host.remove();
    }, 60000);
});
