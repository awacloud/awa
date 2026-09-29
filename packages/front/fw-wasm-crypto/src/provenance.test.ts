// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for src/provenance.js
 *
 * Covers: seed validation, multi-tree fixture, each failure mode,
 * prefix/sorting behavior.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProvenance, provenanceErrors } from './provenance.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SHA256 = 'a'.repeat(64); // 64 lowercase hex chars
const SEED_PATH = join(import.meta.dir, '..', 'vendor', 'PROVENANCE.json');

function makeSeed() {
    return { version: 1, trees: [] };
}

function makeTree(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'libsodium',
        url: 'https://github.com/jedisct1/libsodium/archive/1.0.22-RELEASE.tar.gz',
        ref: '1.0.22-RELEASE',
        sha256: VALID_SHA256,
        license: 'ISC',
        notice: 'Copyright (c) 2013-2025 Frank Denis <j at pureftpd dot org>',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Seed: vendor/PROVENANCE.json validates
// ---------------------------------------------------------------------------

describe('seed (vendor/PROVENANCE.json)', () => {
    it('validateProvenance does not throw on the committed seed', () => {
        const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
        expect(() => validateProvenance(raw)).not.toThrow();
    });

    it('provenanceErrors returns [] for the committed seed', () => {
        const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
        expect(provenanceErrors(raw)).toEqual([]);
    });

    it('in-memory seed also validates', () => {
        expect(() => validateProvenance(makeSeed())).not.toThrow();
        expect(provenanceErrors(makeSeed())).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Multi-tree fixture: 2 entries (one pinned sha256, one "" unpinned)
// ---------------------------------------------------------------------------

describe('multi-tree fixture', () => {
    it('validates a two-entry fixture', () => {
        const fixture = {
            version: 1,
            trees: [
                makeTree({ id: 'libsodium', sha256: VALID_SHA256 }),
                makeTree({ id: 'argon2', sha256: '' }), // unpinned seed
            ],
        };
        expect(() => validateProvenance(fixture)).not.toThrow();
        expect(provenanceErrors(fixture)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Failure modes — validateProvenance throws
// ---------------------------------------------------------------------------

describe('failure modes — validateProvenance throws', () => {
    it('throws when top-level is null', () => {
        expect(() => validateProvenance(null)).toThrow(/^PROVENANCE: /);
    });

    it('throws when top-level is an array', () => {
        expect(() => validateProvenance([])).toThrow(/^PROVENANCE: /);
    });

    it('throws when top-level is a string', () => {
        expect(() => validateProvenance('bad')).toThrow(/^PROVENANCE: /);
    });

    it('throws when version !== 1 (wrong number)', () => {
        expect(() => validateProvenance({ version: 2, trees: [] })).toThrow(/^PROVENANCE: /);
    });

    it('throws when version is a string', () => {
        expect(() => validateProvenance({ version: '1', trees: [] })).toThrow(/^PROVENANCE: /);
    });

    it('throws when version is missing', () => {
        expect(() => validateProvenance({ trees: [] })).toThrow(/^PROVENANCE: /);
    });

    it('throws when trees is missing', () => {
        expect(() => validateProvenance({ version: 1 })).toThrow(/^PROVENANCE: /);
    });

    it('throws when trees is not an array (object)', () => {
        expect(() => validateProvenance({ version: 1, trees: {} })).toThrow(/^PROVENANCE: /);
    });

    it('throws when trees is not an array (string)', () => {
        expect(() => validateProvenance({ version: 1, trees: 'bad' })).toThrow(/^PROVENANCE: /);
    });

    it('throws on unknown top-level key', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [], extra: true })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when a tree entry has a missing required field', () => {
        // Entry missing the "id" field entirely.
        const entry: Record<string, unknown> = {
            url: 'https://example.com',
            ref: 'v1',
            sha256: '',
            license: 'MIT',
            notice: '',
        };
        expect(() => validateProvenance({ version: 1, trees: [entry] })).toThrow(/^PROVENANCE: /);
    });

    it('throws when a tree field has the wrong type (url is number)', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ url: 42 })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when id is empty string', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ id: '' })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when id is duplicated across trees', () => {
        expect(() =>
            validateProvenance({
                version: 1,
                trees: [makeTree({ id: 'dup' }), makeTree({ id: 'dup' })],
            })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when sha256 is 63 chars (too short)', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ sha256: 'a'.repeat(63) })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when sha256 is 64 uppercase hex chars', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ sha256: 'A'.repeat(64) })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when sha256 contains non-hex chars', () => {
        // 64 chars but includes 'g'
        const bad = 'g' + 'a'.repeat(63);
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ sha256: bad })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when license is empty string', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ license: '' })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when a tree has an unknown key', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [makeTree({ extra: 'bad' })] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when a tree entry is null', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: [null] })
        ).toThrow(/^PROVENANCE: /);
    });

    it('throws when a tree entry is a string', () => {
        expect(() =>
            validateProvenance({ version: 1, trees: ['bad'] })
        ).toThrow(/^PROVENANCE: /);
    });
});

// ---------------------------------------------------------------------------
// validateProvenance prefix check
// ---------------------------------------------------------------------------

describe('validateProvenance error prefix', () => {
    it('thrown message starts with "PROVENANCE: "', () => {
        let msg = '';
        try {
            validateProvenance(null);
        } catch (e: unknown) {
            if (e instanceof Error) msg = e.message;
        }
        expect(msg.startsWith('PROVENANCE: ')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// provenanceErrors: non-throwing, returns sorted array
// ---------------------------------------------------------------------------

describe('provenanceErrors', () => {
    it('never throws on bad input', () => {
        const badInputs: unknown[] = [
            null,
            42,
            'bad',
            [],
            { version: 1, trees: 'not-array' },
            { version: 2, trees: [] },
            undefined,
        ];
        for (const bad of badInputs) {
            expect(() => provenanceErrors(bad)).not.toThrow();
        }
    });

    it('returns a non-empty array for bad input', () => {
        expect(provenanceErrors(null).length).toBeGreaterThan(0);
        expect(provenanceErrors({ version: 2, trees: [] }).length).toBeGreaterThan(0);
    });

    it('returns a sorted array', () => {
        // An input with multiple errors — unknown top-level key + version wrong.
        const errors = provenanceErrors({ version: 2, trees: [], zzz: true, aaa: 1 });
        const sorted = [...errors].sort();
        expect(errors).toEqual(sorted);
    });

    it('returns [] for valid seed', () => {
        expect(provenanceErrors(makeSeed())).toEqual([]);
    });

    it('returns the same errors as validateProvenance would throw, for the same bad input', () => {
        const bad = { version: 99, trees: [] };
        const errors = provenanceErrors(bad);
        let thrown = '';
        try {
            validateProvenance(bad);
        } catch (e: unknown) {
            if (e instanceof Error) thrown = e.message.replace(/^PROVENANCE: /, '');
        }
        // The first error from sorted provenanceErrors should match the thrown message.
        // (validateProvenance throws the FIRST discovered error, provenanceErrors sorts.)
        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toContain(thrown);
    });
});
