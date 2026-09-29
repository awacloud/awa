// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * @fileoverview Guard test — `docs/guide/by-use-case.md`'s cross-page anchor
 * links resolve to a real GFM-slug heading (fw/BATCH_31 task 08, BL-1066).
 *
 * `by-use-case.md` links into `docs/api/dom/rendering/{uiSession,template}.md`
 * by anchor (`#uilist…`, `#ssr-adopting…`, `#tplregistertags…`). Those
 * anchors are hand-authored GFM slugs of the target headings, so a heading
 * rename silently breaks the link with no build-time signal — the exact
 * failure mode `ai/conventions/documentation.md` § Verification's "a guard
 * test reads the file it guards" rule exists for. The first test below reads
 * both the guide page and every file it links into, live, at run time: it
 * slugs each target file's real ATX headings with the same rule GitHub
 * applies and asserts every anchor `by-use-case.md` cites is present in that
 * set — falsified once during authoring by doctoring a live anchor and
 * watching this test redden (see the batch report; not committed, since a
 * permanently-doctored anchor would defeat the guard it is meant to prove).
 *
 * The second test falsifies the slugger itself against two fixed fixture
 * headings, independent of the live-file assertions above, so a broken
 * slugger cannot make the first test pass for the wrong reason.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GUIDE_DIR = join(HERE, '../docs/guide');
const BY_USE_CASE = join(GUIDE_DIR, 'by-use-case.md');

/**
 * GFM heading-slug rule (GitHub): lowercase the heading text, strip every
 * character that is not a letter, digit, space or hyphen (backticks, dots,
 * parentheses, brackets, commas, `?`, `→`, … are all dropped — spaces are
 * NOT collapsed, so two adjacent spaces produce two hyphens), then replace
 * each remaining space with a hyphen.
 *
 * @param {string} headingText Raw heading text (ATX marker + leading/trailing
 *   whitespace already stripped).
 * @returns {string} The base slug, before duplicate-heading suffixing.
 */
function slugifyHeading(headingText) {
    return headingText
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/ /g, '-');
}

/**
 * Extract every ATX heading's raw text from a Markdown document, in order,
 * skipping fenced code blocks so a shell-comment `#` inside an example never
 * counts as a heading.
 *
 * @param {string} markdown Full file content.
 * @returns {string[]} Heading text, one per heading, in document order.
 */
function extractHeadings(markdown) {
    const headings = [];
    let inFence = false;
    for (const line of markdown.split(/\r?\n/)) {
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
        if (m) headings.push(m[1]);
    }
    return headings;
}

/**
 * Slug a document's headings in order, applying GitHub's duplicate-heading
 * suffixing: the first occurrence of a base slug is unsuffixed, the second
 * gets `-1`, the third `-2`, etc.
 *
 * @param {string[]} headings Raw heading texts, in document order.
 * @returns {Set<string>} The full set of final (possibly suffixed) slugs.
 */
function slugSetFor(headings) {
    const seenCount = new Map();
    const slugs = new Set();
    for (const heading of headings) {
        const base = slugifyHeading(heading);
        const n = seenCount.get(base) ?? 0;
        seenCount.set(base, n + 1);
        slugs.add(n === 0 ? base : `${base}-${n}`);
    }
    return slugs;
}

/**
 * Extract every `](<relPath>.md#<anchor>)` link from a Markdown document.
 *
 * @param {string} markdown Full file content.
 * @returns {Array<{relPath: string, anchor: string}>}
 */
function extractMdAnchorLinks(markdown) {
    const links = [];
    const re = /]\(([^()\s]+\.md)#([^()\s]+)\)/g;
    let m;
    while ((m = re.exec(markdown))) {
        links.push({ relPath: m[1], anchor: m[2] });
    }
    return links;
}

describe('guide anchors — docs/guide/by-use-case.md', () => {
    test('every ](<rel>.md#<anchor>) link resolves to a real GFM-slug heading', () => {
        const guideContent = readFileSync(BY_USE_CASE, 'utf8');
        const links = extractMdAnchorLinks(guideContent);

        // Non-vacuous: the page must actually cite at least one such link,
        // otherwise every assertion below would trivially pass over nothing.
        expect(links.length).toBeGreaterThan(0);

        for (const { relPath, anchor } of links) {
            const targetPath = join(GUIDE_DIR, relPath);
            const targetContent = readFileSync(targetPath, 'utf8');
            const slugs = slugSetFor(extractHeadings(targetContent));
            const found = slugs.has(anchor);
            // Fold the diagnostic (which link, which file) into the compared
            // value itself so a failure names the culprit in the assertion
            // diff rather than a bare `true !== false`.
            expect(found ? anchor : `MISSING ${relPath}#${anchor}`).toBe(anchor);
        }
    });

    test('slugger fixtures: `` `ui.list` `` → `uilist`; `tpl.registerTags(tags, ctxName?)` → `tplregistertagstags-ctxname`', () => {
        expect(slugifyHeading('`ui.list`')).toBe('uilist');
        expect(slugifyHeading('tpl.registerTags(tags, ctxName?)')).toBe('tplregistertagstags-ctxname');
    });
});
