// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

// packages/front/office/oconv/src/import-forms.test.js
//
// Static guard for the two-resolution-regimes defect class (BL-1098, live
// again in oconv as BL-1255). A bare `@awacloud/<pkg>/<subpath>` import
// WITHOUT a `.js` suffix resolves under Bun through the target package's
// `exports` map, so `bun test` stays green — while a browser prefix import
// map (`"@awacloud/md/": "/packages/front/office/md/src/"`) requests the
// literal path, 404s, and the WHOLE `@awacloud/oconv` graph fails to link.
// `bun test` cannot see the browser regime; this scan can.

import { describe, test, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Every `from '…'` / `import('…')` / side-effect `import '…'` specifier. */
const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

/** A bare `@awacloud/<pkg>/<subpath>` specifier lacking the `.js` suffix. */
function isExtensionlessSubpath(specifier) {
    return /^@awacloud\/[^/]+\/.+/.test(specifier) && !specifier.endsWith('.js');
}

/** @param {string} src @returns {string[]} */
function offendingSpecifiers(src) {
    return [...src.matchAll(SPECIFIER_RE)]
        .map((m) => m[1])
        .filter(isExtensionlessSubpath);
}

describe('oconv/src import forms (browser prefix import map)', () => {
    test('no extension-less bare @awacloud/*/<subpath> import anywhere under src/', () => {
        // This file is excluded: its non-vacuity leg below quotes the
        // offending forms as string literals on purpose.
        const files = readdirSync(SRC_DIR, { recursive: true })
            .map(String)
            .filter((rel) => rel.endsWith('.js') && rel !== 'import-forms.test.js');
        const offenders = files.flatMap((rel) =>
            offendingSpecifiers(readFileSync(join(SRC_DIR, rel), 'utf8'))
                .map((s) => `${rel}: ${s}`));
        expect(files.length).toBeGreaterThan(50);
        expect(offenders).toEqual([]);
    });

    test('non-vacuity: the scan flags the pre-fix BL-1255 form and passes the fixed and root forms', () => {
        expect(offendingSpecifiers(
            "import { mdFrontmatter } from '@awacloud/md/extra/frontmatter';"
        )).toEqual(['@awacloud/md/extra/frontmatter']);
        expect(offendingSpecifiers(
            "const m = await import('@awacloud/fonts/embed-pdf/subset');"
        )).toEqual(['@awacloud/fonts/embed-pdf/subset']);
        expect(offendingSpecifiers([
            "import { mdFrontmatter } from '@awacloud/md/extra/frontmatter.js';",
            "import { mdMod } from '@awacloud/md';",
            "import { oconvIr } from './ir/ir.js';"
        ].join('\n'))).toEqual([]);
    });
});
