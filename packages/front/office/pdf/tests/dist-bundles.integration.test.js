// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Tests for the committed two-surface `dist/` bundles generated
 * by `tools/generate-bundles.mjs`, and the `dist/build/index.js` fw-mode
 * barrel (clause vi — the central consumer bridge feeding `@awacloud/oconv` and
 * `@awacloud/facturx`).
 *
 * Coverage:
 *
 *   - every generated descriptor (`pdf`, `pdf-large`, `pdf-full`,
 *     `pdf-legacy`, both surfaces) exposes the canonical
 *     `{ name, dependencies, factory }` shape; the `-package` variants declare
 *     the 25 fw dependencies, the `-bundled` variants declare none;
 *   - the bare `pdf` bundled variant is invocable with no args and returns a
 *     working pdf core (Worker-safe: `factory.toString()` is self-contained);
 *   - the `dist/build/index.js` barrel re-exports the four registration arrays
 *     and every named descriptor of `src/main.js`, each resolvable with
 *     `{ name, dependencies, factory }` (spot-check `pdf`, `pdfFilterDispatch`,
 *     `pdfContentStream`, `pdfStructTree`) plus the `@awacloud/fonts` subset helper
 *     bindings;
 *   - the **Read / Read+Write bundle-family matrix** (owner ruling 2026-08-04,
 *     BL-280): the four historical roots anchor the Read family and are locked
 *     writer-free; the four `-rw` roots are the same size segment plus the
 *     write inventory, `pdfXrefStreamWriter` included per the ruling;
 *   - the **verification surface**: every `-rw` root also ships the read-path
 *     verifier `pdfSignature` (beside the signer), no Read root does, and the
 *     invoked `pdfRwBundled` core exposes `verifySignature`;
 *   - the **layered-factory invocation witness** (BL-334): the driver now
 *     opts every layered bundle entry into `useEnvelope: 'register'`
 *     (`tools/generate-bundles.mjs`), so a generated layered factory emits
 *     `__core.use({ name, register() {...} })` per extra — the shape
 *     `pdf.use()` requires — instead of the generator's historical raw
 *     multi-arg `__core.use(instance1, instance2, ...)`. `pdfLargeBundled`
 *     (Read family) and `pdfRwBundled` (Read+Write family) are actually
 *     INVOKED here and asserted to not throw `pdf/use/bad-extension`, with a
 *     registered extra probed on the returned core — a real invocation, not
 *     an emit-string assertion (ai/memory/types/office.md, tools memory
 *     2026-08-26 re-lock lesson);
 *   - the **fonts boundary** of the Read+Write family: the fw-variant `-rw`
 *     roots declare `@awacloud/fonts`' `standard14Lookup` and
 *     `encodingLookup` (recorded under the meta's `siblingDependencies`) and
 *     no longer inline fonts' tables; `pdfRwPackage` resolves on a runtime
 *     holding fonts' manifest and fails without it, while the standalone
 *     `-rw` roots keep inlining and need nothing.
 *
 * The matrix rows are asserted from each root's `.meta.json` sidecar and from
 * the generated `.js` file TEXT — deliberately NOT by importing the eight new
 * `dist/**` bundles. Importing raw per-root dist files inflates the Bun
 * coverage denominator the package gate reads (ai/memory/types/office.md,
 * BATCH_22: the eight already-imported dist roots are exactly why the canonical
 * aggregate sits ~39pp under the src-only figure); the matrix must not make
 * that worse. `pdfLargeBundled` and `pdfRwBundled` are deliberate
 * exceptions (below), traded for the invocation witness BL-334 requires, and
 * `pdfRwPackage` a third, traded for the fonts-boundary resolution witness.
 *
 * pdf had no `src/bundles/prebuilt/prebuilds.test.js` to relocate; this file
 * is authored fresh for the `dist/` layout.
 *
 * @module pdf/tests/dist-bundles.integration.test
 */

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import * as fontsPkg from '@awacloud/fonts';

import { pdfBundled }       from '../dist/standalone/pdf.js';
import { pdfLargeBundled }  from '../dist/standalone/pdf-large.js';
import { pdfFullBundled }   from '../dist/standalone/pdf-full.js';
import { pdfLegacyBundled } from '../dist/standalone/pdf-legacy.js';
import { pdfRwBundled }     from '../dist/standalone/pdf-rw.js';

import { pdfPackage }        from '../dist/build/pdf.js';
import { pdfLargePackage }   from '../dist/build/pdf-large.js';
import { pdfFullPackage }    from '../dist/build/pdf-full.js';
import { pdfLegacyPackage }  from '../dist/build/pdf-legacy.js';
import { pdfRwPackage }      from '../dist/build/pdf-rw.js';

import { fw_require, pkg_require } from '../src/main.js';

const FW_NAMES = fw_require.map(m => m.name);

/**
 * The `@awacloud/fonts` modules every fw-variant `-rw` root DECLARES instead of
 * inlining (`pdfBuilder`'s two Standard 14 lookups), in `dependencies` order
 * after the fw names. The standalone `-rw` roots still inline them.
 */
const FONTS_DECLARED = ['standard14Lookup', 'encodingLookup'];

/** Every name `@awacloud/fonts`' manifest registers (its `fw_require` + `modules`). */
const FONTS_NAMES = new Set(pkg_require.map(m => m.name));

const BUNDLED = [
    { name: 'pdfBundled',       desc: pdfBundled },
    { name: 'pdfLargeBundled',  desc: pdfLargeBundled },
    { name: 'pdfFullBundled',   desc: pdfFullBundled },
    { name: 'pdfLegacyBundled', desc: pdfLegacyBundled }
];

const PACKAGE = [
    { name: 'pdfPackage',       desc: pdfPackage },
    { name: 'pdfLargePackage',  desc: pdfLargePackage },
    { name: 'pdfFullPackage',   desc: pdfFullPackage },
    { name: 'pdfLegacyPackage', desc: pdfLegacyPackage }
];

describe('generated descriptor shape', () => {
    for (const { name, desc } of [...BUNDLED, ...PACKAGE]) {
        test(`${name} has { name, dependencies, factory }`, () => {
            expect(typeof desc).toBe('object');
            expect(desc.name).toBe(name);
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        });
    }

    test('bundled variants declare no dependencies (fw inlined)', () => {
        for (const { desc } of BUNDLED) {
            expect(desc.dependencies).toEqual([]);
        }
    });

    test('package variants declare the 25 fw dependencies (DI-injected)', () => {
        for (const { desc } of PACKAGE) {
            expect(desc.dependencies).toEqual(FW_NAMES);
        }
    });
});

describe('bare pdf bundled variant is invocable with no args (Worker-safe)', () => {
    test('pdfBundled.factory() returns a working pdf core', () => {
        const pdf = pdfBundled.factory();
        expect(typeof pdf.read).toBe('function');
        expect(typeof pdf.write).toBe('function');
        expect(typeof pdf.use).toBe('function');
    });

    test('pdfBundled.factory is self-contained (serializable for Workers)', () => {
        // A prebuilt bundled factory inlines its whole closure (the `__register`
        // / `__resolve` bootstrap plus every fw and pdf-local factory), so its
        // serialized source is standalone — no free identifiers captured from an
        // enclosing module scope.
        const src = pdfBundled.factory.toString();
        expect(src).toContain('__register');
        expect(src).toContain('__resolve');
    });
});

describe('layered-factory invocation witness (BL-334)', () => {
    // A generated layered factory must actually be INVOKED and its `.use()`
    // path exercised — an emit-string assertion over the generated source
    // text (as the dist matrix below deliberately does, to protect the
    // coverage denominator) does not prove the emitted `{ name, register }`
    // calls are accepted by `pdf.use()` at runtime. One historical root
    // (Read family) and one `-rw` root (Read+Write family) are covered.

    test('pdfLargeBundled.factory() does not throw pdf/use/bad-extension and registers its extras', () => {
        const core = pdfLargeBundled.factory();

        // No throw: the call above already proves it. Probe a registered
        // capability — `.use()` merges each extra's `register()` return
        // onto the core under the extra's own key (`src/pdf.js`).
        expect(core.usedExtension('pdfContentOpsExtended')).toBe(true);
        expect(typeof core.pdfContentOpsExtended).toBe('object');
        expect(core.pdfContentOpsExtended).not.toBeNull();

        // Every layered extra registered, not just the first probed one.
        const names = [
            'pdfContentOpsExtended', 'pdfFontCidTyped', 'pdfFontColorTagging',
            'pdfTaggedPdfTyped', 'pdfAnnotExtended', 'pdfAOutputIntent', 'pdfUaTagged',
            'pdfFormActionsExtended', 'pdfColorSpacesExtended', 'pdfShadingTyped',
            'pdfTransparencyTyped', 'pdfSigPades', 'pdfSigAesGcm', 'pdfDocumentParts',
            'pdfRedactionIso32005', 'pdfXPrepress', 'pdfWellTagged',
            'pdfOptionalContentExtended', 'pdfEmbeddedFilesPortfolio',
            'pdfAssociatedFiles2', 'pdfXmpExtended'
        ];
        for (const name of names) expect(core.usedExtension(name)).toBe(true);
    });

    test('pdfRwBundled.factory() does not throw pdf/use/bad-extension and registers the write inventory', () => {
        const core = pdfRwBundled.factory();

        expect(core.usedExtension('pdfSign')).toBe(true);
        expect(typeof core.pdfSign).toBe('object');
        expect(core.pdfSign).not.toBeNull();

        for (const name of ['pdfBuilder', 'pdfIncrementalWriter', 'pdfXrefStreamWriter', 'pdfEncryptedWriter', 'pdfSign']) {
            expect(core.usedExtension(name)).toBe(true);
        }
    });

    test('pdfRwBundled.factory() registers the verification surface and exposes verifySignature', () => {
        const core = pdfRwBundled.factory();

        for (const name of VERIFY_SURFACE) expect(core.usedExtension(name)).toBe(true);
        expect(typeof core.pdfSignature).toBe('object');
        expect(core.pdfSignature).not.toBeNull();
        expect(typeof core.pdfSignature.verifySignature).toBe('function');
        expect(typeof core.pdfSignature.verifyAllSignatures).toBe('function');

        // Non-vacuity control: the Read-family bare core has no verifier.
        expect(pdfBundled.factory().usedExtension('pdfSignature')).toBe(false);
    });

    test('a pre-envelope emission (raw multi-arg .use()) DOES throw pdf/use/bad-extension — non-vacuity control', () => {
        // Rebuilds a factory body that mimics the generator's pre-BL-334
        // default emission (raw-instance `__core.use(a, b, ...)`) against
        // the SAME live `pdf` core, proving the assertions above are not
        // vacuously true regardless of what `.use()` does.
        const core = pdfBundled.factory();
        const fakeExtra = { pdfFakeExtra: {} };
        expect(() => core.use(fakeExtra)).toThrow();
        try {
            core.use(fakeExtra);
        } catch (e) {
            expect(e.code).toBe('pdf/use/bad-extension');
        }
    });
});

describe('dist/build/index.js barrel (clause vi)', () => {
    test('re-exports the registration arrays and every named descriptor', async () => {
        const barrel = await import('../dist/build/index.js');

        // The five registration arrays.
        expect(Array.isArray(barrel.fw_require)).toBe(true);
        expect(Array.isArray(barrel.pkg_require)).toBe(true);
        expect(Array.isArray(barrel.modules)).toBe(true);
        expect(Array.isArray(barrel.extras)).toBe(true);
        expect(Array.isArray(barrel.bundle)).toBe(true);

        // Every descriptor in `modules` is re-exported by an identity-matching
        // named binding carrying the canonical `{ name, dependencies, factory }`
        // shape.
        for (const mod of barrel.modules) {
            const named = barrel[Object.keys(barrel).find(k => barrel[k] === mod && k !== 'modules')];
            expect(named).toBe(mod);
            expect(typeof mod.name).toBe('string');
            expect(Array.isArray(mod.dependencies)).toBe(true);
            expect(typeof mod.factory).toBe('function');
        }

        // Spot-check the descriptors that sibling composers resolve by name.
        for (const name of ['pdf', 'pdfFilterDispatch', 'pdfContentStream', 'pdfStructTree']) {
            const desc = barrel[name];
            expect(typeof desc).toBe('object');
            expect(desc.name).toBe(name);
            expect(Array.isArray(desc.dependencies)).toBe(true);
            expect(typeof desc.factory).toBe('function');
        }

        // The four `@awacloud/fonts` subset helper bindings from `pkg_require`.
        for (const name of ['embedClosure', 'embedCmapBuilder', 'embedGlyphRewriter', 'embedHash']) {
            const helper = barrel[name];
            expect(typeof helper).toBe('object');
            expect(helper.name).toBe(name);
            expect(typeof helper.factory).toBe('function');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Read / Read+Write bundle families × size segmentation (owner ruling
// 2026-08-04, BL-280).
// ─────────────────────────────────────────────────────────────────────────────

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Size segments, frozen. */
const SEGMENTS = ['pdf', 'pdf-large', 'pdf-full', 'pdf-legacy'];

/** Read family — the historical root names; the absence of a suffix IS the marker. */
const READ_ROOTS = SEGMENTS;

/** Read+Write family — the `-rw` discriminator segment. */
const RW_ROOTS = SEGMENTS.map(s => `${s}-rw`);

const SURFACES = [
    { dir: 'standalone', variant: 'standalone', suffix: 'Bundled', fwCount: 0 },
    { dir: 'build',      variant: 'fw',         suffix: 'Package', fwCount: FW_NAMES.length }
];

/**
 * The measured write inventory: write-path modules SEPARABLE from the `pdf`
 * orchestrator core. `pdfSerializer` / `pdfWriter` are write-path too but are
 * declared dependencies of `src/pdf.js` itself, so they are core-embedded and
 * are not part of the composable inventory (see
 * `docs/api/bundles/dist-matrix.md`).
 */
const WRITE_INVENTORY = [
    'pdfBuilder', 'pdfIncrementalWriter', 'pdfXrefStreamWriter',
    'pdfEncryptedWriter', 'pdfSign', 'pdfDssBuilder'
];

/**
 * The verification surface: the read-path signature verifier, shipped beside
 * the signer in every Read+Write root and in no Read root. Not a write
 * module, so it is kept out of `WRITE_INVENTORY` (mirrors
 * `tools/generate-bundles.mjs`).
 */
const VERIFY_SURFACE = ['pdfSignature'];

const readMeta = (dir, root) => JSON.parse(readFileSync(join(DIST, dir, `${root}.meta.json`), 'utf8'));

const camelRoot = root => root.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

describe('dist matrix — Read × Read+Write families', () => {
    test('every matrix cell ships the .js/.min.js/.meta.json triplet', () => {
        for (const { dir, variant, fwCount } of SURFACES) {
            for (const root of [...READ_ROOTS, ...RW_ROOTS]) {
                const meta = readMeta(dir, root);
                expect(meta.kind).toBe('build');
                expect(meta.variant).toBe(variant);
                expect(meta.name).toBe(root);
                expect(meta.package).toBe('@awacloud/pdf');
                expect(meta.fwDependencies.length).toBe(fwCount);
                expect(meta.modules.length).toBeGreaterThan(0);

                // `.js` / `.min.js` exist and their on-disk sizes match the
                // sidecar's declared bytes (a regenerated `.min.js` can come out
                // byte-identical, so commit identity proves nothing — the
                // declared sizes are the discriminating cross-check).
                const dev = readFileSync(join(DIST, dir, `${root}.js`));
                const min = readFileSync(join(DIST, dir, `${root}.min.js`));
                expect(meta.bytes.dev).toBe(dev.byteLength);
                expect(meta.bytes.min).toBe(min.byteLength);
            }
        }
    });

    test('the four historical root names are preserved (Read family anchors)', () => {
        for (const { dir } of SURFACES) {
            for (const root of READ_ROOTS) {
                expect(readMeta(dir, root).name).toBe(root);
            }
        }
    });

    test('generated `-rw` descriptors carry the canonical export name and dependency surface', () => {
        for (const { dir, suffix, fwCount } of SURFACES) {
            for (const root of RW_ROOTS) {
                // Asserted from file TEXT, not by importing: see the fileoverview
                // note on the coverage denominator.
                const src = readFileSync(join(DIST, dir, `${root}.js`), 'utf8');
                const exportName = `${camelRoot(root)}${suffix}`;
                expect(src).toContain(`export const ${exportName} = {`);
                expect(src).toContain(`name: "${exportName}"`);
                const deps = JSON.parse(src.match(/dependencies: (\[[^\]]*\])/)[1]);
                // The fw variant declares the fw names, then the
                // `@awacloud/fonts` lookups it no longer inlines; the
                // standalone variant declares nothing.
                if (fwCount > 0) expect(deps).toEqual([...FW_NAMES, ...FONTS_DECLARED]);
                else expect(deps).toEqual([]);
            }
        }
    });

    test('every `-rw` bundle ships the fixed sign.js, never the pre-fix hard-coded trailer (BL-1606)', () => {
        // The pre-fix `pdfSign` wrote its own trailer with a literal
        // `/Root 1 0 R`; the fixed one appends through the incremental writer
        // (`appendIncrementalWithOffsets`, office/BATCH_42/02) and the
        // ByteRange audit knows the whole-token gap form (`gapForm`,
        // office/BATCH_44/03). Asserted from file TEXT on all 16 `-rw` files.
        for (const { dir } of SURFACES) {
            for (const root of RW_ROOTS) {
                for (const ext of ['.js', '.min.js']) {
                    const src = readFileSync(join(DIST, dir, `${root}${ext}`), 'utf8');
                    expect(src).not.toContain('/Root 1 0 R');
                    expect(src).toContain('appendIncrementalWithOffsets');
                    expect(src).toContain('gapForm');
                }
            }
        }
    });
});

describe('Read-family purity (the ruling\'s regression lock)', () => {
    test('no Read-family root reaches ANY write-inventory module', () => {
        for (const { dir } of SURFACES) {
            for (const root of READ_ROOTS) {
                const mods = readMeta(dir, root).modules;
                const leaked = WRITE_INVENTORY.filter(w => mods.includes(w));
                expect(leaked).toEqual([]);
            }
        }
    });

    test('every Read+Write root ships the whole write inventory', () => {
        for (const { dir } of SURFACES) {
            for (const root of RW_ROOTS) {
                const mods = readMeta(dir, root).modules;
                for (const w of WRITE_INVENTORY) expect(mods).toContain(w);
            }
        }
    });

    test('every Read+Write root ships the verification surface, on both surfaces', () => {
        for (const { dir } of SURFACES) {
            for (const root of RW_ROOTS) {
                const mods = readMeta(dir, root).modules;
                for (const v of VERIFY_SURFACE) expect(mods).toContain(v);
            }
        }
    });

    test('no Read-family root reaches the verification surface (the Read family stays frozen)', () => {
        for (const { dir } of SURFACES) {
            for (const root of READ_ROOTS) {
                const mods = readMeta(dir, root).modules;
                expect(VERIFY_SURFACE.filter(v => mods.includes(v))).toEqual([]);
            }
        }
    });

    test('pdfXrefStreamWriter ships in every Read+Write segment (BL-280)', () => {
        for (const { dir } of SURFACES) {
            for (const root of RW_ROOTS) {
                expect(readMeta(dir, root).modules).toContain('pdfXrefStreamWriter');
            }
            for (const root of READ_ROOTS) {
                expect(readMeta(dir, root).modules).not.toContain('pdfXrefStreamWriter');
            }
        }
    });
});

describe('additive doctrine — no existing bundle shrinks', () => {
    test('each Read segment is a strict subset of its Read+Write twin', () => {
        for (const { dir } of SURFACES) {
            for (const seg of SEGMENTS) {
                const read = readMeta(dir, seg).modules;
                const rw   = readMeta(dir, `${seg}-rw`).modules;
                const missing = read.filter(m => !rw.includes(m));
                expect(missing).toEqual([]);
                expect(rw.length).toBeGreaterThan(read.length);
            }
        }
    });

    test('the two surfaces of a Read root declare the same module list', () => {
        for (const root of READ_ROOTS) {
            expect(readMeta('standalone', root).modules).toEqual(readMeta('build', root).modules);
        }
    });

    test('the fw surface of a `-rw` root lists the standalone closure minus the @awacloud/fonts modules', () => {
        for (const root of RW_ROOTS) {
            const standalone = readMeta('standalone', root).modules;
            const fw         = readMeta('build', root).modules;
            expect(fw).toEqual(standalone.filter(m => !FONTS_NAMES.has(m)));
            // Non-vacuity: the standalone closure does carry fonts modules,
            // the two declared lookups among them.
            const inlined = standalone.filter(m => FONTS_NAMES.has(m));
            for (const name of FONTS_DECLARED) expect(inlined).toContain(name);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The fw-variant `-rw` roots keep `@awacloud/fonts` external (owner ruling):
// declared and DI-injected, as for the unbundled modules. The standalone
// variant keeps inlining and needs nothing.
// ─────────────────────────────────────────────────────────────────────────────

describe('fw-variant `-rw` roots declare the @awacloud/fonts modules they use', () => {
    test('each fw `-rw` meta records the declared fonts modules and lists none of fonts\' names', () => {
        for (const root of RW_ROOTS) {
            const meta = readMeta('build', root);
            expect(meta.siblingDependencies).toEqual({ modules: FONTS_DECLARED, package: '@awacloud/fonts' });
            expect(meta.modules.filter(m => FONTS_NAMES.has(m))).toEqual([]);
            expect(meta.fwDependencies).toEqual(FW_NAMES);
        }
    });

    test('no Read meta and no standalone meta carries a `siblingDependencies` key', () => {
        for (const { dir } of SURFACES) {
            for (const root of [...READ_ROOTS, ...RW_ROOTS]) {
                if (dir === 'build' && RW_ROOTS.includes(root)) continue;
                expect(Object.keys(readMeta(dir, root))).toEqual(
                    ['kind', 'variant', 'name', 'package', 'modules', 'fwDependencies', 'bytes', 'builtBy']);
            }
        }
    });

    test('the Standard 14 tables are absent from the fw `-rw` files and present in the standalone ones', () => {
        // `Helvetica-BoldOblique` is a face name only the fonts Standard 14
        // tables carry (the builder names none of the 14 but the two symbolic
        // faces); it survives minification as a string literal.
        for (const root of RW_ROOTS) {
            for (const ext of ['.js', '.min.js']) {
                expect(readFileSync(join(DIST, 'build', `${root}${ext}`), 'utf8')).not.toContain('Helvetica-BoldOblique');
                expect(readFileSync(join(DIST, 'standalone', `${root}${ext}`), 'utf8')).toContain('Helvetica-BoldOblique');
            }
        }
    });

    test('pdfRwPackage declares the fonts lookups in `dependencies`', () => {
        expect(pdfRwPackage.name).toBe('pdfRwPackage');
        expect(pdfRwPackage.dependencies).toEqual([...FW_NAMES, ...FONTS_DECLARED]);
    });

    test('with @awacloud/fonts\' manifest registered, pdfRwPackage resolves and addFont writes Widths and a FontDescriptor', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.registerAll([...fontsPkg.fw_require, ...fontsPkg.modules]);
        rt.register(pdfRwPackage);
        const core = rt.resolve('pdfRwPackage');
        expect(core.usedExtension('pdfBuilder')).toBe(true);

        const bytes = core.pdfBuilder.builder()
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .build();
        const doc = core.read(bytes);
        const deref = (o) => ((o && o.type === 'ref') ? doc._raw.resolve(o) : o);
        const resources = deref(doc.pages[0].resources);
        const font = deref(resources.entries.Font.entries.F1).entries;
        expect(font.Widths.type).toBe('array');
        expect(font.Widths.items.length).toBeGreaterThan(0);
        expect(font.FontDescriptor.type).toBe('ref');
        expect(deref(font.FontDescriptor).entries.Type.value).toBe('FontDescriptor');
    });

    test('without @awacloud/fonts\' manifest, resolving pdfRwPackage fails with the runtime\'s missing-module error naming standard14Lookup', () => {
        const rt = new ModuleRuntime();
        rt.registerAll(fw_require);
        rt.register(pdfRwPackage);
        let caught;
        try {
            rt.resolve('pdfRwPackage');
        } catch (e) {
            caught = e;
        }
        // The fw runtime throws a plain `Error` for an unregistered module;
        // the missing name is the first undeclared dependency, read off the
        // error's tail.
        expect(caught).toBeDefined();
        expect(caught.constructor).toBe(Error);
        expect(caught.message.split(': ').pop()).toBe('standard14Lookup');
    });

    test('the standalone `-rw` root resolves with nothing registered', () => {
        const rt = new ModuleRuntime();
        rt.register(pdfRwBundled);
        const core = rt.resolve('pdfRwBundled');
        expect(core.usedExtension('pdfBuilder')).toBe(true);
        const bytes = core.pdfBuilder.builder()
            .addPage()
            .addFont({ name: 'F1', baseFont: 'Helvetica' })
            .build();
        expect(new TextDecoder('latin1').decode(bytes)).toContain('/FontDescriptor');
    });
});
