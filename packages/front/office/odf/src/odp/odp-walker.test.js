// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odpWalker } from './odp-walker.js';
import { odfWalker } from '../_shared/walker.js';

const shared = odfWalker.factory();

describe('odpWalker — factory shape', () => {
    test('factory contract', () => {
        expect(odpWalker.name).toBe('odpWalker');
        expect(odpWalker.dependencies).toEqual(['odfWalker']);
        const w = odpWalker.factory(shared).createWalker();
        expect(typeof w.use).toBe('function');
    });
});

describe('odpWalker — hook dispatch', () => {
    test('visits slides / frames / paragraphs / metadata / styles', () => {
        const w = odpWalker.factory(shared).createWalker();
        const seen = [];
        w.use({
            hydrateSlide(s)     { seen.push('s'); return s; },
            hydrateFrame(f)     { seen.push('f'); return f; },
            hydrateParagraph(p) { seen.push('p'); return p; },
            hydrateMetadata(m)  { seen.push('m'); return m; },
            hydrateSettings(s)  { seen.push('S'); return s; },
            hydrateStyles(s)    { seen.push('y'); return s; }
        });
        const result = {
            slides: [
                { type: 'slide', frames: [
                    { type: 'frame', children: [{ type: 'paragraph' }] }
                ] }
            ],
            meta: {}, settings: {}, styles: {}
        };
        w.applyHydrate(result);
        for (const k of ['s', 'f', 'p', 'm', 'S', 'y']) expect(seen).toContain(k);
    });

    test('use() idempotence', () => {
        const w = odpWalker.factory(shared).createWalker();
        const ext = {};
        w.use(ext); w.use(ext);
        expect(w.extensions.length).toBe(1);
    });
});
