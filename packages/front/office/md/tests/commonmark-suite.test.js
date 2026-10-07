// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview CommonMark 0.31 official spec test suite.
 *
 * Loads `spec.txt` from the reference commonmark.js distribution and
 * runs every example through `md.renderHtml`. Groups failures by
 * section so the report is actionable.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMd } from './_helpers/build.js';

// CommonMark suite runs in CommonMark-strict mode: GFM extensions
// that emit links from bare URLs / emails are opt-in only here.
const md = createMd({ extendedAutolinks: false, disallowedRawHtml: false });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = resolve(__dirname, '_fixtures/commonmark/spec.txt');

function extractSpecTests(specText) {
    const examples = [];
    let currentSection = '';
    let exampleNumber = 0;

    const tests = specText
        .replace(/\r\n?/g, '\n')
        .replace(/^<!-- END TESTS -->(.|[\n])*/m, '');

    tests.replace(
        /^`{32} example\n([\s\S]*?)^\.\n([\s\S]*?)^`{32}$|^#{1,6} *(.*)$/gm,
        function(_, markdownSubmatch, htmlSubmatch, sectionSubmatch) {
            if (sectionSubmatch) {
                currentSection = sectionSubmatch;
            } else {
                exampleNumber++;
                examples.push({
                    markdown: markdownSubmatch.replace(/→/g, '\t'),
                    html:     htmlSubmatch.replace(/→/g, '\t'),
                    section:  currentSection,
                    number:   exampleNumber
                });
            }
            return '';
        }
    );
    return examples;
}

const specText = readFileSync(SPEC_PATH, 'utf8');
const examples = extractSpecTests(specText);

const bySection = new Map();
for (const ex of examples) {
    if (!bySection.has(ex.section)) bySection.set(ex.section, []);
    bySection.get(ex.section).push(ex);
}

describe('CommonMark 0.31 spec suite', () => {
    for (const [section, exs] of bySection) {
        describe(section, () => {
            for (const ex of exs) {
                test(`example ${ex.number}`, () => {
                    // Spec examples pin the raw passthrough: explicit opt-out
                    // of the default hardening (BL-2015).
                    const got = md.renderHtml(ex.markdown, { safe: false });
                    expect(got).toBe(ex.html);
                });
            }
        });
    }
});
