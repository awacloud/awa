#!/usr/bin/env node
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Generate the committed build surfaces of `@awacloud/graphic-anim`.
 *
 * Thin wrapper around `@awacloud/tool-prebuild-generator`. The generator contract
 * (`fw_require`, `modules`, `extras`, `bundle`) lives in `src/main.js`; this
 * script only drives the generator and writes the `dist/build` barrel plus
 * the assembled aggregate.
 *
 * Three kinds of artifact are produced:
 *
 *   - `dist/standalone/*-bundled.js` — framework-free, one per public root:
 *     the FROZEN fourteen engine roots of `src/main.js`'s own `bundle` export
 *     (`graphic-lerp`, `graphic-easing`, … , `graphic-frames`) plus the three
 *     composed EXTENSION roots this driver appends (`graphic-pageflip`,
 *     `graphic-hypertree`, `graphic-svg3d` — `graphic/BATCH_16` task 03). Every
 *     transitively-reachable factory is inlined via a mini-DI; pure-leaf
 *     bundles inline NO fw module (Worker-safe slices), DOM-bound bundles
 *     inline `secPolicy`+`dom`. Emitted with `variants: ['bundled']` and
 *     `inlineReachableFwOnly: true`.
 *   - `dist/build/index.js` — the with-fw barrel: re-exports `graphicModules`
 *     and every individual module descriptor from `src/main.js`, so consumers
 *     register the modules on their own `@awacloud/fw` runtime.
 *   - `dist/build/<root>.{standalone,fw}.{js,min.js,meta.json}` — one
 *     **pair** of assembled builds per DEDICATED `dist/build` root. Four roots
 *     ship today: the whole-package `graphic.anim` aggregator
 *     (`graphic-anim.*`, FINDINGS Q6, `graphic/BATCH_10` tasks 02 + 04) and the
 *     three composed extension modules — `graphic.svg3d` terrain viewer
 *     (`graphic-svg3d.*`, `graphic/BATCH_15` task 04), `graphic.pageflip` and
 *     `graphic.hypertree` (`graphic-pageflip.*` / `graphic-hypertree.*`,
 *     `graphic/BATCH_16` task 03). For all three extensions this is the
 *     bundler-free / import-map-free way to reach the composed class, whose
 *     `svg/apply.js` chain otherwise carries a bare `@awacloud/fw/…` specifier.
 *     Each pair comes out of a single `generatePrebuilds` call scoped to a
 *     throwaway `bundle` entry for that one root — no edit to `src/main.js`'s
 *     own `bundle` export (still the 14 frozen per-root bare cores):
 *       · `<root>.standalone.*` — generator `bundled` variant:
 *         `dependencies: []`, every reachable fw factory (`secPolicy`, `dom`)
 *         inlined. Needs nothing at runtime.
 *       · `<root>.fw.*` — generator `package` variant:
 *         fw DI-injected, fw NOT inlined. Needs an `@awacloud/fw` runtime (or
 *         hand-passed fw modules). For the THREE composed EXTENSION roots this
 *         variant additionally DECLARES its `graphic.*` siblings instead of
 *         inlining a second private copy of them (`externalSiblings`, W1 of the
 *         `graphic-anim-maturity` plan): its `dependencies` are
 *         `[…reached fw modules, …reached graphic.* siblings]` (fw names
 *         first, in `fw_require` order) and its `meta.json` records the
 *         sibling contract under `siblingDependencies`. The `graphic-anim`
 *         aggregate pair declares the fw modules it reaches only.
 *     The bare `graphic-anim.{js,min.js,meta.json}` names task 02 emitted are
 *     RETIRED: a pre-built file's runtime requirement must be readable from
 *     its name alone.
 *
 * Re-run via `bun run gen:bundles`. Output is idempotent, with no exception:
 * every emitted file — `*.js`, `*.min.js` AND `*.meta.json` — is byte-identical
 * across runs. No build stamp is written (the former `builtAt` ISO timestamp
 * was REMOVED, W1 determinism ruling); a second run must produce a
 * bit-for-bit identical `dist/`, which
 * `tests/dist-build-aggregate.integration.test.js` locks by raw hash.
 *
 * @module graphic-anim/tools/generate-bundles
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';

import { generatePrebuilds } from '@awacloud/tool-prebuild-generator';
import * as graphic from '../src/main.js';

// The four `svg3d.*` sibling kernels DI-injected into `graphic.svg3d`. They are
// deliberately NOT `graphicModules` members (non-`graphic.*` names, excluded
// from the registry and its topo meta-tests), so the generator cannot reach
// them through `graphic.modules` — they are handed to the svg3d root's own
// `generatePrebuilds` call as `extras`, which only adds them to the inlinable
// local registry (extras are layered onto a core via `core.use(...)` ONLY when
// listed in a bundle entry's dependency tail — they are not, so the emitted
// bytes of every other root are unaffected).
import { svg3dVec3Module }    from '../src/svg3d/vec3.js';
import { svg3dMeshModule }    from '../src/svg3d/mesh.js';
import { svg3dProjectModule } from '../src/svg3d/project.js';
import { svg3dApplyModule }   from '../src/svg3d/apply.js';

// The same story for the two other off-aggregate composed modules: the pure
// kernels DI-injected into `graphic.pageflip` and `graphic.hypertree` are
// non-`graphic.*` descriptors deliberately kept out of `graphicModules`, so the
// generator can only see them as `extras`.
import { foldModule }              from '../src/pageflip/fold.js';
import { composeModule }           from '../src/pageflip/compose.js';
import { hypertreeLayoutModule }   from '../src/hypertree/layout.js';
import { hypertreeMeasureModule }  from '../src/hypertree/measure.js';

const HERE         = dirname(fileURLToPath(import.meta.url));
const PKG          = join(HERE, '..');

/**
 * Output root: `--out <dir>` writes `<dir>/standalone` and `<dir>/build`
 * instead of the tracked `dist/` (the determinism and freshness tests use a
 * temp dir, so a test run never rewrites committed files). Without the flag
 * the output is the package's own `dist/`, as the `gen:bundles` script expects.
 * @param {string[]} argv
 * @returns {string}
 */
function outRoot(argv) {
    const i = argv.indexOf('--out');
    if (i === -1) return join(PKG, 'dist');
    const dir = argv[i + 1];
    if (!dir || dir.startsWith('--')) {
        throw new Error('generate-bundles: --out needs a directory argument');
    }
    return resolve(dir);
}

const OUT          = outRoot(process.argv.slice(2));
const STANDALONE   = join(OUT, 'standalone');
const BUILD        = join(OUT, 'build');

// Every off-registry DI kernel of the three extension modules, in one list.
// Handed to the generator as `extras` so its local registry can inline them;
// extras are layered onto a core via `core.use(...)` ONLY when listed in a
// bundle entry's dependency TAIL — never here — so the emitted bytes of a root
// that does not reach them are unaffected.
const EXTENSION_KERNELS = [
    foldModule, composeModule,
    hypertreeLayoutModule, hypertreeMeasureModule,
    svg3dVec3Module, svg3dMeshModule, svg3dProjectModule, svg3dApplyModule,
];

// ── dist/standalone — framework-free per-root bundles ────────────────────────
//
// `src/main.js`'s own `bundle` export is the FROZEN 14 per-root bare cores of
// the engine surface (`graphic.lerp` … `graphic.frames`). The three composed
// EXTENSION modules — pageflip / hypertree / svg3d — are off-aggregate,
// off-`bundle` and were therefore reachable only through a bundler or an import
// map (`src/<mod>/<mod>.js` transitively carries `src/svg/apply.js`'s bare
// `@awacloud/fw/dom/query/dom.js` specifier). `graphic/BATCH_16` task 03 closes
// that by giving each one a `dist/standalone` root of its own.
//
// The entries live HERE rather than in `src/main.js` for the same reason the
// assembled-pair entries below do: they are a packaging concern of this driver,
// and `src/main.js` stays the descriptor source of truth (its `bundle` export
// keeps describing exactly the engine roots the frozen ROOTS/DOM_BOUND tables
// name). They are appended AFTER the frozen fourteen, so the generator's
// `seenCores` pass still meets the leaf cores first and every pre-existing
// output file stays byte-identical.
const EXTENSION_BUNDLES = [
    { name: 'graphic.pageflipBundle',  dependencies: ['graphic.pageflip'],  factory(m) { return m; } },
    { name: 'graphic.hypertreeBundle', dependencies: ['graphic.hypertree'], factory(m) { return m; } },
    { name: 'graphic.svg3dBundle',     dependencies: ['graphic.svg3d'],     factory(m) { return m; } },
];

const result = generatePrebuilds({
    packageMain: {
        fw_require: graphic.fw_require,
        modules:    graphic.modules,
        extras:     [...graphic.extras, ...EXTENSION_KERNELS],
        bundle:     [...graphic.bundle, ...EXTENSION_BUNDLES],
    },
    outDir:                STANDALONE,
    packageLabel:          'graphic',
    variants:              ['bundled'],
    inlineReachableFwOnly: true
});

// ── dist/build/index.js — the with-fw barrel ─────────────────────────────────
//
// Authored deterministically from the frozen `graphicModules` order so the
// output is byte-stable. Re-exports the canonical registration array plus each
// named descriptor; consumers register these on their own `@awacloud/fw` runtime.

const DESCRIPTORS = [
    'lerpModule',
    'easingModule',
    'unitsModule',
    'matrixModule',
    'colorModule',
    'scopedIdsModule',
    'interpolateModule',
    'svgApplyModule',
    'svgBuildModule',
    'schedulerModule',
    'tweenModule',
    'timelineModule',
    'sceneModule',
    'framesModule',
    'pageflipModule',
    'hypertreeModule',
    'animAggregatorModule',
    'svg3dModule',
];

const buildBarrel = [
    '/* GENERATED — do not edit. Source: tools/generate-bundles.mjs */',
    '',
    '/**',
    ' * @fileoverview `@awacloud/graphic-anim/build` — fw-mode barrel.',
    ' *',
    ' * Re-exports the canonical `graphicModules` registration array and every',
    ' * individual module descriptor, for registration on an `@awacloud/fw` runtime',
    ' * (`new ModuleRuntime().registerAllDeep(graphicModules)`). The framework-free',
    ' * counterpart lives under `dist/standalone/`.',
    ' *',
    ' * @module graphic-anim/build',
    ' */',
    '',
    "export { graphicModules } from '../../src/main.js';",
    `export {`,
    ...DESCRIPTORS.map(d => `    ${d},`),
    `} from '../../src/main.js';`,
    '',
].join('\n');

if (!existsSync(BUILD)) mkdirSync(BUILD, { recursive: true });
const barrelPath = join(BUILD, 'index.js');
writeFileSync(barrelPath, buildBarrel);

// ── dist/build/<root>.{standalone,fw}.* — assembled root PAIRS ──────────────
//
// FINDINGS Q6 (frozen dist-layout) / front-package.md §1 "fw add-on
// packages": the assembled builds that sit alongside the fw-mode barrel. Both
// variants of a root come out of ONE `generatePrebuilds` call against a
// throwaway `bundle` entry scoped to that root, written to a scratch directory
// outside `dist/`, then relocated:
//
//   generator `bundled` → `<root>.standalone.*`  (fw INLINED per the
//     `fw_require` rule, `dependencies: []`, needs nothing at runtime)
//   generator `package` → `<root>.fw.*`          (fw DECLARED as
//     `dependencies` and DI-injected, fw NOT inlined — smaller artifact)
//
// The bare `graphic-anim.*` names are retired: a pre-built file's runtime
// requirement must be readable from its name alone. `src/main.js`'s own
// `bundle` export (the 14 per-root bare cores) is never touched.

const AGGREGATE_CORE = 'graphic.anim';
const SVG3D_CORE     = 'graphic.svg3d';
const PAGEFLIP_CORE  = 'graphic.pageflip';
const HYPERTREE_CORE = 'graphic.hypertree';

// Where a consumer obtains the declared siblings — provenance only. The DI
// contract is the module-name LIST (`ModuleRuntime.resolve()` resolves by name;
// a package specifier is not resolvable by the container), spike FINDINGS § 6a.
const SIBLING_PACKAGE = '@awacloud/graphic-anim';

// Candidate sibling names for the composed EXTENSION roots, derived LIVE from
// the registry — NEVER a hardcoded list. The registry has grown 10 → 18 across
// eight batches and the standing area rule is to re-enumerate coupled sites at
// append time (`ai/memory/types/graphic.md` § Packaging & registration; spike
// FINDINGS § 6b). The generator narrows this to the names each root actually
// REACHES (`reachableExternal`), drops the root's own core, and ignores the
// option entirely on the `bundled` path — so `dist/standalone` and every
// `*.standalone.*` output stay fully inlined (owner ruling, FINDINGS § 7.5).
const REGISTRY_NAMES = graphic.graphicModules.map((m) => m.name);

/** Generator variant → the self-describing name segment it ships under. */
const AGGREGATE_VARIANTS = [
    { generatorVariant: 'bundled', label: 'standalone' },
    { generatorVariant: 'package', label: 'fw' },
];

// `workerSafeSlice` mirrors the frozen `DOM_BOUND` complement asserted in
// tests/standalone-bundles.integration.test.js's ROOTS/DOM_BOUND tables.
const WORKER_SAFE_SLICE = [
    'graphic.lerp', 'graphic.easing', 'graphic.units', 'graphic.matrix',
    'graphic.color', 'graphic.scopedIds', 'graphic.interpolate',
];

// The svg3d counterpart: of `graphic.svg3d`'s four injected sibling kernels
// only `svg3d.apply` is DOM-bound (the rig builder) — `vec3`/`mesh`/`project`
// are the pure Worker-safe kernel (`docs/svg3d.md` "Worker-safe split").
const SVG3D_WORKER_SAFE_SLICE = ['svg3d.vec3', 'svg3d.mesh', 'svg3d.project'];

// pageflip's and hypertree's own injected kernels are pure by construction
// (`docs/pageflip.md` / `docs/hypertree.md` "Worker-safe kernel"): geometry and
// text metrics, no DOM, no scheduler.
const PAGEFLIP_WORKER_SAFE_SLICE  = ['pageflip.fold', 'pageflip.compose'];
const HYPERTREE_WORKER_SAFE_SLICE = ['hypertree.layout', 'hypertree.measure'];

/**
 * Emit ONE assembled `dist/build` root as the frozen variant pair
 * (`<fileId>.standalone.*` + `<fileId>.fw.*`), each with `.js`, `.min.js` and
 * `.meta.json`.
 *
 * @param {object}   spec
 * @param {string}   spec.core            module name the root resolves to (e.g. `graphic.svg3d`).
 * @param {string}   spec.fileId          kebab file id the generator derives for `core`.
 * @param {string}   spec.coreMetaKey     meta key naming the root (`aggregate` | `root`).
 * @param {string[]} spec.modules         module names the root's namespace covers.
 * @param {string[]} spec.workerSafeSlice the root's Worker-safe module names.
 * @param {object[]} spec.extras          extra local descriptors the generator must be able to inline.
 * @param {string[]} [spec.externalSiblings] candidate `graphic.*` sibling names the
 *   `package` variant may DECLARE instead of inlining. Default `[]` — the
 *   `graphic-anim` aggregate pair takes none (it IS the core a consumer holds).
 * @returns {Promise<string>} a short human label of what was written.
 */
async function emitAssembledPair(spec) {
    const {
        core, fileId, coreMetaKey, modules, workerSafeSlice, extras,
        externalSiblings = [],
    } = spec;

    const tmpDir = mkdtempSync(join(tmpdir(), `${fileId}-pair-`));
    const pair = generatePrebuilds({
        packageMain: {
            fw_require: graphic.fw_require,
            modules:    graphic.modules,
            extras,
            bundle:     [
                { name: `${core}Bundle`, dependencies: [core], factory(m) { return m; } },
            ],
        },
        outDir:                tmpDir,
        packageLabel:           'graphic',
        variants:               AGGREGATE_VARIANTS.map(v => v.generatorVariant),
        inlineReachableFwOnly:  true,
        externalSiblings,
        siblingPackage:         SIBLING_PACKAGE,
    });

    for (const { generatorVariant, label } of AGGREGATE_VARIANTS) {
        const generatedPath = join(tmpDir, `${fileId}-${generatorVariant}.js`);
        const rootJs = readFileSync(generatedPath, 'utf8');

        const rootPath = join(BUILD, `${fileId}.${label}.js`);
        writeFileSync(rootPath, rootJs);

        // Minify: `generatePrebuilds` has no minify path (Q1), so fall back to
        // `Bun.build({minify:true})` exactly like the W0 spike (and the
        // aggregator's own worker-serializability test) did. The banner is a plain
        // comment, which generic minifiers are free to drop, so it is re-prepended
        // verbatim from the unminified file rather than trusted to survive
        // minification.
        const bannerLine = rootJs.slice(0, rootJs.indexOf('\n') + 1);
        const minifyResult = await Bun.build({
            entrypoints: [rootPath],
            target:      'browser',
            format:      'esm',
            minify:      true,
        });
        if (!minifyResult.success) {
            throw new Error(`generate-bundles: ${fileId} ${label} minify failed:\n${minifyResult.logs.map(l => l.message).join('\n')}`);
        }
        const rootMinJs = bannerLine + (await minifyResult.outputs[0].text());
        const rootMinPath = join(BUILD, `${fileId}.${label}.min.js`);
        writeFileSync(rootMinPath, rootMinJs);

        // `fwDependencies` is READ BACK from the generated descriptor itself
        // (never hardcoded): `[]` for the standalone variant, the declared fw
        // names for the fw variant.
        const emitted    = await import(pathToFileURL(rootPath).href);
        const exportName = Object.keys(emitted).find(k => k !== 'default');
        const descriptor = emitted[exportName];

        // Declared-sibling fragment, reported BY THE GENERATOR for exactly the
        // files that declare siblings (absent otherwise, so every pre-existing
        // `meta.json` keeps its exact key set). The generator never learns the
        // package name — `siblingPackage` is handed to it by this driver.
        const siblingFragment = pair.siblingDependencies[generatedPath];
        const siblingModules  = siblingFragment ? siblingFragment.modules : [];

        // The emitted descriptor's `dependencies` is `[...fwNames, ...siblings]`
        // (siblings appended AFTER the fw names, spike § 2). `fwDependencies`
        // keeps its frozen meaning — the fw closure only — so the sibling names
        // are subtracted out and recorded under `siblingDependencies` instead;
        // the two lists concatenated reconstruct `descriptor.dependencies`.
        const fwDependencies = descriptor.dependencies
            .filter(name => !siblingModules.includes(name));

        // Meta shape per ai/archives/spikes/graphic-anim/03-packaging/candidate/graphic-anim.meta.example.json
        // (FINDINGS Q6, normative) plus the `variant`/`fwDependencies`
        // discriminators the pair needs and, for a declared root, the
        // `siblingDependencies` object of spike FINDINGS § 6a. `coreMetaKey`
        // names the root in the shape the artifact deserves (`aggregate` for the
        // whole-package aggregator, `root` for a single composed module).
        //
        // NO BUILD STAMP: the former `builtAt` ISO timestamp is deliberately
        // absent (W1 determinism ruling) so `dist/` is bit-for-bit reproducible.
        const rootMeta = {
            kind:            'build',
            variant:         label,
            name:            fileId,
            package:         '@awacloud/graphic-anim',
            [coreMetaKey]:   core,
            modules,
            fwDependencies,
            ...(siblingFragment ? { siblingDependencies: siblingFragment } : {}),
            bytes:           {
                dev: Buffer.byteLength(rootJs, 'utf8'),
                min: Buffer.byteLength(rootMinJs, 'utf8'),
            },
            domBound:        true,
            workerSafeSlice,
            builtBy:         '@awacloud/tool-prebuild-generator via tools/generate-bundles.mjs',
        };
        const rootMetaPath = join(BUILD, `${fileId}.${label}.meta.json`);
        writeFileSync(rootMetaPath, JSON.stringify(rootMeta, null, 2) + '\n');
    }

    rmSync(tmpDir, { recursive: true, force: true });

    return `${fileId}.{standalone,fw}.{js,min.js,meta.json}`;
}

const writtenAggregates = [];

// The whole-package `graphic.anim` aggregator (graphic/BATCH_10 tasks 02 + 04).
writtenAggregates.push(await emitAssembledPair({
    core:            AGGREGATE_CORE,
    fileId:          'graphic-anim',
    coreMetaKey:     'aggregate',
    modules:         graphic.animAggregatorModule.dependencies,
    workerSafeSlice: WORKER_SAFE_SLICE,
    extras:          graphic.extras,
}));

// The composed `graphic.svg3d` terrain viewer (graphic/BATCH_15 task 04): a
// DEDICATED root, NOT an aggregate member — `AGGREGATE_NAMES` and
// `graphicModules` are untouched. Its four injected `svg3d.*` sibling kernels
// ride in as `extras` so the generator can inline them.
writtenAggregates.push(await emitAssembledPair({
    core:            SVG3D_CORE,
    fileId:          'graphic-svg3d',
    coreMetaKey:     'root',
    modules:         graphic.svg3dModule.dependencies,
    workerSafeSlice: SVG3D_WORKER_SAFE_SLICE,
    extras:          [
        ...graphic.extras,
        svg3dVec3Module, svg3dMeshModule, svg3dProjectModule, svg3dApplyModule,
    ],
    externalSiblings: REGISTRY_NAMES,
}));

// The composed `graphic.pageflip` book (graphic/BATCH_16 task 03): same shape as
// the svg3d root — a DEDICATED root, NOT an aggregate member. Its two injected
// `pageflip.*` kernels ride in as `extras` so the generator can inline them.
writtenAggregates.push(await emitAssembledPair({
    core:            PAGEFLIP_CORE,
    fileId:          'graphic-pageflip',
    coreMetaKey:     'root',
    modules:         graphic.pageflipModule.dependencies,
    workerSafeSlice: PAGEFLIP_WORKER_SAFE_SLICE,
    extras:          [...graphic.extras, foldModule, composeModule],
    externalSiblings: REGISTRY_NAMES,
}));

// The composed `graphic.hypertree` radial tree (graphic/BATCH_16 task 03).
writtenAggregates.push(await emitAssembledPair({
    core:            HYPERTREE_CORE,
    fileId:          'graphic-hypertree',
    coreMetaKey:     'root',
    modules:         graphic.hypertreeModule.dependencies,
    workerSafeSlice: HYPERTREE_WORKER_SAFE_SLICE,
    extras:          [...graphic.extras, hypertreeLayoutModule, hypertreeMeasureModule],
    externalSiblings: REGISTRY_NAMES,
}));

// ── Declarations: a `.d.ts` beside every `.js` of both directories ──────────
//
// A TypeScript consumer resolves `./build/*` and `./standalone/*` to these
// files' siblings (`x.js` → `x.d.ts`, `x.min.js` → `x.min.d.ts`). Each one is
// derived from the file just written: the driver imports it once and reads its
// export, the descriptor's `name` and its `dependencies`, so the declaration
// cannot drift from the bytes beside it. The factory's result is the typed
// module surface where `types/main.d.ts` declares one (pageflip, hypertree) and
// `unknown` elsewhere.

/** The typed `factory()` result of the roots whose surface `types/main.d.ts` declares. */
const ROOT_API = {
    'graphic-pageflip': {
        imports: ['Pageflip', 'PageflipOptions'],
        api: '{ Pageflip: new (opts: PageflipOptions) => Pageflip; pageflip: (opts: PageflipOptions) => Pageflip }',
    },
    'graphic-hypertree': {
        imports: ['Hypertree', 'HypertreeOptions', 'TreeNode'],
        api: '{ Hypertree: { new (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions): Hypertree; readonly FOREST_ORIGIN: string }; hypertree: (svgRoot: Element, tree: TreeNode | TreeNode[], opts?: HypertreeOptions) => Hypertree }',
    },
};

const DECL_HEADER = '/* GENERATED — do not edit. Source: tools/generate-bundles.mjs */';

/**
 * The declaration of one built descriptor file.
 * @param {string} file Basename, e.g. `graphic-pageflip.fw.min.js`.
 * @param {string} exportName The file's one export.
 * @param {{ name: string, dependencies: string[] }} desc The exported descriptor.
 * @returns {string}
 */
function descriptorDeclaration(file, exportName, desc) {
    const root = Object.keys(ROOT_API).find((r) => file.startsWith(`${r}-`) || file.startsWith(`${r}.`));
    const typed = root ? ROOT_API[root] : null;
    const deps = desc.dependencies;
    const params = deps.map((d, i) => `${d.replace(/\W/g, '_') || `dep${i}`}: unknown`).join(', ');
    const lines = [DECL_HEADER, ''];
    if (typed) {
        lines.push(`import type { ${typed.imports.join(', ')} } from '@awacloud/graphic-anim';`, '');
    }
    lines.push(
        deps.length === 0
            ? `/** \`${desc.name}\`: every dependency inlined; \`factory()\` takes nothing. */`
            : `/** \`${desc.name}\`: register it on an \`@awacloud/fw\` runtime that provides its dependencies, or pass one value per dependency. */`,
        `export declare const ${exportName}: {`,
        `    name: '${desc.name}';`,
        `    dependencies: [${deps.map((d) => `'${d}'`).join(', ')}];`,
        `    factory(${params}): ${typed ? typed.api : 'unknown'};`,
        '};',
        '',
    );
    return lines.join('\n');
}

const barrelDeclaration = [
    DECL_HEADER,
    '',
    '/** `@awacloud/graphic-anim/build` — the fw-mode barrel (see `index.js`). */',
    "export { graphicModules } from '../../types/main.js';",
    'export {',
    ...DESCRIPTORS.map((d) => `    ${d},`),
    "} from '../../types/main.js';",
    '',
].join('\n');

let declarations = 0;
for (const dir of [STANDALONE, BUILD]) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
        const target = join(dir, file.replace(/\.js$/, '.d.ts'));
        if (dir === BUILD && file === 'index.js') {
            writeFileSync(target, barrelDeclaration);
        } else {
            const mod = await import(pathToFileURL(join(dir, file)).href);
            const names = Object.keys(mod);
            if (names.length !== 1) throw new Error(`generate-bundles: ${file} must export exactly one descriptor`);
            writeFileSync(target, descriptorDeclaration(file, names[0], mod[names[0]]));
        }
        declarations += 1;
    }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`generate-bundles: wrote ${result.written.length} standalone file-writes to ${STANDALONE}`);
console.log(`generate-bundles: wrote build barrel ${barrelPath.split(/[\\/]/).slice(-3).join('/')}`);
console.log(`generate-bundles: wrote assembled roots ${writtenAggregates.join(' + ')} to ${BUILD}`);
console.log(`generate-bundles: wrote ${declarations} declarations (.d.ts beside every .js of both directories)`);
