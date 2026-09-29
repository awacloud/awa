// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-pkgrequire.integration.test.js
//
// tools/LIGHT_10 — addendum A2: cross-PACKAGE name resolution through a
// `pkg_require` namespace spread (`import * as sib from '@fx/sibling'` +
// `...sib.modules`). LIGHT_9 resolved fw names only, which left
// `packages/front/office/pdf`'s `pdfFontEmbed` unresolvable.
//
// Everything here is static text analysis: no package is ever imported or
// executed, and the fixture packages are not installed anywhere.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { parseFile } from '@awacloud/tool-fw-bundler/modlib';
import { planDeps, runDeps, resolveWorkspacePackage, publicSubpathFor } from '../src/deps/index.js';

const FIX = join(import.meta.dir, '__fixtures__');
const TMP = join(import.meta.dir, '__tmp_pkgrequire__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

/** Copy the fixture workspace to a fresh temp tree the injector may mutate. */
function freshWorkspace() {
    cleanTmp();
    mkdirSync(TMP, { recursive: true });
    const ws = join(TMP, 'ws');
    cpSync(join(FIX, 'deps-workspace'), ws, { recursive: true });
    return ws;
}

// ─────────────────────────────────────────────────────────────────────────
// Task 01 — workspace sibling resolution + public-subpath mapping
// ─────────────────────────────────────────────────────────────────────────

describe('resolveWorkspacePackage — FS-only, node_modules-free', () => {
    let ws;
    beforeEach(() => { ws = freshWorkspace(); });

    test('resolves a package name across a workspaces glob', () => {
        const from = join(ws, 'pkgs', 'consumer', 'src');
        expect(resolveWorkspacePackage('@fx/sibling', from)).toBe(join(ws, 'pkgs', 'sibling'));
    });

    test('a `!`-negated glob never matches', () => {
        const from = join(ws, 'pkgs', 'consumer', 'src');
        // `pkgs/*` would match `pkgs/@private`, but `!pkgs/@*` excludes it.
        expect(resolveWorkspacePackage('@fx/private', from)).toBeNull();
    });

    test('an unknown name returns null rather than throwing', () => {
        expect(resolveWorkspacePackage('@fx/nope', join(ws, 'pkgs', 'consumer'))).toBeNull();
    });

    test('a manifest without `workspaces` is walked past, not taken as the root', () => {
        // The fixture declares a name but no `workspaces`: the walk continues
        // upward (to the real awa root), where `@fx/sibling` does not exist.
        const from = join(FIX, 'deps-noworkspace');
        expect(resolveWorkspacePackage('@fx/sibling', from)).toBeNull();
        // …and the real workspace above it does resolve its own packages.
        expect(resolveWorkspacePackage('@awacloud/tool-fw-codegen', from))
            .toBe(resolve(import.meta.dir, '..'));
    });
});

describe('publicSubpathFor — exports map inversion', () => {
    let ws, sibling;
    beforeEach(() => { ws = freshWorkspace(); sibling = join(ws, 'pkgs', 'sibling'); });

    test('exact target → its declared subpath', () => {
        expect(publicSubpathFor(sibling, join(sibling, 'src', 'thing.js')))
            .toBe('@fx/sibling/thing');
    });

    test('the "." entry maps to the bare package name', () => {
        expect(publicSubpathFor(sibling, join(sibling, 'src', 'main.js'))).toBe('@fx/sibling');
    });

    test('wildcard pattern → substituted subpath', () => {
        expect(publicSubpathFor(sibling, join(sibling, 'src', 'extra', 'one.js')))
            .toBe('@fx/sibling/extra/one');
    });

    test('a file absent from `exports` → null (no private deep path)', () => {
        expect(publicSubpathFor(sibling, join(sibling, 'src', 'hidden.js'))).toBeNull();
    });

    test('a package without an exports map → null', () => {
        expect(publicSubpathFor(join(ws, 'pkgs', 'consumer'), join(ws, 'pkgs', 'consumer', 'src', 'main.js')))
            .toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 02 — the pkg_require resolution layers
// ─────────────────────────────────────────────────────────────────────────

describe('deps — pkg_require namespace-spread resolution', () => {
    let ws, pkg;
    beforeEach(() => { ws = freshWorkspace(); pkg = join(ws, 'pkgs', 'consumer'); });

    const planFor = (name) => planDeps({ pkg }).plan.find((e) => e.info.moduleName === name);
    const read = (f) => readFileSync(join(pkg, 'src', 'mod', f), 'utf8');

    test('a name reached via `...sib.modules` resolves to the PUBLIC subpath', () => {
        expect(planFor('usesSibling').addedImports).toEqual([
            "import { siblingThing } from '@fx/sibling/thing';",
        ]);
        runDeps({ pkg });
        const src = read('uses-sibling.js');
        expect(src).toContain("import { siblingThing } from '@fx/sibling/thing';");
        expect(src).toContain('deps: [siblingThing]');
        expect(src).not.toContain('../');            // never a private relative reach-in
    });

    test('a wildcard-exported sibling module resolves through the pattern', () => {
        expect(planFor('usesExtra').addedImports).toEqual([
            "import { siblingExtra } from '@fx/sibling/extra/one';",
        ]);
    });

    test('a sibling binding imported from @awacloud/fw keeps the fw specifier verbatim', () => {
        expect(planFor('usesFwViaSibling').addedImports).toEqual([
            "import { sharedFw } from '@awacloud/fw/io/text/shared-fw.js';",
        ]);
    });

    test('a sibling module absent from `exports` stays unresolved', () => {
        const { unresolved } = planDeps({ pkg });
        const u = unresolved.find((x) => x.moduleName === 'usesHidden');
        expect(u).toBeDefined();
        expect(u.missing).toEqual(['siblingHidden']);
    });

    test('the spread FIELD is the guard — a name in a non-spread array is unresolved', () => {
        const { unresolved } = planDeps({ pkg });
        expect(unresolved.find((x) => x.moduleName === 'usesUnguarded').missing)
            .toEqual(['siblingUnguarded']);
    });

    test('an unknown sibling package is unresolved, never a throw', () => {
        expect(() => planDeps({ pkg })).not.toThrow();
        const { unresolved } = planDeps({ pkg });
        expect(unresolved.find((x) => x.moduleName === 'usesUnknownPkg').missing)
            .toEqual(['ghostModule']);
    });

    test('layer 1 generalization: a descriptor-local sibling import wins', () => {
        expect(planFor('localSiblingImport').addedImports).toEqual([]);
        runDeps({ pkg });
        const src = read('local-sibling-import.js');
        expect(src.match(/@fx\/sibling/g).length).toBe(1);   // no second import
        expect(src).toContain('deps: [siblingThing]');
    });

    test('skip-and-continue still holds across the new layers', () => {
        const { plan, unresolved } = planDeps({ pkg });
        expect(plan.map((e) => e.info.moduleName).sort())
            .toEqual(['localSiblingImport', 'usesExtra', 'usesFwViaSibling', 'usesSibling']);
        expect(unresolved.map((u) => u.moduleName).sort())
            .toEqual(['usesHidden', 'usesUnguarded', 'usesUnknownPkg']);

        const res = runDeps({ pkg });
        expect(res.updated.length).toBe(4);
        for (const f of ['uses-hidden.js', 'uses-unguarded.js', 'uses-unknown-pkg.js']) {
            expect(parseFile(join(pkg, 'src', 'mod', f)).hasDepsField).toBe(false);
        }
    });
});
