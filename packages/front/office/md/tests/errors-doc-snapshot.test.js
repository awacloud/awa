// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Guard test — locks `docs/api/errors.md`'s "Stable codes"
 * table to the LIVE error registry.
 *
 * Walks `src/**\/*.js` (excluding `*.test.js`) for every `new
 * (MdError|ParseError|RenderError|ContractError)('md/<kebab-case>', …)`
 * call site and collects the distinct `code` strings — the actual,
 * currently-thrown registry. Cross-checks it against the codes listed in
 * `docs/api/errors.md`'s "Stable codes" table: every live code must be
 * documented, and every documented code must still be live (no orphan
 * rows for a code nobody throws anymore).
 *
 * Guard-test pattern (ai/memory/types/office.md, 2026-07-07): both sides
 * are read from their OWN source at test time — never a hardcoded
 * snapshot array — so editing either the throw sites or the doc table
 * without updating the other reds this test.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR   = resolve(__dirname, '../src');
const DOCS_PATH = resolve(__dirname, '../docs/api/errors.md');

const THROW_RE = /new\s+(?:MdError|ParseError|RenderError|ContractError)\s*\(\s*'(md\/[a-z0-9-]+)'/g;
const DOC_ROW_RE = /^\|\s*`(md\/[a-z0-9-]+)`\s*\|/gm;

function collectJsFiles(dir, out) {
    out = out || [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(full, out);
        } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
            out.push(full);
        }
    }
    return out;
}

/** The live registry: every `md/<code>` string passed to an error constructor in `src/`. */
function liveErrorCodes() {
    const codes = new Set();
    for (const file of collectJsFiles(SRC_DIR)) {
        const text = readFileSync(file, 'utf8');
        THROW_RE.lastIndex = 0;
        let m;
        while ((m = THROW_RE.exec(text)) !== null) codes.add(m[1]);
    }
    return codes;
}

/** The documented registry: every `md/<code>` in the "Stable codes" table. */
function documentedErrorCodes() {
    const text = readFileSync(DOCS_PATH, 'utf8');
    const tableSection = text.split('### Stable codes')[1] || '';
    const codes = new Set();
    DOC_ROW_RE.lastIndex = 0;
    let m;
    while ((m = DOC_ROW_RE.exec(tableSection)) !== null) codes.add(m[1]);
    return codes;
}

describe('docs/api/errors.md — error-code snapshot', () => {
    test('documents exactly the live error registry (no more, no less)', () => {
        const live = liveErrorCodes();
        const documented = documentedErrorCodes();

        expect(live.size).toBeGreaterThan(0);
        expect(documented.size).toBeGreaterThan(0);

        const missingFromDocs = [...live].filter((c) => !documented.has(c)).sort();
        const staleInDocs = [...documented].filter((c) => !live.has(c)).sort();

        expect(missingFromDocs).toEqual([]);
        expect(staleInDocs).toEqual([]);
    });
});
