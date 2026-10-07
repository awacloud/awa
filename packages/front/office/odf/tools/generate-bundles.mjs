#!/usr/bin/env node
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Generate the committed two-surface build of `@awacloud/odf`.
 *
 * Thin wrapper around `@awacloud/tool-prebuild-generator`. The generator contract
 * (`fw_require`, `modules`, `extras`, `bundle`) lives in `src/main.js`; this
 * driver only invokes the generator and lays out the frozen `dist/` output.
 *
 * Per assembly root (9 : `odt`, `odt-large`, `odt-full`, `ods`, `ods-large`,
 * `ods-full`, `odp`, `odp-large`, `odp-full`) two path-discriminated surfaces
 * are emitted, plus a single fw-mode barrel :
 *
 *   - `dist/standalone/<root>.js` — generator **bundled** variant :
 *     `dependencies: []`, every reachable fw factory inlined. Needs nothing
 *     at runtime (`@awacloud/odf/standalone/<root>.js`). `factory.toString()`
 *     serializability is preserved (Worker-safe) by construction.
 *   - `dist/build/<root>.js` — generator **package** variant : declares the
 *     fw modules as `dependencies`, fw NOT inlined (DI-injected). Needs an
 *     `@awacloud/fw` runtime (`@awacloud/odf/build/<root>.js`).
 *   - `dist/build/index.js` — fw-mode barrel : re-exports the whole
 *     `src/main.js` namespace (the four arrays + every named descriptor),
 *     for registration on an `@awacloud/fw` runtime.
 *
 * Each `.js` has a minified `.min.js` twin (`Bun.build {minify:true}`; the
 * banner comment is re-prepended verbatim, not trusted to survive
 * minification) and a `.meta.json` sidecar whose `fwDependencies` is READ
 * BACK from the generated descriptor, never hardcoded.
 *
 * Clause (iv) N/A for `@awacloud/odf` — the retired `generate-prebuilds.mjs` used
 * no `closureCaptures` special-casing (odf has no non-strict-factory-only
 * module needing a rewrite/IIFE, unlike md's `htmlEntities`/
 * `inlineParserBuilder`), so `closureCaptures` stays `{}` here.
 *
 * The 9 roots are NOT hand-listed : they are derived from `src/main.js`'s
 * `bundle` array exactly the way `generatePrebuilds` itself derives its
 * internal plan (bare cores first, then each bundle entry) — `flatten()`
 * below mirrors that internal algorithm so `ROOT_SPECS`'s per-root local
 * closure roots (used for the `meta.json` `modules` field) match the
 * generator's own file plan.
 *
 * Re-run via `bun run gen:bundles`. Output is deterministic: byte-identical
 * across runs — no timestamp (the `builtAt` stamp was dropped, BL-1578).
 *
 * Licence banner (BL-1578): every emitted `.js` / `.min.js` (the barrel
 * included) opens with the row's `/*! … *\/` legal block at byte 0, then the
 * `GENERATED` comment. Rendered by the shared
 * `packages/front/office/_tools/licence-banner.mjs`; each `*.meta.json`
 * `bytes` entry is measured on those final bytes.
 *
 * @module odf/tools/generate-bundles
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';

import { generatePrebuilds, buildLocalRegistry, topoLocal, kebabCase, stripBundleSuffix } from '@awacloud/tool-prebuild-generator';
import * as odf from '../src/main.js';

const HERE       = dirname(fileURLToPath(import.meta.url));
const PKG        = join(HERE, '..');
const STANDALONE = join(PKG, 'dist', 'standalone');
const BUILD      = join(PKG, 'dist', 'build');

// Licence banner (BL-1578) — the shared helper
// `packages/front/office/_tools/licence-banner.mjs` (content from pkg-export's
// `licenceBannerLines`, form from fw-bundler's `renderBanner`). It is located
// from the WORKSPACE ROOT, not relative to this file: `pkg-export build` runs
// this driver inside a staged copy of the package (under the workspace root),
// where no sibling `../../_tools/` exists.
const { officeLicenceBanner, writeBannered } = await import(
    pathToFileURL(join(workspaceRoot(PKG), 'packages', 'front', 'office', '_tools', 'licence-banner.mjs')).href
);

/** Nearest ancestor of `from` whose `package.json` declares `workspaces`. */
function workspaceRoot(from) {
    for (let d = from; ; d = dirname(d)) {
        const pj = join(d, 'package.json');
        if (existsSync(pj) && Array.isArray(JSON.parse(readFileSync(pj, 'utf8')).workspaces)) return d;
        if (dirname(d) === d) throw new Error(`generate-bundles: no workspace root above ${from}`);
    }
}

// Banner discriminator (clause ii): every generated file names THIS driver as
// its source, so the GENERATED banner reads
// `Source: packages/front/office/odf/tools/generate-bundles.mjs`.
const DRIVER = 'packages/front/office/odf/tools/generate-bundles.mjs';

// The row's licence banner, rendered ONCE before any output is written, so a
// missing licence-matrix row fails closed with no partial `dist/`. The row is
// named by DRIVER's package directory — never by PKG, which is a staging path
// when `pkg-export build` runs this driver.
const LICENCE_BANNER = officeLicenceBanner(dirname(dirname(DRIVER)));

// Clause (iv) N/A — no special-case rewrites needed for odf's factories.
const closureCaptures = {};

// ── Assembly roots ───────────────────────────────────────────────────────────
//
// 9 roots (frozen, Axis 3): `odt`,`odt-large`,`odt-full`,`ods`,`ods-large`,
// `ods-full`,`odp`,`odp-large`,`odp-full`. Derived from `src/main.js`'s
// `bundle` array (6 entries) plus their 3 bare cores, mirroring the internal
// plan `generatePrebuilds` itself builds from the same array.

const fwNames       = odf.fw_require.map(m => m.name);
const localRegistry = buildLocalRegistry(odf.modules, odf.extras);

const bundleByName = Object.create(null);
for (const b of odf.bundle) bundleByName[b.name] = b;

/**
 * Flatten a bundle's `dependencies` into `{ coreName, extras }`, following
 * `dependencies[0]` recursively while it names another bundle (e.g.
 * `odtFullBundle`'s head is `odtLargeBundle`, not a bare core). Mirrors
 * `generatePrebuilds`'s internal (unexported) `flatten`.
 */
function flatten(b) {
    const head = b.dependencies[0];
    const tail = b.dependencies.slice(1);
    if (bundleByName[head]) {
        const parent = flatten(bundleByName[head]);
        return { coreName: parent.coreName, extras: [...parent.extras, ...tail] };
    }
    return { coreName: head, extras: tail };
}

/** Per-root local-module closure roots, for the `meta.json` `modules` field. */
const ROOT_SPECS = {};
const seenCores = new Set();
for (const b of odf.bundle) {
    const { coreName } = flatten(b);
    if (!seenCores.has(coreName)) {
        seenCores.add(coreName);
        ROOT_SPECS[coreName] = [coreName];
    }
}
for (const b of odf.bundle) {
    const { coreName, extras } = flatten(b);
    const id = kebabCase(stripBundleSuffix(b.name));
    ROOT_SPECS[id] = [coreName, ...extras];
}

/**
 * Generator variant → committed surface. `bundled` inlines fw
 * (`dependencies: []`), `package` DI-injects it.
 */
const SURFACES = [
    { generatorVariant: 'bundled', dir: STANDALONE, metaVariant: 'standalone' },
    { generatorVariant: 'package', dir: BUILD,      metaVariant: 'fw' }
];

if (!existsSync(STANDALONE)) mkdirSync(STANDALONE, { recursive: true });
if (!existsSync(BUILD))      mkdirSync(BUILD,      { recursive: true });

const written = [];

for (const { generatorVariant, dir, metaVariant } of SURFACES) {
    // Generate all 9 roots of this variant into a scratch dir, then relocate
    // to the discriminated surface directory under `dist/`. The generator
    // names files `<root>-<variant>.js`; the committed name drops the
    // variant suffix (the surface directory carries the discriminator).
    const tmpDir = mkdtempSync(join(tmpdir(), `odf-${generatorVariant}-`));
    generatePrebuilds({
        packageMain:  odf,
        outDir:       tmpDir,
        packageLabel: 'odf',
        variants:     [generatorVariant],
        closureCaptures,
        driver:       DRIVER
    });

    for (const root of Object.keys(ROOT_SPECS)) {
        const generatedJs = readFileSync(join(tmpDir, `${root}-${generatorVariant}.js`), 'utf8');

        const jsPath = join(dir, `${root}.js`);
        writeFileSync(jsPath, generatedJs);

        // Minify: `generatePrebuilds` has no minify path, so fall back to
        // `Bun.build({minify:true})`. The banner is a plain comment a generic
        // minifier is free to drop, so it is re-prepended verbatim from the
        // unminified file rather than trusted to survive minification.
        const bannerLine   = generatedJs.slice(0, generatedJs.indexOf('\n') + 1);
        const minifyResult = await Bun.build({
            entrypoints: [jsPath],
            target:      'browser',
            format:      'esm',
            minify:      true
        });
        if (!minifyResult.success) {
            throw new Error(`generate-bundles: ${metaVariant}/${root} minify failed:\n${minifyResult.logs.map(l => l.message).join('\n')}`);
        }
        const minJs   = bannerLine + (await minifyResult.outputs[0].text());
        const minPath = join(dir, `${root}.min.js`);

        // Licence banner at byte 0 of both files, written AFTER minification
        // (the minifier read the un-bannered `.js` at its stable path above, so
        // the minified body is unchanged); the byte counts are the FINAL sizes.
        const devBytes = writeBannered(jsPath,  LICENCE_BANNER, generatedJs);
        const minBytes = writeBannered(minPath, LICENCE_BANNER, minJs);

        // `fwDependencies` is READ BACK from the generated descriptor itself
        // (never hardcoded): `[]` for the standalone variant, the declared fw
        // names for the fw variant.
        const emitted    = await import(pathToFileURL(jsPath).href);
        const exportName = Object.keys(emitted).find(k => k !== 'default');
        const descriptor = emitted[exportName];

        const meta = {
            kind:           'build',
            variant:        metaVariant,
            name:           root,
            package:        '@awacloud/odf',
            modules:        topoLocal(ROOT_SPECS[root], localRegistry, fwNames),
            fwDependencies: [...descriptor.dependencies],
            bytes:          {
                dev: devBytes,
                min: minBytes
            },
            builtBy:        '@awacloud/tool-prebuild-generator via tools/generate-bundles.mjs'
        };
        const metaPath = join(dir, `${root}.meta.json`);
        writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

        written.push(`${metaVariant}/${root}.{js,min.js,meta.json}`);
    }

    rmSync(tmpDir, { recursive: true, force: true });
}

// ── dist/build/index.js — the fw-mode barrel ─────────────────────────────────
//
// Re-exports the whole `src/main.js` namespace (the four registration arrays
// plus every named descriptor added by clause vi), for registration on an
// `@awacloud/fw` runtime. Authored deterministically (byte-stable).

const barrel = [
    `/* GENERATED — do not edit. Source: ${DRIVER} */`,
    '',
    '/**',
    ' * @fileoverview `@awacloud/odf/build` — fw-mode barrel.',
    ' *',
    ' * Re-exports the whole `@awacloud/odf` main namespace: the four registration',
    ' * arrays (`fw_require`, `modules`, `extras`, `bundle`) and every individual',
    ' * module descriptor. Consumers register these on their own `@awacloud/fw`',
    ' * runtime. The framework-free counterpart lives under `dist/standalone/`.',
    ' *',
    ' * @module odf/build',
    ' */',
    '',
    "export * from '../../src/main.js';",
    ''
].join('\n');

const barrelPath = join(BUILD, 'index.js');
writeBannered(barrelPath, LICENCE_BANNER, barrel);

// ── Report ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-console
console.log(`generate-bundles: wrote ${written.join(' + ')}`);
// eslint-disable-next-line no-console
console.log(`generate-bundles: wrote build barrel ${barrelPath.split(/[\\/]/).slice(-3).join('/')}`);
