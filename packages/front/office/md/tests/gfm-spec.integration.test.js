// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview GFM spec 0.29 (cmark-gfm `test/spec.txt`, tag
 * 0.29.0.gfm.13) run through `renderHtml`.
 *
 * Each example runs with exactly the extensions its fence names, as
 * cmark-gfm's runner does (`autolink` → `extendedAutolinks`, `tagfilter` →
 * `disallowedRawHtml`; tables, strikethrough and task lists are always on).
 * Examples marked `disabled` upstream are not run. The examples that differ
 * are pinned by number, so an improvement or a regression shows; see
 * `_fixtures/gfm/README.md` for why each one differs.
 *
 * @module md/tests/gfm-spec.integration
 */

import { test, expect, describe } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMd } from './_helpers/build.js';

const SPEC = readFileSync(new URL('_fixtures/gfm/spec.txt', import.meta.url));
const SPEC_SHA256 = '7d8e5814befec287ac116786d81ff14e0adc9b13295b4494649e995408fd871c';

/** GFM 0.29 collapses nested strong emphasis that CommonMark 0.31.2 nests. */
const NESTED_STRONG = [398, 426, 434, 435, 436, 473, 474, 475, 477];

function extract(text) {
    const examples = [];
    let section = '';
    const body = text.replace(/\r\n?/g, '\n').replace(/^<!-- END TESTS -->(.|[\n])*/m, '');
    for (const m of body.matchAll(/^`{32} example([^\n]*)\n([\s\S]*?)^\.\n([\s\S]*?)^`{32}$|^#{1,6} *(.*)$/gm)) {
        if (m[4] !== undefined) {
            section = m[4];
            continue;
        }
        examples.push({
            number: examples.length + 1,
            section,
            extensions: m[1].trim().split(/\s+/).filter(Boolean),
            markdown: m[2].replace(/→/g, '\t'),
            html: m[3].replace(/→/g, '\t'),
        });
    }
    return examples;
}

const examples = extract(SPEC.toString('utf8'));
const instances = new Map();
function instanceFor(extensions) {
    const opts = { extendedAutolinks: extensions.includes('autolink'), disallowedRawHtml: extensions.includes('tagfilter') };
    const key = JSON.stringify(opts);
    if (!instances.has(key)) instances.set(key, createMd(opts));
    return instances.get(key);
}

describe('GFM spec 0.29 suite', () => {
    test('the vendored file is the pinned one', () => {
        expect(createHash('sha256').update(SPEC).digest('hex')).toBe(SPEC_SHA256);
        expect(examples).toHaveLength(672);
        expect(examples.filter((e) => e.extensions.includes('disabled')).map((e) => e.number)).toEqual([279, 280]);
    });

    test('every enabled example renders as specified, except the pinned differences', () => {
        const differs = [];
        for (const ex of examples) {
            if (ex.extensions.includes('disabled')) continue;
            // Spec examples pin the raw passthrough: explicit opt-out of the default hardening.
            const got = instanceFor(ex.extensions).renderHtml(ex.markdown, { safe: false });
            if (got !== ex.html) differs.push(ex.number);
        }
        expect(differs).toEqual(NESTED_STRONG);
    });

    test('the nested-strong differences are CommonMark 0.31.2 behaviour', () => {
        const strict = createMd({ extendedAutolinks: false, disallowedRawHtml: false });
        expect(strict.renderHtml('****foo****\n', { safe: false })).toBe('<p><strong><strong>foo</strong></strong></p>\n');
        expect(examples[473 - 1].html).toBe('<p><strong>foo</strong></p>\n');
    });
});
