// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/tests/golden-fw.integration.test.js
//
// The frozen-input seam itself (tests/golden-fw.js). The other golden suites
// only ever hit its WARM path — the `.complete` marker already exists after the
// first extraction of a run — so the extraction body, the `git archive` failure
// arm and `stripTestFiles` are never exercised. This suite drives all three.
//
// Cost note: the cold leg re-runs `git archive` + `tar` over packages/front/fw
// at the pinned captureSha; that takes seconds, hence the explicit timeouts.
// It leaves the cache in the SAME complete state it found it in, so any suite
// running afterwards still gets a cache hit.

import { describe, test, expect, afterAll } from 'bun:test';
import { existsSync, rmSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractFwAt, readManifest, readGolden, goldenPath } from './golden-fw.js';

const SHA = readManifest().captureSha;
const CACHE = join(import.meta.dir, 'tmp', 'fw-golden-src');
// A well-formed but non-existent object name: `git archive` refuses it.
const BOGUS = '0'.repeat(40);

afterAll(() => rmSync(join(CACHE, BOGUS), { recursive: true, force: true }));

describe('golden-fw — committed fixture accessors', () => {
    test('goldenPath resolves under __fixtures__/golden and ends with the name', () => {
        const p = goldenPath('fw-audit.txt');
        expect(p.endsWith('fw-audit.txt')).toBe(true);
        expect(p.replace(/\\/g, '/')).toContain('/tests/__fixtures__/golden/');
        expect(existsSync(p)).toBe(true);
        // …and it addresses the same bytes readGolden returns.
        expect(readFileSync(p)).toEqual(readGolden('fw-audit.txt'));
    });

    test('readManifest exposes a 40-hex captureSha', () => {
        expect(SHA).toMatch(/^[0-9a-f]{40}$/);
    });
});

describe('golden-fw — cold extraction path', () => {
    test(
        'a missing .complete marker re-extracts and re-creates it',
        () => {
            const base = join(CACHE, SHA);
            const marker = join(base, '.complete');
            const pkgJson = join(base, 'packages', 'front', 'fw', 'package.json');

            // Force the cold path: only the marker is removed, so a helper that
            // skipped the re-extraction would leave a stale tree behind.
            rmSync(marker, { force: true });
            expect(existsSync(marker)).toBe(false);

            const pkg = extractFwAt(SHA);

            expect(existsSync(marker)).toBe(true);
            expect(readFileSync(marker, 'utf8')).toBe(SHA);
            expect(pkg).toBe(join(base, 'packages', 'front', 'fw'));
            expect(existsSync(pkgJson)).toBe(true);
            // The intermediate archive is cleaned up.
            expect(existsSync(join(base, 'fw.tar'))).toBe(false);
        },
        180_000,
    );

    test('stripTestFiles removed the frozen package\'s own tests', () => {
        const pkg = join(CACHE, SHA, 'packages', 'front', 'fw');
        expect(existsSync(join(pkg, 'tests'))).toBe(false);
        const leftovers = readdirSync(pkg, { recursive: true })
            .map((e) => String(e))
            .filter((e) => /\.(test|spec)\./.test(e));
        expect(leftovers).toEqual([]);
        // Non-test sources DID survive, so the assertion above is not passing
        // because the extraction produced an empty tree.
        expect(existsSync(join(pkg, 'src'))).toBe(true);
    });

    test('twin: a second call is a cache hit — the marker is not rewritten', () => {
        const marker = join(CACHE, SHA, '.complete');
        const before = statSync(marker).mtimeMs;
        const pkg = extractFwAt(SHA);
        expect(existsSync(join(pkg, 'package.json'))).toBe(true);
        expect(statSync(marker).mtimeMs).toBe(before);
    });
});

describe('golden-fw — extraction failure is diagnosed, not swallowed', () => {
    test('an unknown sha throws naming `git archive` and the sha', () => {
        expect(() => extractFwAt(BOGUS)).toThrow(
            new RegExp(`git archive ${BOGUS} failed:`),
        );
        // No marker was written for the failed sha, so a later call retries
        // instead of returning a half-extracted tree.
        expect(existsSync(join(CACHE, BOGUS, '.complete'))).toBe(false);
    });

    test('twin: the real sha still extracts after the failure', () => {
        expect(existsSync(join(extractFwAt(SHA), 'package.json'))).toBe(true);
    });
});
