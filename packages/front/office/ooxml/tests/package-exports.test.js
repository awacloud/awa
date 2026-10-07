// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Validates every sub-path declared in `package.json#exports` resolves
 * and exposes at least one named export. Guards against a future
 * rename / move silently breaking the public API surface.
 */
import { describe, test, expect } from 'bun:test';
import pkg from '../package.json' with { type: 'json' };

const EXPORTS = pkg.exports;

// Sub-paths to probe directly (no wildcards).
const DIRECT = Object.keys(EXPORTS).filter(k => !k.includes('*'));

// A representative sample of wildcard-matched modules to ensure the
// wildcard mapping is wired (file presence + ESM-importable).
const WILDCARD_SAMPLES = [
    './extra/wml-run-formatting',
    './extra/sml-calculation',
    './extra/pml-animations',
    './extra/dml-effects',
    './extra/math-advanced',
    './bundles/docx-large',
    './bundles/xlsx-large',
    './bundles/pptx-large'
];

describe('package.json#exports — sub-path integrity', () => {
    for (const subpath of DIRECT) {
        test(`'${subpath}' resolves and exposes named exports`, async () => {
            const target = EXPORTS[subpath];
            const mod = await import('../' + target);
            // Must expose at least one named export beyond `default`.
            const named = Object.keys(mod).filter(k => k !== 'default');
            expect(named.length).toBeGreaterThan(0);
        });
    }

    for (const subpath of WILDCARD_SAMPLES) {
        test(`'${subpath}' (wildcard) resolves`, async () => {
            // Translate via the wildcard mapping declared in package.json.
            const wildKey = subpath.startsWith('./extra/')
                ? './extra/*' : './bundles/*';
            const template = EXPORTS[wildKey];
            const star = subpath.slice(wildKey.length - 1);
            const target = template.replace('*', star);
            const mod = await import('../' + target);
            const named = Object.keys(mod).filter(k => k !== 'default');
            expect(named.length).toBeGreaterThan(0);
        });
    }
});
