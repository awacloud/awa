#!/usr/bin/env node
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Generate the committed two-surface build of `@awacloud/md`.
 *
 * Thin wrapper around `@awacloud/tool-prebuild-generator`. The generator contract
 * (`fw_require`, `modules`, `extras`, `bundle`) lives in `src/main.js`; this
 * driver only invokes the generator and lays out the frozen `dist/` output.
 *
 * Per assembly root (`md`, `md-full`) two path-discriminated surfaces are
 * emitted, plus a single fw-mode barrel:
 *
 *   - `dist/standalone/<root>.js` — generator **bundled** variant:
 *     `dependencies: []`, every reachable fw factory inlined. Needs nothing
 *     at runtime (`@awacloud/md/standalone/<root>.js`). `factory.toString()`
 *     serializability is preserved (Worker-safe) by construction.
 *   - `dist/build/<root>.js` — generator **package** variant: declares the fw
 *     modules as `dependencies`, fw NOT inlined (DI-injected). Needs an
 *     `@awacloud/fw` runtime (`@awacloud/md/build/<root>.js`).
 *   - `dist/build/index.js` — fw-mode barrel: re-exports the whole
 *     `src/main.js` namespace (the four arrays + every named descriptor),
 *     for registration on an `@awacloud/fw` runtime.
 *
 * Each `.js` has a minified `.min.js` twin (`Bun.build {minify:true}`; the
 * banner comment is re-prepended verbatim, not trusted to survive
 * minification) and a `.meta.json` sidecar whose `fwDependencies` is READ
 * BACK from the generated descriptor, never hardcoded.
 *
 * Clause (iv) vs the retired `generate-prebuilds.mjs`: the dead
 * `import { HTML_ENTITIES_JSON } from '@awacloud/fw/io/text/html-entities-data.js'`
 * and the `htmlEntities` `closureCaptures` entry are DROPPED — fw's
 * `htmlEntities` factory inlines its JSON in-factory (BATCH_42 worker-safety
 * design), so office needs no fw data module. The `inlineParserBuilder`
 * rewrite `closureCapture` STAYS (it rewrites the descriptor resolution,
 * unrelated to html-entities).
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
 * @module md/tools/generate-bundles
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';

import { generatePrebuilds, buildLocalRegistry, topoLocal } from '@awacloud/tool-prebuild-generator';
import * as md from '../src/main.js';

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
// `Source: packages/front/office/md/tools/generate-bundles.mjs`.
const DRIVER = 'packages/front/office/md/tools/generate-bundles.mjs';

// The row's licence banner, rendered ONCE before any output is written, so a
// missing licence-matrix row fails closed with no partial `dist/`. The row is
// named by DRIVER's package directory — never by PKG, which is a staging path
// when `pkg-export build` runs this driver.
const LICENCE_BANNER = officeLicenceBanner(dirname(dirname(DRIVER)));

// Clause (iv): only the `inlineParserBuilder` rewrite survives; the
// `htmlEntities` IIFE prelude is gone (fw inlines its JSON in-factory).
const inlineParserBuilderRewrite = `function (errors, common, regex, helpers, escapes, codeSpan, autolink, autolinkExt, delimiterStack, link, lineBreak, sourcepos) {
        const inlineParserDesc = __reg['inlineParser'];
        return function (opts) {
            return inlineParserDesc.factory(errors, common, regex, helpers, escapes, codeSpan, autolink, autolinkExt, delimiterStack, link, lineBreak, sourcepos, opts || {});
        };
    }`;

const closureCaptures = {
    inlineParserBuilder: {
        kind: 'rewrite',
        factorySrc: inlineParserBuilderRewrite
    }
};

// ── Assembly roots ───────────────────────────────────────────────────────────
//
// Two roots (frozen, Axis 3). `md` is the bare core; `md-full` is the core
// plus every opt-in extra (the `mdFullBundle` layering). The generator derives
// both from `src/main.js`'s single `bundle` entry, so both surfaces come out of
// ONE `generatePrebuilds` call per variant.

const fwNames       = md.fw_require.map(m => m.name);
const localRegistry = buildLocalRegistry(md.modules, md.extras);

/** Per-root local-module closure roots, for the `meta.json` `modules` field. */
const ROOT_SPECS = {
    'md':      ['md'],
    'md-full': md.bundle[0].dependencies   // ['md', ...extras]
};

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
    // Generate both roots of this variant into a scratch dir, then relocate to
    // the discriminated surface directory under `dist/`. The generator names
    // files `<root>-<variant>.js`; the committed name drops the variant suffix
    // (the surface directory carries the discriminator).
    const tmpDir = mkdtempSync(join(tmpdir(), `md-${generatorVariant}-`));
    generatePrebuilds({
        packageMain:  md,
        outDir:       tmpDir,
        packageLabel: 'md',
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
            package:        '@awacloud/md',
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
// Re-exports the whole `src/main.js` namespace (the four arrays plus every
// named descriptor added by clause vi), for registration on an `@awacloud/fw`
// runtime. Authored deterministically (byte-stable).

const barrel = [
    `/* GENERATED — do not edit. Source: ${DRIVER} */`,
    '',
    '/**',
    ' * @fileoverview `@awacloud/md/build` — fw-mode barrel.',
    ' *',
    ' * Re-exports the whole `@awacloud/md` main namespace: the four registration',
    ' * arrays (`fw_require`, `modules`, `extras`, `bundle`) and every individual',
    ' * module descriptor. Consumers register these on their own `@awacloud/fw`',
    ' * runtime. The framework-free counterpart lives under `dist/standalone/`.',
    ' *',
    ' * @module md/build',
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
