// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview commonmark.js test files (`test/regression.txt` and
 * `test/smart_punct.txt`, tag 0.31.2) run through `renderHtml`.
 *
 * Each file runs with the parser configuration commonmark.js gives it: the
 * regression tests with the default parser, the smart-punctuation tests
 * with `smart` on. The examples that differ are pinned by number, so an
 * improvement or a regression shows; see `_fixtures/commonmark-js/README.md`
 * for why each one differs.
 *
 * @module md/tests/commonmark-js.integration
 */

import { test, expect, describe } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMd } from './_helpers/build.js';

function extract(text) {
    const examples = [];
    let section = '';
    const body = text.replace(/\r\n?/g, '\n').replace(/^<!-- END TESTS -->(.|[\n])*/m, '');
    for (const m of body.matchAll(/^`{32} example\n([\s\S]*?)^\.\n([\s\S]*?)^`{32}$|^#{1,6} *(.*)$/gm)) {
        if (m[3] !== undefined) {
            section = m[3];
            continue;
        }
        examples.push({ number: examples.length + 1, section, markdown: m[1].replace(/→/g, '\t'), html: m[2].replace(/→/g, '\t') });
    }
    return examples;
}

function differing(examples, md) {
    // Upstream examples pin the raw passthrough: explicit opt-out of the default hardening.
    return examples.filter((ex) => md.renderHtml(ex.markdown, { safe: false }) !== ex.html).map((ex) => ex.number);
}

const FILES = [
    {
        name: 'regression.txt',
        sha256: 'bc076c02a1f4a4e67c73a8ea46b40b9311c6da3e327a62a623e9ec0248b58941',
        opts: {},
        count: 32,
        differs: [],
    },
    {
        name: 'smart_punct.txt',
        sha256: '5ba9c2a2c39d8ee3211bb3538e61bb6707554e0eb23ac86f2b5f5c243556da58',
        opts: { smart: true },
        count: 15,
        // `smart` is documented as typographic quotes only: dashes and ellipses are not claimed.
        differs: [11, 12, 14],
    },
];

for (const file of FILES) {
    describe(`commonmark.js 0.31.2 ${file.name}`, () => {
        const bytes = readFileSync(new URL(`_fixtures/commonmark-js/${file.name}`, import.meta.url));
        const examples = extract(bytes.toString('utf8'));

        test('the vendored file is the pinned one', () => {
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
            expect(examples).toHaveLength(file.count);
        });

        test('every example renders as commonmark.js expects, except the pinned differences', () => {
            const md = createMd({ extendedAutolinks: false, disallowedRawHtml: false, ...file.opts });
            expect(differing(examples, md)).toEqual(file.differs);
        });
    });
}

describe('smart punctuation scope', () => {
    test('smart quotes are rendered; dashes and ellipses stay literal', () => {
        const md = createMd({ extendedAutolinks: false, disallowedRawHtml: false, smart: true });
        expect(md.renderHtml('"a" \'b\' c--d e...\n')).toBe('<p>“a” ‘b’ c--d e...</p>\n');
    });
});
