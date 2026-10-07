// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Wiring guard — asserts that the descriptor manifest exported by
 * `src/main.js` is dependency-closed: every module declared in
 * `fw_require` / `modules` / `extras` / `bundle` can be resolved through
 * fw's `ModuleRuntime` with no missing dependency. Mirrors
 * `@awacloud/md/tests/wiring.integration.test.js`.
 *
 * Rationale (ai/memory/types/office.md 2026-06-12): when a composed
 * package's manifest gains a new transitive dependency, `main.js` must
 * register the provider too, or `ModuleRuntime.resolve` throws "Module not
 * found: <dep>" the first time a consumer actually calls `resolve()` —
 * which, for a `const`-exported instance built at module top level, can
 * surface as an opaque TDZ instead of a clean error. This test fails with
 * the explicit message instead.
 *
 * A second block ("specifier pin") pins the bare specifiers and
 * runtime-module names this task's `main.js` actually binds to
 * (`ai/plans/oconv/spikes/w0-core/FINDINGS.md` §Import specifiers,
 * extended by BATCH_14 W2) — a rename upstream in `@awacloud/ooxml`/`@awacloud/odf`/
 * `@awacloud/md`/`@awacloud/pdf`/`@awacloud/fonts`/`@awacloud/fw` fails HERE rather than being
 * discovered later.
 *
 * A THIRD note (office memory 2026-07-22, load-bearing for the "resolve
 * every registered module" test below): this manifest's `modules` array
 * carries `@awacloud/pdf`'s `pkg_require`, which pulls in `@awacloud/fonts`' WHOLE
 * `fw_require` + `modules` so `@awacloud/pdf`'s own font-glue modules resolve.
 * `@awacloud/fonts`' OWN `fw_require` USED TO have a genuinely incomplete
 * `brotli` closure (`brotli` itself needs `lz77`/`brotliDict`/
 * `brotliDictWords`, none of which `@awacloud/fonts` registered) — fixed
 * upstream by office/BATCH_40 task 04 (BL-32): `@awacloud/fonts`'
 * `fw_require` is now dependency-closed, so `brotli` and `fontWoff2`
 * resolve through this manifest too. The "resolve everything" test below
 * therefore covers the WHOLE `ALL` array, no exclusion. BL-1736
 * (office/BATCH_47 task 01): `@awacloud/md`'s `modules` carries
 * `mdHtmlDocument`, whose dependencies include four OPT-IN extras (`mdToc`,
 * `mdFrontmatter`, `mdFootnotes`, `mdAdmonitions`) that live only in md's
 * `extras` — `main.js` now spreads md's `extras` right after its `modules`
 * (the explicit `mdFrontmatter` element moved into that spread), so the
 * same whole-array test is closed again; the BL-1736 leg pins the
 * `mdHtmlDocument` resolution and the name-uniqueness leg pins that the
 * non-de-duplicated `modules` array lists no descriptor twice.
 */
import { describe, test, expect } from 'bun:test';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules, extras, bundle } from '../src/main.js';

const ALL = [...fw_require, ...modules, ...extras, ...bundle];

describe('oconv wiring — manifest is dependency-closed', () => {
    test('every descriptor exposes a string name', () => {
        for (const m of ALL) expect(typeof m.name).toBe('string');
    });

    test('runtime resolves every registered module', () => {
        const rt = new ModuleRuntime();
        for (const m of ALL) rt.register(m);
        for (const m of ALL) {
            expect(() => rt.resolve(m.name)).not.toThrow();
        }
    });

    test('brotli and fontWoff2 resolve (fonts closure fixed, office/BATCH_40/04)', () => {
        const rt = new ModuleRuntime();
        for (const m of ALL) rt.register(m);
        expect(() => rt.resolve('brotli')).not.toThrow();
        expect(() => rt.resolve('fontWoff2')).not.toThrow();
    });

    test('runtime resolves the facade and worker entry points, every input format', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        expect(() => rt.resolve('oconv')).not.toThrow();
        for (const name of [
            'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf', 'md', 'mdNode'
        ]) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
    });

    test('the pdf/fonts runtime-module names the new pdf read layer depends on resolve', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        for (const name of [
            'pdfParser', 'pdfFont', 'pdfFontEncoding', 'pdfFilterDispatch',
            'pdfResources', 'pdfContentStream', 'pdfStructTree',
            'cmapToUnicode', 'encodingLookup', 'encodingAgl'
        ]) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
        // task 01's fix: pdfParser's factory returns `tokenize`, making
        // `pdfContentStream.parseContentStream` reachable through the
        // public graph (office memory 2026-07-22).
        expect(typeof rt.resolve('pdfParser').tokenize).toBe('function');
    });

    // office/BATCH_33 task 07 — the `md → pdf` bounded-typesetter family is
    // registered HERE (single registration point of the batch). Ten local
    // descriptors plus the two upstream names they newly reach.
    test('the md → pdf writer family resolves, in dependency order', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        for (const name of [
            'oconvPdfMetrics', 'oconvPdfBox', 'oconvPdfLinebreak', 'oconvPdfStack',
            'oconvPdfRenderText',
            'oconvPdfRenderList', 'oconvPdfRenderCode',
            'oconvPdfRenderTable', 'oconvPdfRenderImage',
            // office/BATCH_38 task 04 (G-OF1): the `0.0.0` stand-in the
            // facade depends on by name — the order guard below covers it.
            'oconvDefaultFaces',
            'oconvIrToPdf'
        ]) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
        // The two upstream write-side names the family adds to oconv's own
        // reachable graph — both already registered through `@awacloud/pdf`'s
        // `pkg_require`/`modules` spreads, so NO new bare specifier was
        // introduced (the specifier-pin block below is unchanged in kind).
        for (const name of ['pdfBuilder', 'pdfFontEmbed', 'standard14Lookup', 'fonts']) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
        expect(typeof rt.resolve('oconvIrToPdf').irToPdf).toBe('function');
        // The registration ORDER guard: every dependency of a local pdf
        // descriptor is registered BEFORE it in `modules`.
        const order = new Map(modules.map((m, i) => [m.name, i]));
        for (const m of modules) {
            if (!m.name.startsWith('oconvPdf') && m.name !== 'oconvIrToPdf') continue;
            for (const dep of m.dependencies || []) {
                expect(order.get(dep)).toBeLessThan(order.get(m.name));
            }
        }
    });

    test('md extras are registered and mdHtmlDocument resolves through oconv (BL-1736)', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        for (const name of ['mdToc', 'mdFootnotes', 'mdAdmonitions', 'mdFrontmatter', 'mdHtmlDocument']) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
        expect(typeof rt.resolve('mdHtmlDocument').build).toBe('function');
    });

    test('modules lists every descriptor name exactly once', () => {
        const names = modules.map((m) => m.name);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('oconv wiring — specifier pin (frozen import surface)', () => {
    test('the bare specifiers this task binds to resolve', async () => {
        const fwRuntime = await import('@awacloud/fw/core/runtime.js');
        expect(typeof fwRuntime.ModuleRuntime).toBe('function');

        const ooxml = await import('@awacloud/ooxml');
        expect(Array.isArray(ooxml.fw_require)).toBe(true);
        expect(Array.isArray(ooxml.modules)).toBe(true);

        const md = await import('@awacloud/md');
        expect(Array.isArray(md.fw_require)).toBe(true);
        expect(Array.isArray(md.modules)).toBe(true);

        const odf = await import('@awacloud/odf');
        expect(Array.isArray(odf.fw_require)).toBe(true);
        expect(Array.isArray(odf.modules)).toBe(true);

        const pdf = await import('@awacloud/pdf');
        expect(Array.isArray(pdf.fw_require)).toBe(true);
        expect(Array.isArray(pdf.pkg_require)).toBe(true);
        expect(Array.isArray(pdf.modules)).toBe(true);
    });

    test('the pinned runtime-module names resolve (docx, odt, xlsx, ods, pptx, odp, pdf, md, mdNode, opcPackage)', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll(modules);
        for (const name of [
            'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf',
            'md', 'mdNode', 'opcPackage'
        ]) {
            expect(() => rt.resolve(name)).not.toThrow();
        }
    });

    // office/BATCH_33 task 07 — NO new bare specifier. The pdf-writer family
    // resolves `standard14Lookup` / `fonts` / `pdfBuilder` / `pdfFontEmbed`
    // BY NAME through the runtime, and `main.js` binds them from the two
    // specifiers this file already pins (`@awacloud/pdf`, `@awacloud/fonts`)
    // for `fw-codegen deps` only. This test is what makes that a fact rather
    // than a claim.
    test('the pdf-writer family adds NO new bare specifier — only names on the pinned two', async () => {
        const fonts = await import('@awacloud/fonts');
        expect(typeof fonts.standard14Lookup).toBe('object');
        expect(typeof fonts.fonts).toBe('object');

        const pdf = await import('@awacloud/pdf');
        expect(typeof pdf.pdfBuilder).toBe('object');
        expect(typeof pdf.pdfFontEmbed).toBe('object');

        const src = await Bun.file(`${import.meta.dir}/../src/main.js`).text();
        const specifiers = new Set(
            [...src.matchAll(/from\s+'([^']+)'/g)]
                .map((m) => m[1])
                .filter((s) => !s.startsWith('.'))
        );
        expect([...specifiers].sort()).toEqual([
            '@awacloud/fonts',
            '@awacloud/md',
            '@awacloud/md/extra/frontmatter.js',
            '@awacloud/odf',
            '@awacloud/ooxml',
            '@awacloud/pdf'
        ]);
    });
});
