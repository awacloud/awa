// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odfWalker } from './walker.js';

const shared = odfWalker.factory();

describe('odfWalker — factory shape', () => {
    test('descriptor contract', () => {
        expect(odfWalker.name).toBe('odfWalker');
        expect(odfWalker.dependencies).toEqual([]);
        expect(typeof odfWalker.factory).toBe('function');
    });

    test('createWalker returns the walker API', () => {
        const w = shared.createWalker({
            rootField: 'body',
            recurseFields: ['children'],
            typeHooks: { paragraph: 'Paragraph' }
        });
        expect(typeof w.use).toBe('function');
        expect(w.hasExtensions).toBe(false);
    });
});

describe('odfWalker — generic dispatch', () => {
    const config = {
        rootField: 'body',
        recurseFields: ['children', 'spans'],
        typeHooks: { paragraph: 'Paragraph', span: 'Span', frame: 'Frame' }
    };

    test('dispatches hydrate hooks across the tree', () => {
        const w = shared.createWalker(config);
        const seen = [];
        w.use({
            hydrateParagraph(p) { seen.push('p'); return p; },
            hydrateSpan(s)      { seen.push('s'); return s; },
            hydrateFrame(f)     { seen.push('f'); return f; },
            hydrateMetadata(m)  { seen.push('m'); return m; },
            hydrateSettings(s)  { seen.push('S'); return s; },
            hydrateStyles(s)    { seen.push('Y'); return s; }
        });
        const result = {
            body: [
                { type: 'paragraph', spans: [{ type: 'span' }] },
                { type: 'frame' }
            ],
            meta: {}, settings: {}, styles: {}
        };
        w.applyHydrate(result);
        for (const k of ['p', 's', 'f', 'm', 'S', 'Y']) expect(seen).toContain(k);
    });

    test('dehydrate uses dehydrate<Suffix> hooks', () => {
        const w = shared.createWalker(config);
        let seen = false;
        w.use({ dehydrateParagraph(p) { seen = true; return p; } });
        w.applyDehydrate({ body: [{ type: 'paragraph' }] });
        expect(seen).toBe(true);
    });

    test('hook return replaces node in place', () => {
        const w = shared.createWalker(config);
        w.use({ hydrateParagraph: () => ({ type: 'paragraph', flagged: true }) });
        const r = { body: [{ type: 'paragraph' }] };
        w.applyHydrate(r);
        expect(r.body[0].flagged).toBe(true);
    });

    test('no-op without extensions', () => {
        const w = shared.createWalker(config);
        const r = { body: [{ type: 'paragraph' }] };
        w.applyHydrate(r);
        expect(r.body[0].type).toBe('paragraph');
    });

    test('use() is idempotent and skips null/undefined', () => {
        const w = shared.createWalker(config);
        const ext = {};
        w.use(ext); w.use(ext); w.use(null, undefined);
        expect(w.extensions.length).toBe(1);
    });

    test('rootField + custom recurseFields drive the traversal', () => {
        const w = shared.createWalker({
            rootField: 'slides',
            recurseFields: ['frames'],
            typeHooks: { slide: 'Slide', frame: 'Frame' }
        });
        const seen = [];
        w.use({
            hydrateSlide(s) { seen.push('s'); return s; },
            hydrateFrame(f) { seen.push('f'); return f; }
        });
        w.applyHydrate({
            slides: [{ type: 'slide', frames: [{ type: 'frame' }] }]
        });
        expect(seen).toEqual(['f', 's']);
    });
});
