// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import * as main from '../tests/_helpers/build.js';
import { modules } from '../tests/_helpers/build.js';

describe('@awacloud/md main', () => {
    test('re-exports core modules', () => {
        for (const k of ['mdErrors', 'mdAstTypes', 'mdNode',
                          'refsLinkRefs', 'blockParser', 'renderHtmlMod', 'mdMod']) {
            expect(main[k]).toBeDefined();
            expect(typeof main[k].factory).toBe('function');
            expect(main[k].name).toBeDefined();
        }
    });

    test('re-exports classes and façade helpers', () => {
        expect(main.Node).toBeDefined();
        expect(main.Walker).toBeDefined();
        expect(main.md).toBeDefined();
        expect(main.createMd).toBeDefined();
        expect(typeof main.md.parse).toBe('function');
    });

    test('modules array lists factories in dependency order', () => {
        expect(modules.length).toBeGreaterThanOrEqual(7);
        const names = modules.map(m => m.name);
        // dependency-free modules listed before downstream ones
        expect(names.indexOf('mdErrors')).toBeLessThan(names.indexOf('blockParser'));
    });

    test('factories are worker-safe (function-string contains "function")', () => {
        for (const m of modules) {
            expect(m.factory.toString()).toContain('function');
        }
    });
});
