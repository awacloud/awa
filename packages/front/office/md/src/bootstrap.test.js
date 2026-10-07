// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { bootstrapMd } from './bootstrap.js';

describe('bootstrapMd', () => {
    test('returns { runtime, resolve, md, mdFull } wired end-to-end', () => {
        const b = bootstrapMd();
        expect(b.runtime).toBeInstanceOf(ModuleRuntime);
        expect(typeof b.resolve).toBe('function');
        expect(b.md.renderHtml('# Hi\n')).toBe('<h1>Hi</h1>\n');
        expect(b.mdFull.renderHtml('==m==\n')).toContain('<mark>');
    });

    test('registers the extras: resolve("mdToc").slugify works', () => {
        const b = bootstrapMd();
        expect(b.resolve('mdToc').slugify('A b')).toBe('a-b');
    });

    test('laziness: bootstrapMd itself never calls runtime.resolve', () => {
        const runtime = new ModuleRuntime();
        let calls = 0;
        const originalResolve = runtime.resolve.bind(runtime);
        runtime.resolve = (...args) => { calls++; return originalResolve(...args); };

        const b = bootstrapMd({ runtime });
        expect(calls).toBe(0);

        // Accessing a getter triggers resolution.
        expect(b.md).toBeDefined();
        expect(calls).toBeGreaterThan(0);
    });

    test('host runtime: registers on the supplied runtime, is idempotent, and a fresh call isolates', () => {
        const r = new ModuleRuntime();
        const b1 = bootstrapMd({ runtime: r });
        expect(b1.runtime).toBe(r);
        expect(r.has('md')).toBe(true);

        // Calling bootstrapMd a second time on the same runtime must not throw
        // (ModuleRuntime.register replaces a same-name/same-version entry).
        expect(() => bootstrapMd({ runtime: r })).not.toThrow();

        // A fresh call with no opts returns a DIFFERENT runtime.
        const b2 = bootstrapMd();
        expect(b2.runtime).not.toBe(r);
    });

    test('htmlDocument getter: build() returns a complete HTML document', () => {
        const { html } = bootstrapMd().htmlDocument.build({ documents: [{ path: 'a.md', source: '# A\n' }] });
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    });

    test('bootstrapMd({ runtime: {} }) throws TypeError', () => {
        expect(() => bootstrapMd({ runtime: {} })).toThrow(TypeError);
        expect(() => bootstrapMd({ runtime: {} })).toThrow(/opts\.runtime must be a ModuleRuntime/);
    });

    test('importing the module has no side effect', async () => {
        const mod = await import('./bootstrap.js');
        expect(Object.keys(mod)).toEqual(['bootstrapMd']);
    });

    // import-map regime: `@awacloud/fw/core/runtime.js` is `.js`-suffixed
    // (the BL-1098 guard shape — a bare-extension-less specifier resolves
    // fine under Bun's exports map but 404s under the browser's flat
    // import-map convention).
    test('import-map regime: the fw runtime specifier is .js-suffixed', () => {
        const src = readFileSync(new URL('./bootstrap.js', import.meta.url), 'utf8');
        expect(src).toMatch(/from ['"]@awacloud\/fw\/core\/runtime\.js['"]/);
    });
});
