// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/io/text/semver.test.js
import { describe, test, expect, beforeEach } from 'bun:test';
import { semver } from './semver.js';

describe('semver module', () => {
    // --- 1. Metadata ------------------------------------------------------
    test('should have correct module metadata', () => {
        expect(semver.name).toBe('semver');
        expect(semver.version).toBe('1.0.0');
        expect(semver.type).toBe('fw.io.text');
        expect(semver.dependencies).toEqual([]);
        expect(typeof semver.factory).toBe('function');
    });

    // --- 2. Factory API ---------------------------------------------------
    describe('factory', () => {
        test('returns instance with expected API', () => {
            const inst = semver.factory();
            expect(typeof inst.valid).toBe('function');
            expect(typeof inst.parse).toBe('function');
            expect(typeof inst.compare).toBe('function');
            expect(typeof inst.satisfies).toBe('function');
            expect(typeof inst.maxSatisfying).toBe('function');
            expect(typeof inst.range).toBe('object');
            expect(typeof inst.range.parse).toBe('function');
        });
    });

    // --- 3. valid ---------------------------------------------------------
    describe('valid', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        test('accepts 0.0.0', () => expect(inst.valid('0.0.0')).toBe(true));
        test('accepts 1.2.3', () => expect(inst.valid('1.2.3')).toBe(true));
        test('accepts 1.0.0-alpha', () => expect(inst.valid('1.0.0-alpha')).toBe(true));
        test('accepts 1.0.0-alpha.1', () => expect(inst.valid('1.0.0-alpha.1')).toBe(true));
        test('accepts 1.0.0-0.3.7', () => expect(inst.valid('1.0.0-0.3.7')).toBe(true));
        test('accepts 1.0.0+build', () => expect(inst.valid('1.0.0+build')).toBe(true));
        test('accepts 1.0.0-beta+exp.sha.5114f85', () => expect(inst.valid('1.0.0-beta+exp.sha.5114f85')).toBe(true));

        test('rejects "1" (missing minor/patch)', () => expect(inst.valid('1')).toBe(false));
        test('rejects "1.2" (missing patch)', () => expect(inst.valid('1.2')).toBe(false));
        test('rejects "01.2.3" (leading zero in major)', () => expect(inst.valid('01.2.3')).toBe(false));
        test('rejects "v1.2.3" (v prefix)', () => expect(inst.valid('v1.2.3')).toBe(false));
        test('rejects empty string', () => expect(inst.valid('')).toBe(false));
        test('rejects "1.2.3-" (empty pre-release)', () => expect(inst.valid('1.2.3-')).toBe(false));
        test('rejects "1.2.3+" (empty build)', () => expect(inst.valid('1.2.3+')).toBe(false));
        test('rejects null', () => expect(inst.valid(null)).toBe(false));
        test('rejects undefined', () => expect(inst.valid(undefined)).toBe(false));
        test('rejects number', () => expect(inst.valid(42)).toBe(false));
    });

    // --- 4. parse ---------------------------------------------------------
    describe('parse', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        test('parses simple version', () => {
            const r = inst.parse('1.2.3');
            expect(r).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
        });

        test('round-trip: parse preserves all components', () => {
            const r = inst.parse('1.0.0-alpha.1+build.42');
            expect(r.major).toBe(1);
            expect(r.minor).toBe(0);
            expect(r.patch).toBe(0);
            expect(r.prerelease).toEqual(['alpha', 1]);
            expect(r.build).toEqual(['build', '42']);
        });

        test('converts numeric pre-release identifiers to number', () => {
            const r = inst.parse('1.0.0-0.3.7');
            expect(r.prerelease).toEqual([0, 3, 7]);
        });

        test('keeps alphanumeric pre-release as string', () => {
            const r = inst.parse('1.0.0-alpha.1');
            expect(r.prerelease).toEqual(['alpha', 1]);
        });

        test('returns null for invalid version', () => {
            expect(inst.parse('not-valid')).toBeNull();
            expect(inst.parse('')).toBeNull();
            expect(inst.parse(null)).toBeNull();
            expect(inst.parse(undefined)).toBeNull();
        });

        test('returns empty prerelease/build arrays when absent', () => {
            const r = inst.parse('2.0.0');
            expect(r.prerelease).toEqual([]);
            expect(r.build).toEqual([]);
        });
    });

    // --- 5. compare -------------------------------------------------------
    describe('compare', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        test('1.2.3 < 1.2.4', () => expect(inst.compare('1.2.3', '1.2.4')).toBe(-1));
        test('1.2.4 > 1.2.3', () => expect(inst.compare('1.2.4', '1.2.3')).toBe(1));
        test('1.2.3 = 1.2.3', () => expect(inst.compare('1.2.3', '1.2.3')).toBe(0));
        test('1.0.0-alpha < 1.0.0 (pre-release < release)', () => {
            expect(inst.compare('1.0.0-alpha', '1.0.0')).toBe(-1);
        });
        test('1.0.0 > 1.0.0-alpha', () => {
            expect(inst.compare('1.0.0', '1.0.0-alpha')).toBe(1);
        });
        test('1.0.0-alpha < 1.0.0-beta (lex order)', () => {
            expect(inst.compare('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
        });
        test('1.0.0-alpha.1 < 1.0.0-alpha.2', () => {
            expect(inst.compare('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
        });
        test('1.0.0-alpha.10 > 1.0.0-alpha.9 (numeric comparison)', () => {
            expect(inst.compare('1.0.0-alpha.10', '1.0.0-alpha.9')).toBe(1);
        });
        test('major version takes priority', () => {
            expect(inst.compare('2.0.0', '1.9.9')).toBe(1);
        });
        test('minor version comparison', () => {
            expect(inst.compare('1.10.0', '1.9.0')).toBe(1);
        });
        test('numeric pre-release < alphanumeric pre-release (semver rule)', () => {
            // semver spec: numeric ids < alphanumeric ids when compared
            expect(inst.compare('1.0.0-1', '1.0.0-alpha')).toBe(-1);
        });
    });

    // --- 6. satisfies -----------------------------------------------------
    describe('satisfies', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        // Caret ^
        test('^1.0.0 includes 1.2.3', () => expect(inst.satisfies('1.2.3', '^1.0.0')).toBe(true));
        test('^1.0.0 excludes 2.0.0', () => expect(inst.satisfies('2.0.0', '^1.0.0')).toBe(false));
        test('^0.1.0 includes 0.1.5', () => expect(inst.satisfies('0.1.5', '^0.1.0')).toBe(true));
        test('^0.1.0 excludes 0.2.0', () => expect(inst.satisfies('0.2.0', '^0.1.0')).toBe(false));
        test('^0.0.3 includes 0.0.3 only', () => {
            expect(inst.satisfies('0.0.3', '^0.0.3')).toBe(true);
            expect(inst.satisfies('0.0.4', '^0.0.3')).toBe(false);
        });

        // Tilde ~
        test('~1.2.0 includes 1.2.5', () => expect(inst.satisfies('1.2.5', '~1.2.0')).toBe(true));
        test('~1.2.0 excludes 1.3.0', () => expect(inst.satisfies('1.3.0', '~1.2.0')).toBe(false));

        // Space intersection (AND)
        test('>=1.0.0 <2.0.0 includes 1.5.0', () => {
            expect(inst.satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
        });
        test('>=1.0.0 <2.0.0 excludes 2.0.0', () => {
            expect(inst.satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
        });

        // Union || (OR)
        test('>=1.0.0 <2.0.0 || ^3.0.0 includes 1.0.0', () => {
            expect(inst.satisfies('1.0.0', '>=1.0.0 <2.0.0 || ^3.0.0')).toBe(true);
        });
        test('>=1.0.0 <2.0.0 || ^3.0.0 includes 3.5.0', () => {
            expect(inst.satisfies('3.5.0', '>=1.0.0 <2.0.0 || ^3.0.0')).toBe(true);
        });
        test('>=1.0.0 <2.0.0 || ^3.0.0 excludes 2.5.0', () => {
            expect(inst.satisfies('2.5.0', '>=1.0.0 <2.0.0 || ^3.0.0')).toBe(false);
        });

        // Simple operators
        test('= operator exact match', () => {
            expect(inst.satisfies('1.0.0', '=1.0.0')).toBe(true);
            expect(inst.satisfies('1.0.1', '=1.0.0')).toBe(false);
        });
        test('> operator strictly greater', () => {
            expect(inst.satisfies('1.0.1', '>1.0.0')).toBe(true);
            expect(inst.satisfies('1.0.0', '>1.0.0')).toBe(false);
        });
        test('<= operator less or equal', () => {
            expect(inst.satisfies('1.0.0', '<=1.0.0')).toBe(true);
            expect(inst.satisfies('1.0.1', '<=1.0.0')).toBe(false);
        });

        // * wildcard
        test('* matches everything', () => {
            expect(inst.satisfies('1.0.0', '*')).toBe(true);
            expect(inst.satisfies('99.99.99', '*')).toBe(true);
        });

        // Pre-release edge cases
        test('^1.0.0 does not include 1.0.0-beta (pre-release exclusion)', () => {
            expect(inst.satisfies('1.0.0-beta', '^1.0.0')).toBe(false);
        });
        test('>=1.2.3-alpha <=1.2.3-rc includes 1.2.3-beta (same triplet on both bounds)', () => {
            // The bound >=1.2.3-alpha has a pre-release on the same triplet 1.2.3 -> OK.
            // The bound <1.2.4 has no pre-release but the version triplet (1.2.3) != 1.2.4
            // -> the pre-release rule on the < bound applies and would reject 1.2.3-beta.
            // Use a range where both bounds carry a pre-release on the same triplet.
            expect(inst.satisfies('1.2.3-beta', '>=1.2.3-alpha <=1.2.3-rc')).toBe(true);
        });

        // Invalid version
        test('returns false for invalid version', () => {
            expect(inst.satisfies('not-a-version', '^1.0.0')).toBe(false);
        });
    });

    // --- 7. maxSatisfying -------------------------------------------------
    describe('maxSatisfying', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        test('returns highest matching version', () => {
            expect(inst.maxSatisfying(['1.0.0', '1.5.0', '2.0.0'], '^1.0.0')).toBe('1.5.0');
        });

        test('returns null when no version matches', () => {
            expect(inst.maxSatisfying(['3.0.0', '4.0.0'], '^1.0.0')).toBeNull();
        });

        test('returns null for empty array', () => {
            expect(inst.maxSatisfying([], '^1.0.0')).toBeNull();
        });

        test('returns null for non-array input', () => {
            expect(inst.maxSatisfying(null, '^1.0.0')).toBeNull();
            expect(inst.maxSatisfying(undefined, '^1.0.0')).toBeNull();
        });

        test('skips invalid versions in array', () => {
            expect(inst.maxSatisfying(['1.0.0', 'not-valid', '1.2.0'], '^1.0.0')).toBe('1.2.0');
        });

        test('handles single element matching', () => {
            expect(inst.maxSatisfying(['1.0.0'], '>=1.0.0')).toBe('1.0.0');
        });

        test('OR range picks highest across both sides', () => {
            expect(inst.maxSatisfying(['1.0.0', '1.5.0', '3.0.0', '3.5.0'], '^1.0.0 || ^3.0.0')).toBe('3.5.0');
        });
    });

    // --- 8. range.parse ---------------------------------------------------
    describe('range.parse', () => {
        let inst;
        beforeEach(() => { inst = semver.factory(); });

        test('returns array of groups', () => {
            const r = inst.range.parse('^1.0.0');
            expect(Array.isArray(r)).toBe(true);
            expect(r.length).toBe(1);
            expect(Array.isArray(r[0])).toBe(true);
        });

        test('caret produces two comparators', () => {
            const r = inst.range.parse('^1.2.3');
            expect(r[0]).toHaveLength(2);
            expect(r[0][0].op).toBe('>=');
            expect(r[0][1].op).toBe('<');
        });

        test('OR produces multiple groups', () => {
            const r = inst.range.parse('^1.0.0 || ^2.0.0');
            expect(r).toHaveLength(2);
        });

        test('* produces wildcard comparator', () => {
            const r = inst.range.parse('*');
            expect(r[0][0].op).toBe('*');
        });

        test('returns empty for non-string', () => {
            expect(inst.range.parse(null)).toEqual([]);
            expect(inst.range.parse(undefined)).toEqual([]);
        });
    });
});
