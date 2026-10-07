// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { odsWalker } from './ods-walker.js';
import { odfWalker } from '../_shared/walker.js';

const shared = odfWalker.factory();

describe('odsWalker — factory shape', () => {
    test('factory contract', () => {
        expect(odsWalker.name).toBe('odsWalker');
        expect(odsWalker.dependencies).toEqual(['odfWalker']);
        const w = odsWalker.factory(shared).createWalker();
        expect(typeof w.use).toBe('function');
    });
});

describe('odsWalker — hook dispatch', () => {
    test('visits tables / cells / metadata / settings / styles', () => {
        const w = odsWalker.factory(shared).createWalker();
        const seen = [];
        w.use({
            hydrateTable(t)    { seen.push('T'); return t; },
            hydrateCell(c)     { seen.push('C'); return c; },
            hydrateFrame(f)    { seen.push('F'); return f; },
            hydrateMetadata(m) { seen.push('M'); return m; },
            hydrateSettings(s) { seen.push('S'); return s; },
            hydrateStyles(s)   { seen.push('Y'); return s; }
        });
        const result = {
            spreadsheet: {
                tables: [
                    { type: 'table', rows: [{ cells: [{ type: 'cell' }] }] }
                ]
            },
            meta: {}, settings: {}, styles: {}
        };
        w.applyHydrate(result);
        for (const k of ['T', 'C', 'M', 'S', 'Y']) expect(seen).toContain(k);
    });

    test('use() idempotence', () => {
        const w = odsWalker.factory(shared).createWalker();
        const ext = {};
        w.use(ext); w.use(ext);
        expect(w.extensions.length).toBe(1);
    });
});
