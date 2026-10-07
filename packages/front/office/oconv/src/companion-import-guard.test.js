// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/src/companion-import-guard.test.js
//
// Gate G-OF1 static guard: `@awacloud/oconv` reaches the default face pack by
// the module NAME `oconvDefaultFaces` only (the stand-in in
// `write/pdf/default-faces.js` is displaced by a registered pack), and never
// names the companion package anywhere under `src/` — code, comments and
// tests alike. An application that does not ship the pack must still link.
//
// The needle is BUILT at runtime so this file's own source never contains
// it, and the scan therefore needs no self-exclusion.

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's `src/`, resolved from this file's own location (cwd-independent, BL-1564) — this file IS `src/`. */
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

/** The companion package's name, assembled so no source file spells it. */
const NEEDLE = ['oconv', 'fonts'].join('-');

/** @param {string} text @returns {boolean} */
function mentionsCompanion(text) {
    return text.includes(NEEDLE);
}

describe('oconv/src never names the companion face pack (G-OF1)', () => {
    test('zero files under src/ contain the companion package name', () => {
        const files = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => join(d.parentPath ?? d.path, d.name));
        const hits = files.filter((file) => mentionsCompanion(readFileSync(file, 'utf8')));
        expect(files.length).toBeGreaterThan(50);
        expect(hits).toEqual([]);
    });

    test('non-vacuity: the same matcher flags a scratch string carrying the joined needle', () => {
        const scratch = `import { x } from '@awacloud/${NEEDLE}';`;
        expect(mentionsCompanion(scratch)).toBe(true);
        expect(mentionsCompanion("runtime.resolve('oconvDefaultFaces')")).toBe(false);
    });
});
