// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// packages/front/fw/src/io/text/semver.js
/**
 * @description
 * Validation, parsing and range matching for semver (semver.org v2.0.0 strict).
 *
 * Covers the manifest needs of SDE (`fw_version: '>=1.0.0 <2.0.0'`,
 * `sde_version: '^1.0.0'`). The fw runtime itself only handles latest/exact;
 * this module provides the full range layer on top.
 *
 * Out of scope: handling of the `v` prefix (invalid here), coercion of
 * non-conforming strings, partial unqualified `x.x` wildcards.
 *
 * Fully self-contained (no dependencies), worker-safe.
 *
 * @example
 * const semver = runtime.resolve('semver');
 * semver.valid('1.0.0');                         // true
 * semver.satisfies('1.2.3', '^1.0.0');           // true
 * semver.maxSatisfying(['1.0.0', '1.5.0', '2.0.0'], '^1.0.0'); // '1.5.0'
 */

/**
 * Parsed semver components.
 * @typedef {object} SemverParsed
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {(string|number)[]} prerelease
 * @property {string[]} build
 */

/**
 * A single normalized range comparator.
 * @typedef {object} SemverComparator
 * @property {string} op Operator (`=`, `>`, `>=`, `<`, `<=`, or `*`).
 * @property {string} version Comparator version.
 */

/**
 * Range sub-namespace.
 * @typedef {object} SemverRangeAPI
 * @property {(s: string) => SemverComparator[][]} parse Normalize a range into OR arrays of AND comparator arrays.
 */

/**
 * Public API returned by `semver.factory()`.
 * @typedef {object} SemverAPI
 * @property {(s: string) => boolean} valid Validate a strict semver 2.0.0 string.
 * @property {(s: string) => SemverParsed|null} parse Parse a version into components, or `null`.
 * @property {(a: string, b: string) => (-1|0|1)} compare Compare two versions.
 * @property {(version: string, range: string) => boolean} satisfies Test whether a version satisfies a range.
 * @property {(versions: string[], range: string) => string|null} maxSatisfying Highest version satisfying a range, or `null`.
 * @property {SemverRangeAPI} range Range parsing helpers.
 */

export const semver = {
    name: 'semver',
    version: '1.0.0',
    type: 'fw.io.text',
    dependencies: [],

    /** @returns {SemverAPI} */
    factory() {
        // --- Regex ----------------------------------------------------------
        // Strict semver 2.0.0: MAJOR.MINOR.PATCH[-pre-release][+build]
        // Numeric identifiers: no leading zeros (0|[1-9]\d*)
        const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

        // --- Private helpers ------------------------------------------------

        /**
         * Compare two pre-release strings identifier by identifier.
         * Semver rules: numeric < alphanumeric, numeric compared as integers.
         * @param {string} a
         * @param {string} b
         * @returns {-1|0|1}
         */
        function _comparePre(a, b) {
            const partsA = a.split('.');
            const partsB = b.split('.');
            const len = Math.max(partsA.length, partsB.length);
            for (let i = 0; i < len; i++) {
                if (i >= partsA.length) return -1; // a has fewer ids -> a < b
                if (i >= partsB.length) return 1;
                const pa = partsA[i];
                const pb = partsB[i];
                const na = /^\d+$/.test(pa);
                const nb = /^\d+$/.test(pb);
                if (na && nb) {
                    const diff = +pa - +pb;
                    if (diff !== 0) return diff < 0 ? -1 : 1;
                } else if (na) {
                    return -1; // numeric < alphanumeric
                } else if (nb) {
                    return 1;
                } else {
                    if (pa < pb) return -1;
                    if (pa > pb) return 1;
                }
            }
            return 0;
        }

        /**
         * Compare two semver versions.
         * @param {string} a
         * @param {string} b
         * @returns {-1|0|1}
         */
        function _cmp(a, b) {
            const ma = SEMVER_RE.exec(a);
            const mb = SEMVER_RE.exec(b);
            if (!ma || !mb) return 0;
            for (let i = 1; i <= 3; i++) {
                const na = +ma[i];
                const nb = +mb[i];
                if (na !== nb) return na < nb ? -1 : 1;
            }
            const preA = ma[4] || '';
            const preB = mb[4] || '';
            if (preA && !preB) return -1; // pre-release < release
            if (!preA && preB) return 1;
            if (!preA && !preB) return 0;
            return _comparePre(preA, preB);
        }

        // --- Range parsing --------------------------------------------------

        /**
         * Expand a caret `^` operator into two comparators.
         * `^0.x.y` -> `~0.x.y` (pre-1.0 semantics).
         * @param {string} ver Semver without operator.
         * @returns {{op: string, version: string}[]}
         */
        function _expandCaret(ver) {
            const m = SEMVER_RE.exec(ver);
            if (!m) return [];
            const [, maj, min, patch] = m;
            const M = +maj, mi = +min, pa = +patch;
            if (M !== 0) {
                // ^1.2.3 -> >=1.2.3 <2.0.0
                return [
                    { op: '>=', version: `${M}.${mi}.${pa}` },
                    { op: '<',  version: `${M + 1}.0.0` },
                ];
            }
            if (mi !== 0) {
                // ^0.1.3 -> >=0.1.3 <0.2.0
                return [
                    { op: '>=', version: `0.${mi}.${pa}` },
                    { op: '<',  version: `0.${mi + 1}.0` },
                ];
            }
            // ^0.0.3 -> >=0.0.3 <0.0.4
            return [
                { op: '>=', version: `0.0.${pa}` },
                { op: '<',  version: `0.0.${pa + 1}` },
            ];
        }

        /**
         * Expand a tilde `~` operator into two comparators.
         * @param {string} ver
         * @returns {{op: string, version: string}[]}
         */
        function _expandTilde(ver) {
            const m = SEMVER_RE.exec(ver);
            if (!m) return [];
            const [, maj, min, patch] = m;
            const M = +maj, mi = +min, pa = +patch;
            // ~1.2.3 -> >=1.2.3 <1.3.0
            return [
                { op: '>=', version: `${M}.${mi}.${pa}` },
                { op: '<',  version: `${M}.${mi + 1}.0` },
            ];
        }

        /**
         * Convert a single comparator token (">1.2.3", "^1.0.0", "*", etc.)
         * into an array of {op, version}.
         * @param {string} token
         * @returns {{op: string, version: string}[]}
         */
        function _parseComparator(token) {
            token = token.trim();
            if (token === '*' || token === 'x' || token === '') {
                return [{ op: '*', version: '0.0.0' }];
            }
            if (token.startsWith('^')) {
                return _expandCaret(token.slice(1));
            }
            if (token.startsWith('~')) {
                return _expandTilde(token.slice(1));
            }
            const m = /^(>=|<=|>|<|=)(.+)$/.exec(token);
            if (m) {
                return [{ op: m[1], version: m[2].trim() }];
            }
            // no operator -> equality
            if (SEMVER_RE.test(token)) {
                return [{ op: '=', version: token }];
            }
            return [];
        }

        /**
         * Check that a version satisfies a single comparator.
         * @param {string} ver Version under test.
         * @param {{op: string, version: string}} comp
         * @returns {boolean}
         */
        function _satisfiesOne(ver, comp) {
            if (comp.op === '*') return true;
            const c = _cmp(ver, comp.version);
            switch (comp.op) {
                case '=':  return c === 0;
                case '>':  return c === 1;
                case '>=': return c >= 0;
                case '<':  return c === -1;
                case '<=': return c <= 0;
                default:   return false;
            }
        }

        /**
         * Check that a version satisfies an AND group (list of comparators).
         * Pre-release rule: a version with a pre-release does not satisfy a
         * range whose bound has no pre-release, unless the major.minor.patch
         * triplet of the version matches that of the bound (standard semver rule).
         * @param {string} ver
         * @param {{op: string, version: string}[]} group
         * @returns {boolean}
         */
        function _satisfiesGroup(ver, group) {
            if (group.length === 0) return false;
            const mVer = SEMVER_RE.exec(ver);
            if (!mVer) return false;
            const verHasPre = !!mVer[4];

            for (const comp of group) {
                if (comp.op === '*') continue;
                if (!_satisfiesOne(ver, comp)) return false;
                // Pre-release rule: a version with pre does not satisfy a range
                // whose bound has no pre, unless the triplet major.minor.patch
                // of the version matches that of the bound.
                if (verHasPre) {
                    const mComp = SEMVER_RE.exec(comp.version);
                    if (mComp && !mComp[4]) {
                        // The bound has no pre-release
                        const sameTriplet =
                            mVer[1] === mComp[1] &&
                            mVer[2] === mComp[2] &&
                            mVer[3] === mComp[3];
                        if (!sameTriplet) return false;
                    }
                }
            }
            return true;
        }

        // --- Public API -----------------------------------------------------

        /**
         * Check whether `s` is a valid semver 2.0.0 version (strict, no `v` prefix).
         * @param {string} s
         * @returns {boolean}
         */
        function valid(s) {
            if (typeof s !== 'string' || s === '') return false;
            return SEMVER_RE.test(s);
        }

        /**
         * Parse a semver version into its components.
         * Numeric pre-release identifiers are converted to numbers.
         * @param {string} s
         * @returns {{major: number, minor: number, patch: number, prerelease: (string|number)[], build: string[]}|null}
         */
        function parse(s) {
            if (typeof s !== 'string') return null;
            const m = SEMVER_RE.exec(s);
            if (!m) return null;
            const preStr = m[4] || '';
            const buildStr = m[5] || '';
            const prerelease = preStr
                ? preStr.split('.').map(id => /^\d+$/.test(id) ? +id : id)
                : [];
            const build = buildStr ? buildStr.split('.') : [];
            return {
                major: +m[1],
                minor: +m[2],
                patch: +m[3],
                prerelease,
                build,
            };
        }

        /**
         * Compare two semver versions.
         * @param {string} a
         * @param {string} b
         * @returns {-1|0|1}
         */
        function compare(a, b) {
            return _cmp(a, b);
        }

        /**
         * Return the normalized form of a semver range.
         * Format: Array<Array<{op, version}>> -- OR arrays of AND arrays.
         * @param {string} s Range string.
         * @returns {Array<Array<{op: string, version: string}>>}
         */
        function parseRange(s) {
            if (typeof s !== 'string') return [];
            // Split OR alternatives (||)
            const orParts = s.split(/\s*\|\|\s*/);
            return orParts.map(orPart => {
                // Each OR part is a set of AND comparators (separated by spaces).
                // Beware operators >= <= (no space inside the tokens).
                const tokens = orPart.trim().split(/\s+/);
                const comparators = [];
                for (const tok of tokens) {
                    if (!tok) continue;
                    const expanded = _parseComparator(tok);
                    comparators.push(...expanded);
                }
                return comparators;
            });
        }

        /**
         * Check whether `version` satisfies `range`.
         * Supported syntaxes: `=`, `>`, `>=`, `<`, `<=`, `^`, `~`, `*`, intersection (space), union (`||`).
         * @param {string} version
         * @param {string} range
         * @returns {boolean}
         */
        function satisfies(version, range) {
            if (!valid(version)) return false;
            const groups = parseRange(range);
            if (groups.length === 0) return false;
            // A version satisfies the range if it satisfies at least one OR group.
            return groups.some(group => _satisfiesGroup(version, group));
        }

        /**
         * Return the highest version in `versions` that satisfies `range`.
         * @param {string[]} versions
         * @param {string} range
         * @returns {string|null}
         */
        function maxSatisfying(versions, range) {
            if (!Array.isArray(versions)) return null;
            const candidates = versions.filter(v => valid(v) && satisfies(v, range));
            if (candidates.length === 0) return null;
            return candidates.reduce((best, v) => _cmp(v, best) === 1 ? v : best, candidates[0]);
        }

        return {
            valid,
            parse,
            compare,
            satisfies,
            maxSatisfying,
            range: {
                parse: parseRange,
            },
        };
    },
};
