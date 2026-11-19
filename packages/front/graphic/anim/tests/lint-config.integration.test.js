// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview Non-vacuity gate for the package's own ESLint config.
 *
 * A green lint run proves nothing until the rules that applied are known
 * (`ai/conventions/tool.md` § Lint configuration): a tree matched by no config
 * block is linted with zero rules and exits 0. This file asks ESLint itself:
 *
 *   - `--print-config <file>` for one file per tree: the active rule count is
 *     above a stated floor and the key rules are present;
 *   - `--stdin` with a planted violation per tree: the violation is reported.
 *     Nothing is written to disk.
 */

import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Run the package's ESLint (the same `bunx eslint` the gate uses).
 * @param {string[]} args
 * @param {string} [stdin]
 */
function eslint(args, stdin) {
    return spawnSync('bunx', ['eslint', ...args], { cwd: PKG, encoding: 'utf8', input: stdin, shell: process.platform === 'win32' });
}

/**
 * Active (non-`off`) rule names for `file` under the package config.
 * @param {string} file Package-relative path.
 * @returns {string[]}
 */
function activeRules(file) {
    const r = eslint(['--print-config', file]);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(r.stdout);
    return Object.entries(cfg.rules || {})
        .filter(([, v]) => {
            const level = Array.isArray(v) ? v[0] : v;
            return level !== 0 && level !== 'off';
        })
        .map(([k]) => k);
}

/**
 * Rule ids reported for `code` linted as if it lived at `file`.
 * @param {string} file
 * @param {string} code
 * @returns {string[]}
 */
function reported(file, code) {
    const r = eslint(['--stdin', '--stdin-filename', file, '--format', 'json'], code);
    const out = JSON.parse(r.stdout || '[]');
    return out.flatMap((f) => f.messages.map((m) => m.ruleId));
}

describe('lint config — every tree is really linted', () => {
    test('src: fw src rule set (sanity-derived restrictions + factory capture)', () => {
        const rules = activeRules('src/anim/tween.js');
        expect(rules.length).toBeGreaterThanOrEqual(60);
        for (const r of ['no-restricted-globals', 'no-restricted-properties', 'no-restricted-syntax',
            'fw/no-factory-capture', 'no-undef', 'no-unused-vars', 'no-var', 'no-eval']) {
            expect(rules).toContain(r);
        }
    });

    test('tests: recommended rules, restrictions off', () => {
        const rules = activeRules('tests/lint-config.integration.test.js');
        expect(rules.length).toBeGreaterThanOrEqual(50);
        expect(rules).toContain('no-undef');
        expect(rules).not.toContain('fw/no-factory-capture');
    });

    test('tools: recommended rules with node globals', () => {
        const rules = activeRules('tools/generate-bundles.mjs');
        expect(rules.length).toBeGreaterThanOrEqual(50);
        expect(rules).toContain('no-undef');
    });

    test('types: typescript-eslint on .d.ts', () => {
        const rules = activeRules('types/main.d.ts');
        expect(rules.some((r) => r.startsWith('@typescript-eslint/'))).toBe(true);
    });
});

describe('lint config — planted violations are caught (stdin, nothing written)', () => {
    test('src: a raw performance.now() is reported', () => {
        expect(reported('src/anim/_planted.js', 'export const t = performance.now();\n'))
            .toContain('no-restricted-properties');
    });

    test('src: an undefined identifier is reported', () => {
        expect(reported('src/anim/_planted.js', 'export const t = notDefinedAnywhere;\n'))
            .toContain('no-undef');
    });

    test('tests: an undefined identifier is reported', () => {
        expect(reported('tests/_planted.test.js', 'notDefinedAnywhere();\n')).toContain('no-undef');
    });

    test('tools: an unused variable is reported', () => {
        expect(reported('tools/_planted.mjs', 'const unused = 1;\n')).toContain('no-unused-vars');
    });

    test('types: a duplicate-free but empty interface is reported', () => {
        expect(reported('types/_planted.d.ts', 'export interface Empty {}\n'))
            .toContain('@typescript-eslint/no-empty-object-type');
    });
});
