// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/validate-deps.test.js
//
// Check 3 of `validateAll` parses the text of `src/core/modules.js`. fw 1.0
// froze that registry (`export default Object.freeze([ … ]);`, fw T27 /
// 4a74f6761); the parser must read both that shape and the historical
// `export default [ … ];` — and nothing looser: an unknown shape still throws
// a named error that names both accepted forms.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { validateAll } from './validate-deps.js';

const MINI_FW = resolve(import.meta.dir, '..', '..', '..', 'tests', '__fixtures__', 'mini-fw');
const IMPORTS =
    "import { alpha } from '../mod/alpha.js';\nimport { beta } from '../mod/beta.js';\n";

let work;

beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'fw-bundler-validate-deps-'));
    cpSync(join(MINI_FW, 'src'), join(work, 'src'), { recursive: true });
});

afterAll(() => {
    rmSync(work, { recursive: true, force: true });
});

/** Rewrite the fixture registry with `body` and run the validation. */
function validateWith(body) {
    const modulesPath = join(work, 'src', 'core', 'modules.js');
    writeFileSync(modulesPath, `// registry\n${IMPORTS}\n${body}\n`);
    return validateAll(join(work, 'src'), modulesPath);
}

describe('validateAll — modules.js default-export shapes', () => {
    test('the committed fixture (plain array) validates', () => {
        const src = readFileSync(join(MINI_FW, 'src', 'core', 'modules.js'), 'utf8');
        expect(src).toMatch(/export default \[alpha, beta\];/);
        expect(validateWith('export default [alpha, beta];').checked).toBeGreaterThan(0);
    });

    test('plain array: multi-line, trailing comma and line comments', () => {
        const r = validateWith('export default [\n    alpha, // first\n    beta,\n];');
        expect(r.checked).toBeGreaterThan(0);
    });

    test('frozen array (fw 1.0): single line', () => {
        const r = validateWith('export default Object.freeze([alpha, beta]);');
        expect(r.checked).toBeGreaterThan(0);
    });

    test('frozen array (fw 1.0): multi-line, trailing comma and line comments', () => {
        const r = validateWith(
            '// Frozen: …\nexport default Object.freeze([\n    alpha, // first\n    beta,\n]);'
        );
        expect(r.checked).toBeGreaterThan(0);
    });

    test('frozen array without a trailing semicolon', () => {
        expect(validateWith('export default Object.freeze([alpha, beta])').checked).toBeGreaterThan(0);
    });

    test('a frozen registry with a missing module is still reported as out of sync', () => {
        expect(() => validateWith('export default Object.freeze([alpha]);')).toThrow(
            /Missing from modules\.js[\s\S]*beta/
        );
    });

    test('a frozen registry with an orphan is still reported as out of sync', () => {
        expect(() => validateWith('export default Object.freeze([alpha, beta, ghost]);')).toThrow(
            /Orphans in modules\.js[\s\S]*ghost/
        );
    });

    for (const [label, body] of [
        ['a wrapper other than Object.freeze', 'export default Object.assign([alpha, beta], {});'],
        ['an unfrozen identifier', 'export default registry;'],
        ['a named export', 'export const modules = [alpha, beta];'],
        ['a call on the array', 'export default [alpha, beta].slice();'],
        ['Object.freeze of a non-literal', 'export default Object.freeze(list);'],
    ]) {
        test(`rejects ${label} with a named error naming both accepted forms`, () => {
            let err;
            try {
                validateWith(body);
            } catch (e) {
                err = e;
            }
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toContain('[validate-deps]');
            expect(err.message).toContain('export default [...]');
            expect(err.message).toContain('export default Object.freeze([...])');
        });
    }
});
