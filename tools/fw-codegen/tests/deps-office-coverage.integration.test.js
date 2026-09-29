// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-office-coverage.integration.test.js
//
// tools/LIGHT_9 task 03 — the pilot design verdict, proved rather than
// asserted. Two questions had to be settled BEFORE office/BATCH_9 generates
// `deps: [...]` companions across the five office packages:
//
//   (a) does a `deps: [<fw module>]` entry double-inject in package mode
//       (`ModuleRuntime`), or change what `resolve` returns?
//   (b) does the standalone/prebuilt path (`@awacloud/tool-prebuild-generator`,
//       fw-bundler `validate-deps`) read `deps` at all?
//
// plus the resolution-coverage proof over the real office trees.
//
// STRICTLY READ-ONLY under `packages/front/**` — the office sources are the
// single-writer perimeter of office/BATCH_9. `planDeps` never writes.

import { describe, test, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';

import { planDeps } from '../src/deps/index.js';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const OFFICE = join(ROOT, 'packages', 'front', 'office');
const PKGS = ['fonts', 'md', 'odf', 'ooxml', 'pdf'];

// ─────────────────────────────────────────────────────────────────────────
// (a) DI double-injection — the office package-mode bootstrap
// ─────────────────────────────────────────────────────────────────────────

describe('deps in package mode — no double injection, no resolution drift', () => {
    /**
     * Mirror of `packages/front/office/md/tests/_helpers/build.js`: one
     * package-level runtime, `fw_require` instances registered first, then the
     * package descriptors.
     */
    function bootstrap(pkgModules, fwRequire) {
        const rt = new ModuleRuntime();
        for (const m of fwRequire) rt.register(m);
        for (const m of pkgModules) rt.register(m);
        return rt;
    }

    /** A minimal fw-like module counting its instantiations. */
    function fwModule(counter) {
        return {
            name: 'sanitize',
            dependencies: [],
            factory() { counter.n++; return { kind: 'fw-sanitize' }; },
        };
    }

    test('a descriptor carrying deps:[fwModule] resolves identically to the control', () => {
        const cA = { n: 0 }, cB = { n: 0 };
        const fwA = fwModule(cA), fwB = fwModule(cB);

        // Control: the office status quo — string `dependencies` only.
        const control = { name: 'mdMod', dependencies: ['sanitize'], factory: (s) => ({ s }) };
        // Candidate: what the generator will write.
        const candidate = { ...control, deps: [fwB] };

        const rtA = bootstrap([control], [fwA]);
        const rtB = bootstrap([candidate], [fwB]);

        expect(rtB.resolve('mdMod')).toEqual(rtA.resolve('mdMod'));
        expect(rtB.resolve('mdMod').s).toBe(rtB.resolve('sanitize'));  // same instance
        expect(cA.n).toBe(1);
        expect(cB.n).toBe(1);                                          // single instantiation
    });

    test('registerAllDeep over a deps-carrying descriptor stays single-instance', () => {
        const c = { n: 0 };
        const fw = fwModule(c);
        const mod = { name: 'mdMod', dependencies: ['sanitize'], deps: [fw], factory: (s) => ({ s }) };

        const rt = new ModuleRuntime();
        rt.register(fw);                       // fw_require, as office does
        rt.registerAllDeep([mod]);             // deps walk finds `sanitize` already registered
        expect(rt.resolve('mdMod').s).toBe(rt.resolve('sanitize'));
        expect(c.n).toBe(1);
    });

    test('deps is not part of the resolution contract (resolve reads dependencies)', () => {
        // A deliberately WRONG `deps` reference must not influence resolution —
        // proof that `deps` is a build-time mirror, inert at runtime.
        const real = { name: 'sanitize', dependencies: [], factory: () => 'REAL' };
        const decoy = { name: 'decoy', dependencies: [], factory: () => 'DECOY' };
        const mod = { name: 'mdMod', dependencies: ['sanitize'], deps: [decoy], factory: (s) => s };

        const rt = new ModuleRuntime();
        rt.register(real);
        rt.register(mod);
        expect(rt.resolve('mdMod')).toBe('REAL');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// (b) standalone / prebuilt inlining
// ─────────────────────────────────────────────────────────────────────────

describe('deps and the prebuilt/standalone path', () => {
    test('the prebuild generator serializes `dependencies` only — `deps` is never read', () => {
        const src = readFileSync(join(ROOT, 'tools', 'prebuild-generator', 'src', 'index.mjs'), 'utf8');
        // The single descriptor-serialization site (index.mjs ~325).
        expect(src).toContain('const deps = JSON.stringify(def.dependencies || []);');
        // No read of a descriptor's own `deps` field anywhere.
        expect(src).not.toMatch(/def\s*\.\s*deps\b/);
        expect(src).not.toMatch(/\bm\s*\.\s*deps\b/);
    });

    test('fw-bundler validate-deps is not on the office path (no bundle script)', () => {
        for (const p of PKGS) {
            const manifest = JSON.parse(readFileSync(join(OFFICE, p, 'package.json'), 'utf8'));
            const scripts = Object.values(manifest.scripts ?? {}).join(' ');
            expect(scripts).not.toContain('fw-bundler');
            expect(scripts).toContain('fw-codegen deps --check');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────
// (c) resolution-coverage proof over the real office trees (read-only)
// ─────────────────────────────────────────────────────────────────────────

describe('office resolution coverage (read-only)', () => {
    test.each(PKGS)('%s — every dependency name resolves (default ignore)', (p) => {
        const pkg = join(OFFICE, p);
        expect(existsSync(join(pkg, 'src'))).toBe(true);
        const { plan, unresolved, ignored } = planDeps({ pkg });

        // Generated bundles are ignored only where the `src/bundles/prebuilt/`
        // subtree actually exists. Measured: none of the five office packages
        // currently ships one, so asserting `ignored.length > 0`
        // unconditionally was unsatisfiable BY CONSTRUCTION — gate on the
        // subtree's real presence instead (skip-with-reason otherwise).
        const hasPrebuilt = existsSync(join(pkg, 'src', 'bundles', 'prebuilt'));
        if (hasPrebuilt) {
            expect(ignored.length).toBeGreaterThan(0);
            expect(ignored.every((f) => f.replace(/\\/g, '/').includes('/src/bundles/prebuilt/'))).toBe(true);
        } else {
            expect(ignored).toEqual([]);
        }

        // All five resolve since addendum A2 (LIGHT_10) taught the resolver to
        // follow `pkg_require` namespace spreads into a sibling package. Before
        // it, pdf pinned `['pdfFontEmbed']` here — the gap this test measured.
        expect(unresolved).toEqual([]);

        // Plan counts are execution-time facts that DROP TO 0 once
        // office/BATCH_9 applies the generation — never assert them here.
        expect(plan.length).toBeGreaterThanOrEqual(0);
    });

    test('pdf — the cross-package deps target PUBLIC @awacloud/fonts subpaths', () => {
        // office/BATCH_9 has since applied `pdfFontEmbed`'s deps: `planDeps`
        // no longer plans it (`rewriteFile` short-circuits on
        // `info.hasDepsField`). Delivered-state assertion against the
        // committed source, same rule as deps-binding's office-proof suite.
        const file = join(OFFICE, 'pdf', 'src', 'font', 'embed.js');
        const src = readFileSync(file, 'utf8');

        // Public export subpaths, never a relative reach into fonts' src/.
        // BOTH specifier forms are legitimate and `fonts` exports both: the explicit
        // extensionless subpaths (`"./embed-pdf/subsetForPdf"`) AND the wildcard
        // `"./embed-pdf/*.js"`. The invariant this test carries is the PUBLIC subpath,
        // not which of the two forms the importer picked — so accept either.
        const lines = src.split(/\r?\n/).map((l) => l.trim());
        for (const name of ['subsetForPdf', 'fontDescriptor', 'cidSystemInfo', 'toUnicodeBuilder']) {
            const Name = `${name[0].toUpperCase()}${name.slice(1)}`;
            const stem = `import { embed${Name} } from '@awacloud/fonts/embed-pdf/${name}`;
            const actual = lines.find((l) => l.startsWith(`import { embed${Name} }`)) ?? '(no import found)';
            expect([`${stem}';`, `${stem}.js';`]).toContain(actual);
        }
        expect(src).not.toMatch(/from\s+['"]\.\.\/\.\.\/fonts\//);

        // `deps` mirrors `dependencies` in order (the invariant validate-deps checks).
        const dependencies = src.match(/dependencies:\s*\[([^\]]*)\]/)[1]
            .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        const deps = src.match(/deps:\s*\[([^\]]*)\]/)[1]
            .split(',').map((s) => s.trim()).filter(Boolean);
        expect(deps).toEqual(dependencies);
    });
});
