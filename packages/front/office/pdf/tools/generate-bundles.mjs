#!/usr/bin/env node
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * Generate the committed two-surface build of `@awacloud/pdf`.
 *
 * Thin wrapper around `@awacloud/tool-prebuild-generator`. The generator contract
 * (`fw_require`, `modules`, `extras`, `bundle`) lives in `src/main.js`; this
 * driver only invokes the generator and lays out the frozen `dist/` output.
 *
 * Assembly roots form a **two-family × size-segmentation matrix** (owner
 * ruling 2026-08-04, BL-280). The four historical roots (`pdf`, `pdf-large`,
 * `pdf-full`, `pdf-legacy`) anchor the **Read** family — measured writer-free:
 * none of them reaches a module of the write inventory below. Four `-rw`
 * roots (`pdf-rw`, `pdf-large-rw`, `pdf-full-rw`, `pdf-legacy-rw`) form the
 * **Read+Write** family — the same size segment plus the write inventory. The
 * matrix is strictly ADDITIVE: no historical root loses a module, and the four
 * historical names are frozen (the absence of a discriminator segment IS the
 * Read-family marker; `-rw` is the Read+Write marker).
 *
 * Per assembly root two path-discriminated surfaces are emitted, plus a
 * single fw-mode barrel:
 *
 *   - `dist/standalone/<root>.js` — generator **bundled** variant:
 *     `dependencies: []`, every reachable fw factory inlined. Needs nothing
 *     at runtime (`@awacloud/pdf/standalone/<root>.js`). `factory.toString()`
 *     serializability is preserved (Worker-safe) by construction.
 *   - `dist/build/<root>.js` — generator **package** variant: declares the fw
 *     modules as `dependencies`, fw NOT inlined (DI-injected). Needs an
 *     `@awacloud/fw` runtime (`@awacloud/pdf/build/<root>.js`).
 *   - `dist/build/index.js` — fw-mode barrel: re-exports the whole
 *     `src/main.js` namespace (the four arrays + every named descriptor),
 *     for registration on an `@awacloud/fw` runtime.
 *
 * Each `.js` has a minified `.min.js` twin (`Bun.build {minify:true}`; the
 * banner comment is re-prepended verbatim, not trusted to survive
 * minification) and a `.meta.json` sidecar whose `fwDependencies` is READ
 * BACK from the generated descriptor, never hardcoded.
 *
 * Clause (iv) N/A: no `closureCaptures` hook is required. Since TD-1 the
 * `pdfErrors` factory declares its five error classes inside its own body, so
 * `factory.toString()` is self-contained; the same held true for the retired
 * `generate-prebuilds.mjs`, which passed no `closureCaptures` either.
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
 * @module pdf/tools/generate-bundles
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';

import { generatePrebuilds, buildLocalRegistry, topoLocal } from '@awacloud/tool-prebuild-generator';
import * as pdf from '../src/main.js';

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
// `Source: packages/front/office/pdf/tools/generate-bundles.mjs`.
const DRIVER = 'packages/front/office/pdf/tools/generate-bundles.mjs';

// The row's licence banner, rendered ONCE before any output is written, so a
// missing licence-matrix row fails closed with no partial `dist/`. The row is
// named by DRIVER's package directory — never by PKG, which is a staging path
// when `pkg-export build` runs this driver.
const LICENCE_BANNER = officeLicenceBanner(dirname(dirname(DRIVER)));

// Clause (iv) N/A: the retired `generate-prebuilds.mjs` passed no
// `closureCaptures`, so none carry over. `pdfErrors` (and every other pdf
// factory) is self-contained under `factory.toString()`.
const closureCaptures = {};

// ── Assembly roots ───────────────────────────────────────────────────────────
//
// Size segmentation (frozen, Axis 3): `pdf` is the bare core; `pdf-large` /
// `pdf-full` / `pdf-legacy` are the core plus a layered extra set
// (`pdfLargeBundle` / `pdfFullBundle` / `pdfLegacyBundle`, all declared in
// `src/main.js`).
//
// Family axis (owner ruling 2026-08-04): each size segment ships a Read root
// and a Read+Write root. The four historical roots ARE the Read family —
// measured writer-free against the write inventory below — and stay byte-frozen.
// The `-rw` roots are composed HERE, in the driver, because `src/` is read-only
// for this pass: they are plan-only descriptors (`{ name, dependencies }` is
// all `generatePrebuilds` reads from a `bundle` entry) and are deliberately NOT
// added to `src/main.js#bundle`, so `runtime.resolve('pdfRwBundle')` is not a
// supported call — the Read+Write family is a dist-surface composition only.

/**
 * Measured write inventory — the write-path modules that are SEPARABLE from
 * the `pdf` orchestrator core, i.e. reachable from no Read-family root.
 *
 * `pdfSerializer` and `pdfWriter` are write-path too but are hard, declared
 * dependencies of `src/pdf.js` itself (`pdf.write()` is part of the core
 * facade), so they are core-embedded and cannot be factored out without a
 * `src/` change. They are therefore NOT part of the composable inventory; the
 * Read-family purity lock is stated against the list below. See
 * `docs/api/bundles/dist-matrix.md` for the full 95-module classification.
 *
 * `pdfFontEmbed` is write-path but is NOT includable: its four declared
 * dependencies (`embedSubsetForPdf`, `embedFontDescriptor`,
 * `embedCidSystemInfo`, `embedToUnicodeBuilder`) come from `pkg_require`
 * (`@awacloud/fonts`), which `buildLocalRegistry(modules, extras)` does not
 * see — `topoLocal` throws `Unknown module : embedSubsetForPdf`. Recorded as
 * an out-of-perimeter generator gap.
 */
const WRITE_INVENTORY = [
    'pdfBuilder',           // builder()                  — document builder
    'pdfIncrementalWriter', // appendIncremental()        — incremental save
    'pdfXrefStreamWriter',  // writeXrefStreamDocument()  — required by the ruling
    'pdfEncryptedWriter',   // writeEncryptedDocument()   — encrypted save
    'pdfSign'               // sign()                     — sig/sign surface
];

/**
 * Verification surface — the read-path signature verifier, shipped beside the
 * signer in every Read+Write root. NOT a write module: `WRITE_INVENTORY`
 * above stays the truthful list of separable write modules, and this list is
 * kept apart so neither reads as the other.
 *
 * It rides the `-rw` family, never the Read family: the four Read roots are
 * byte-frozen, while a bundle that can `sign()` must also be able to verify
 * what it signed. Its crypto closure already ships through `pdfSign`, so it
 * adds no fw dependency (see `docs/api/bundles/dist-matrix.md`).
 */
const VERIFY_SURFACE = [
    'pdfSignature'          // verifySignature()          — sig/verify surface
];

/**
 * Driver-local Read+Write bundle plan entries. `dependencies[0]` is the size
 * segment's Read anchor (a core name or an `src/main.js` bundle name, which
 * the generator unfolds); the tail is the write inventory then the
 * verification surface, layered exactly the way extras are.
 */
const RW_FAMILY = [
    { name: 'pdfRwBundle',       dependencies: ['pdf',             ...WRITE_INVENTORY, ...VERIFY_SURFACE] },
    { name: 'pdfLargeRwBundle',  dependencies: ['pdfLargeBundle',  ...WRITE_INVENTORY, ...VERIFY_SURFACE] },
    { name: 'pdfFullRwBundle',   dependencies: ['pdfFullBundle',   ...WRITE_INVENTORY, ...VERIFY_SURFACE] },
    { name: 'pdfLegacyRwBundle', dependencies: ['pdfLegacyBundle', ...WRITE_INVENTORY, ...VERIFY_SURFACE] }
];

/**
 * `src/main.js` namespace with the driver-composed Read+Write plan appended.
 *
 * Every layered bundle entry (the historical `pdfLargeBundle` /
 * `pdfFullBundle` / `pdfLegacyBundle` from `src/main.js#bundle`, plus the
 * four driver-composed `-Rw` entries above) opts into
 * `useEnvelope: 'register'` (BL-334): `pdf.use()` requires the
 * `{ name, register() {...} }` envelope per extra — see
 * `src/bundles/pdf-large.js`'s hand-written factory for the shape this
 * mirrors — and the generator's default raw multi-arg
 * `core.use(extra1, extra2, …)` emission does not satisfy it (a bare-core
 * bundle entry carries no extras, so it is unaffected either way). Entries
 * are shallow-copied (never mutated in place) since `pdf.bundle`'s objects
 * are `src/`-owned.
 */
const packageMain = {
    ...pdf,
    bundle: [...pdf.bundle, ...RW_FAMILY].map(b => ({ ...b, useEnvelope: 'register' }))
};

const fwNames       = pdf.fw_require.map(m => m.name);
const localRegistry = buildLocalRegistry(pdf.modules, pdf.extras);

const bundleByName = Object.fromEntries(packageMain.bundle.map(b => [b.name, b]));

/** Unfold a bundle's `dependencies` into `[coreName, ...extras]` (generator rule). */
function flattenSpec(b) {
    const [head, ...tail] = b.dependencies;
    return bundleByName[head] ? [...flattenSpec(bundleByName[head]), ...tail] : [head, ...tail];
}

/** Per-root local-module closure roots, for the `meta.json` `modules` field. */
const ROOT_SPECS = {
    // Read family — frozen names, writer-free.
    'pdf':           ['pdf'],
    'pdf-large':     flattenSpec(bundleByName.pdfLargeBundle),   // ['pdf', ...extras]
    'pdf-full':      flattenSpec(bundleByName.pdfFullBundle),
    'pdf-legacy':    flattenSpec(bundleByName.pdfLegacyBundle),
    // Read+Write family — Read segment + the write inventory.
    'pdf-rw':        flattenSpec(bundleByName.pdfRwBundle),
    'pdf-large-rw':  flattenSpec(bundleByName.pdfLargeRwBundle),
    'pdf-full-rw':   flattenSpec(bundleByName.pdfFullRwBundle),
    'pdf-legacy-rw': flattenSpec(bundleByName.pdfLegacyRwBundle)
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
    // Generate all roots of this variant into a scratch dir, then relocate to
    // the discriminated surface directory under `dist/`. The generator names
    // files `<root>-<variant>.js`; the committed name drops the variant suffix
    // (the surface directory carries the discriminator).
    const tmpDir = mkdtempSync(join(tmpdir(), `pdf-${generatorVariant}-`));
    generatePrebuilds({
        packageMain,
        outDir:       tmpDir,
        packageLabel: 'pdf',
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
            package:        '@awacloud/pdf',
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
    ' * @fileoverview `@awacloud/pdf/build` — fw-mode barrel.',
    ' *',
    ' * Re-exports the whole `@awacloud/pdf` main namespace: the four registration',
    ' * arrays (`fw_require`, `pkg_require`, `modules`, `extras`, `bundle`) and',
    ' * every individual module descriptor. Consumers register these on their',
    ' * own `@awacloud/fw` runtime. The framework-free counterpart lives under',
    ' * `dist/standalone/`.',
    ' *',
    ' * @module pdf/build',
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
