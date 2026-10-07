// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odtWalker } from './odt-walker.js';
import { odfWalker } from '../_shared/walker.js';

const shared = odfWalker.factory();

describe('odtWalker — factory shape', () => {
    test('exposes the expected factory contract', () => {
        expect(odtWalker.name).toBe('odtWalker');
        expect(odtWalker.dependencies).toEqual(['odfWalker']);
        expect(typeof odtWalker.factory).toBe('function');
    });

    test('createWalker returns the walker API', () => {
        const w = odtWalker.factory(shared).createWalker();
        expect(typeof w.use).toBe('function');
        expect(typeof w.applyHydrate).toBe('function');
        expect(typeof w.applyDehydrate).toBe('function');
        expect(w.hasExtensions).toBe(false);
    });
});

describe('odtWalker — registration', () => {
    test('use() is idempotent', () => {
        const w = odtWalker.factory(shared).createWalker();
        const ext = { hydrateParagraph: p => p };
        w.use(ext);
        w.use(ext);
        w.use(ext, ext);
        expect(w.hasExtensions).toBe(true);
        expect(w.extensions.length).toBe(1);
    });

    test('use() skips null / undefined', () => {
        const w = odtWalker.factory(shared).createWalker();
        w.use(null, undefined);
        expect(w.hasExtensions).toBe(false);
    });
});

describe('odtWalker — hook dispatch', () => {
    test('hydrate visits paragraphs / spans / headings / lists / tables / cells / frames', () => {
        const w = odtWalker.factory(shared).createWalker();
        const seen = [];
        w.use({
            hydrateParagraph(p) { seen.push('p'); return p; },
            hydrateSpan(s)      { seen.push('s'); return s; },
            hydrateHeading(h)   { seen.push('h'); return h; },
            hydrateList(l)      { seen.push('l'); return l; },
            hydrateTable(t)     { seen.push('t'); return t; },
            hydrateCell(c)      { seen.push('c'); return c; },
            hydrateFrame(f)     { seen.push('f'); return f; },
            hydrateMetadata(m)  { seen.push('m'); return m; },
            hydrateSettings(s)  { seen.push('S'); return s; },
            hydrateStyles(st)   { seen.push('y'); return st; }
        });
        const result = {
            body: [
                { type: 'paragraph', spans: [{ type: 'span' }] },
                { type: 'heading' },
                { type: 'list' },
                { type: 'table', rows: [{ cells: [{ type: 'cell' }] }] },
                { type: 'frame' }
            ],
            meta: {},
            settings: {},
            styles: {}
        };
        w.applyHydrate(result);
        for (const k of ['p', 's', 'h', 'l', 't', 'c', 'f', 'm', 'S', 'y']) {
            expect(seen).toContain(k);
        }
    });

    test('replaces nodes when hook returns a new value', () => {
        const w = odtWalker.factory(shared).createWalker();
        w.use({ hydrateParagraph: () => ({ type: 'paragraph', flagged: true }) });
        const result = { body: [{ type: 'paragraph' }] };
        w.applyHydrate(result);
        expect(result.body[0].flagged).toBe(true);
    });

    test('dehydrate dispatches mirror hooks', () => {
        const w = odtWalker.factory(shared).createWalker();
        let seen = false;
        w.use({ dehydrateParagraph(p) { seen = true; return p; } });
        const result = { body: [{ type: 'paragraph' }] };
        w.applyDehydrate(result);
        expect(seen).toBe(true);
    });

    test('no-op when no extensions registered', () => {
        const w = odtWalker.factory(shared).createWalker();
        const result = { body: [{ type: 'paragraph' }] };
        w.applyHydrate(result);
        expect(result.body[0].type).toBe('paragraph');
    });
});
