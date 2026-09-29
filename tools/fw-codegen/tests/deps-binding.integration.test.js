// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/deps-binding.integration.test.js
//
// tools/LIGHT_12 — addendum A3: what `deps` generation WRITES must be a real
// binding. Reported by office/BATCH_9 run 2, which generated 327 correct
// descriptors and hit exactly two defective writes, both of the same class —
// an identifier that is not bound in the file's scope, written with exit 0 and
// no warning, caught only by the consumer's test suite.
//
//   Trigger A  the framework `name:` used as the JS binding (`md.js` is
//              `name: 'md'` / `export const mdMod`).
//   Trigger B  a JSDoc usage example parsed as a live import
//              (`wml-run-formatting.js`).
//
// Everything here is static text analysis: no fixture is imported or executed.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { rmSync, mkdirSync, cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { planDeps, stripComments } from '../src/deps/index.js';
import { parseFile } from '@awacloud/tool-fw-bundler/modlib';

const FIX = join(import.meta.dir, '__fixtures__');
const TMP = join(import.meta.dir, '__tmp_binding__');

function cleanTmp() { rmSync(TMP, { recursive: true, force: true }); }
afterAll(cleanTmp);

/** Copy the fixture package to a fresh temp tree the injector may mutate. */
function freshPkg() {
    cleanTmp();
    mkdirSync(TMP, { recursive: true });
    const pkg = join(TMP, 'pkg');
    cpSync(join(FIX, 'deps-binding'), pkg, { recursive: true });
    return pkg;
}

/** The planned entry for a given module name, or undefined. */
const planFor = (result, moduleName) =>
    result.plan.find((p) => p.info.moduleName === moduleName);

/**
 * The identifiers inside the injected `deps: [...]` of a planned source.
 *
 * Comments are stripped FIRST, and not incidentally: the `documented` fixture
 * describes the bug it encodes, prose included — `deps: [entitiesMod]`. A
 * naive match reads that sentence and reports the very defect the fixture
 * exists to prove absent. The helper made the same mistake as the tool.
 */
function depsOf(updatedSrc) {
    const m = /deps:\s*\[([^\]]*)\]/.exec(stripComments(updatedSrc));
    return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Task 02 — stripComments: the parsing substrate
// ─────────────────────────────────────────────────────────────────────────

describe('stripComments', () => {
    test('blanks a block comment but preserves length and line count', () => {
        const src = "const a = 1;\n/* import { x } from 'y'; */\nconst b = 2;\n";
        const out = stripComments(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n').length).toBe(src.split('\n').length);
        expect(out).not.toContain('import');
        expect(out).toContain('const a = 1;');
        expect(out).toContain('const b = 2;');
    });

    test('blanks a line comment', () => {
        const out = stripComments("// import { x } from 'y';\nconst a = 1;");
        expect(out).not.toContain('import');
        expect(out).toContain('const a = 1;');
    });

    test('keeps string literals intact — specifiers must survive', () => {
        const src = "import { x } from '@fw/x.js';";
        expect(stripComments(src)).toBe(src);
    });

    test('a comment marker inside a string does not start a comment', () => {
        const src = "const u = 'http://example.com/a';\nconst b = 2;";
        const out = stripComments(src);
        expect(out).toContain("'http://example.com/a'");
        expect(out).toContain('const b = 2;');
    });

    test('an unterminated block comment blanks to end of file without throwing', () => {
        const out = stripComments('const a = 1;\n/* dangling');
        expect(out).toContain('const a = 1;');
        expect(out).not.toContain('dangling');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 01 — the module name is not the JS binding
// ─────────────────────────────────────────────────────────────────────────

describe('name ≠ exported binding (trigger A — md.js shape)', () => {
    let pkg;
    beforeEach(() => { pkg = freshPkg(); });

    test('emits an ALIASED import so deps still mirrors dependencies', () => {
        const p = planFor(planDeps({ pkg }), 'consumer');
        expect(p).toBeDefined();
        expect(p.addedImports).toEqual([
            "import { renamedMod as renamed } from './renamed.js';",
        ]);
        // validate-deps compares deps[i] to dependencies[i] TEXTUALLY.
        expect(depsOf(p.updatedSrc)).toEqual(['renamed']);
    });

    test('the aliased local is a real binding of the rewritten source', () => {
        const p = planFor(planDeps({ pkg }), 'consumer');
        // The alias introduces `renamed`; the phantom guard would have skipped
        // the module otherwise, so reaching a plan at all is the assertion.
        expect(p.updatedSrc).toContain('as renamed');
        expect(p.updatedSrc).not.toContain("import { renamed }");
    });

    test('no gratuitous alias when name and binding agree', () => {
        const p = planFor(planDeps({ pkg }), 'documented');
        for (const imp of p.addedImports) expect(imp).not.toContain(' as ');
    });

    test('an alias that would shadow a top-level binding is skipped, not written', () => {
        const result = planDeps({ pkg });
        expect(planFor(result, 'shadowed')).toBeUndefined();
        const skip = result.unresolved.find((u) => u.moduleName === 'shadowed');
        expect(skip).toBeDefined();
        expect(skip.missing).toEqual(['renamed']);
    });

    test('a function-scoped const of the same name is not a top-level binding', () => {
        // `renamed.js` declares `const renamed` INSIDE its factory. If that
        // counted, `consumer` above would have been skipped as a collision.
        const src = readFileSync(join(pkg, 'src', 'mod', 'renamed.js'), 'utf8');
        expect(src).toContain('const renamed = { r: 1 };');
        expect(planFor(planDeps({ pkg }), 'consumer')).toBeDefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 02 — a documented example is not a binding
// ─────────────────────────────────────────────────────────────────────────

describe('JSDoc example parsed as an import (trigger B — ooxml shape)', () => {
    let pkg;
    beforeEach(() => { pkg = freshPkg(); });

    test('resolves through the fw_require guard, not the comment', () => {
        const p = planFor(planDeps({ pkg }), 'documented');
        expect(p).toBeDefined();
        expect(p.addedImports).toEqual([
            "import { htmlEntities } from '@awacloud/fw/io/text/html-entities.js';",
        ]);
        expect(depsOf(p.updatedSrc)).toEqual(['htmlEntities']);
    });

    test('the aliased name from the comment never reaches the output', () => {
        const p = planFor(planDeps({ pkg }), 'documented');
        expect(depsOf(p.updatedSrc)).not.toContain('entitiesMod');
        // The comment itself is untouched — only the parse ignores it.
        expect(p.updatedSrc).toContain('entitiesMod.factory()');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 03 — the emit guard, and the two real office descriptors
// ─────────────────────────────────────────────────────────────────────────

describe('emit guard — every deps identifier is a real binding', () => {
    let pkg;
    beforeEach(() => { pkg = freshPkg(); });

    test('every planned module has all its deps identifiers bound', () => {
        for (const p of planDeps({ pkg }).plan) {
            const deps = depsOf(p.updatedSrc) ?? [];
            for (const id of deps) {
                const imported = new RegExp(
                    `import\\s*\\{[^}]*(?:\\bas\\s+${id}\\b|\\b${id}\\b)[^}]*\\}`
                ).test(p.updatedSrc);
                const declared = new RegExp(
                    `(?:^|\\n)(?:export\\s+)?(?:const|let|var|function|class)\\s+${id}\\b`
                ).test(p.updatedSrc);
                expect(imported || declared).toBe(true);
            }
        }
    });
});

describe('office proof — the two descriptors BATCH_9 could not generate', () => {
    const OFFICE = (p) => join(import.meta.dir, '..', '..', '..', 'packages', 'front', 'office', p);

    // office/BATCH_9 has since applied both descriptors (commit 89c4c51d):
    // `planDeps` no longer PLANS them at all (`rewriteFile` short-circuits on
    // `info.hasDepsField`), so the original pending-plan assertions became
    // permanently unreachable. These are DELIVERED-STATE assertions against
    // the committed source instead — the same rule `deps-office-coverage`'s
    // own header states: plan/pending counts are execution-time facts that
    // drop to 0 once applied, never something to assert again post-delivery.

    test('md: mdFullBundle carries the resolved aliased `md` dependency', () => {
        const file = join(OFFICE('md'), 'src', 'bundles', 'md-full.js');
        const src = readFileSync(file, 'utf8');
        const info = parseFile(file);
        expect(info.hasDepsField).toBe(true);
        expect(info.depNames[0]).toBe('md');
        expect(src).toContain("import { mdMod as md } from '../md.js';");
        expect(depsOf(src)[0]).toBe('md');
    });

    test('ooxml: wmlRunFormatting carries the resolved real fw `xml` dependency', () => {
        const file = join(OFFICE('ooxml'), 'src', 'extra', 'wml-run-formatting.js');
        const src = readFileSync(file, 'utf8');
        const info = parseFile(file);
        expect(info.hasDepsField).toBe(true);
        expect(info.depNames).toContain('xml');
        expect(src).toContain("import { xml } from '@awacloud/fw/io/codec/xml.js';");
        expect(depsOf(src)).toContain('xml');
    });

    test('all five office packages still plan with zero unresolved', () => {
        for (const name of ['fonts', 'md', 'odf', 'ooxml', 'pdf']) {
            expect(planDeps({ pkg: OFFICE(name) }).unresolved).toEqual([]);
        }
    });
});
