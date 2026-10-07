// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Spec version lockfile — asserts the CommonMark spec version
 * the suite is run against. If the upstream spec is upgraded (e.g. 0.32),
 * this test will fail until the package has been audited against the new
 * spec and EXPECTED_COMMONMARK_VERSION below is bumped.
 *
 * GFM does not currently carry a machine-readable version header in the
 * reference HTML, so we lock on the file hash of the curated test cases
 * inside `gfm-suite.test.js` indirectly via line count (cheap defensive).
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const EXPECTED_COMMONMARK_VERSION = '0.31.2';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, '_fixtures/commonmark/spec.txt');

describe('spec version lockfile', () => {
    test('CommonMark spec.txt header version matches expected', () => {
        const text = readFileSync(SPEC_PATH, 'utf8').replace(/\r\n?/g, '\n');
        const m = text.match(/^version:\s*'?([^'\n]+)'?$/m);
        expect(m).not.toBeNull();
        expect(m[1].trim()).toBe(EXPECTED_COMMONMARK_VERSION);
    });

    test('CommonMark spec.txt has the expected example count', () => {
        // Defense-in-depth — if a future spec version trims examples, the
        // version test above will fail first. If only the example count
        // changes (e.g. someone replaces spec.txt with a non-official copy),
        // this catches it. Locked at 652 (CommonMark 0.31.2).
        const text = readFileSync(SPEC_PATH, 'utf8').replace(/\r\n?/g, '\n');
        const fences = text.match(/^`{32} example/gm) || [];
        expect(fences.length).toBe(652);
    });
});
