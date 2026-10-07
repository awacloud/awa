// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/core.test.ts — unit tests for the runtime-agnostic
 * conversion core (`./core.ts`). One happy path per operation on a small
 * committed fixture, plus the error-as-data contract.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { extras as mdExtras, fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { convert, fromMd, isCoreError, toHtml, toMd } from './core.ts';
import { toModuleDefinitions } from './descriptors.ts';

const FIXTURES = join(import.meta.dir, '..', 'tests', 'fixtures');
const SAMPLE_DOCX = readFileSync(join(FIXTURES, 'sample.docx'));
const CONVERTED_AT = '2026-01-01T00:00:00.000Z';

describe('toMd', () => {
    test('docx to markdown — happy path', async () => {
        const result = await toMd({
            name: 'sample.docx',
            bytes: new Uint8Array(SAMPLE_DOCX),
            convertedAt: CONVERTED_AT,
        });
        expect(isCoreError(result)).toBe(false);
        if (isCoreError(result)) throw new Error('unreachable');
        expect(typeof result.markdown).toBe('string');
        expect(result.markdown.length).toBeGreaterThan(0);
        expect(Array.isArray(result.losses)).toBe(true);
        expect(result.lossy).toBe(result.losses.length > 0);
    });

    test('unsupported format returns an error string, never throws', async () => {
        const result = await toMd({
            name: 'sample.txt',
            bytes: new Uint8Array([1, 2, 3]),
            convertedAt: CONVERTED_AT,
        });
        expect(isCoreError(result)).toBe(true);
        if (!isCoreError(result)) throw new Error('unreachable');
        expect(result.error).toContain('unsupported format');
        expect(result.usage).toBe(true);
    });

    test('an invalid convertedAt is rejected as a usage error, before oconv ever runs (BL-1639)', async () => {
        const result = await toMd({
            name: 'sample.docx',
            bytes: new Uint8Array(SAMPLE_DOCX),
            convertedAt: 'not-a-date',
        });
        expect(isCoreError(result)).toBe(true);
        if (!isCoreError(result)) throw new Error('unreachable');
        expect(result.error).toBe(
            'invalid timestamp "not-a-date": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z',
        );
        expect(result.usage).toBe(true);
    });
});

describe('fromMd', () => {
    test('markdown to docx — happy path', async () => {
        const result = await fromMd({
            markdown: '# Title\n\nSome *text*.\n',
            target: 'docx',
        });
        expect(isCoreError(result)).toBe(false);
        if (isCoreError(result)) throw new Error('unreachable');
        expect(result.bytes).toBeInstanceOf(Uint8Array);
        expect(result.bytes.byteLength).toBeGreaterThan(0);
        expect(result.target).toBe('docx');
    });

    test('unsupported target returns an error string, never throws', async () => {
        const result = await fromMd({ markdown: '# Title\n', target: 'pptx' });
        expect(isCoreError(result)).toBe(true);
        if (!isCoreError(result)) throw new Error('unreachable');
        expect(result.error).toContain('unsupported target');
        expect(result.usage).toBe(true);
    });
});

describe('Loss shape', () => {
    test('string detail for a dropped block; object detail + index/kind for a pdf layout loss', async () => {
        const docx = await fromMd({ markdown: '# T\n\n<div>raw</div>\n', target: 'docx' });
        if (isCoreError(docx)) throw new Error(docx.error);
        expect(docx.losses).toEqual([{ code: 'block/dropped', detail: 'html_block' }]);

        const pdf = await fromMd({ markdown: '# T\n\n![alt](pic.png)\n', target: 'pdf' });
        if (isCoreError(pdf)) throw new Error(pdf.error);
        expect(pdf.lossy).toBe(true);
        const [loss] = pdf.losses;
        expect(loss?.code).toBe('layout/image-dropped');
        expect(loss?.kind).toBe('image');
        expect(typeof loss?.index).toBe('string');
        expect(typeof loss?.detail).toBe('object');
    });
});

describe('convert', () => {
    test('docx to odt — happy path', async () => {
        const result = await convert({
            name: 'sample.docx',
            bytes: new Uint8Array(SAMPLE_DOCX),
            target: 'odt',
        });
        expect(isCoreError(result)).toBe(false);
        if (isCoreError(result)) throw new Error('unreachable');
        expect(result.bytes).toBeInstanceOf(Uint8Array);
        expect(result.format).toBe('docx');
        expect(result.target).toBe('odt');
        expect(Array.isArray(result.losses)).toBe(true);
    });

    test('a conversion with losses returns the output AND the loss data', async () => {
        // docx -> pdf is a lossy pair in the shipped loss matrix (layout
        // fidelity is not a claim of this pipeline); the output must still
        // carry both the bytes and the recorded losses.
        const result = await convert({
            name: 'sample.docx',
            bytes: new Uint8Array(SAMPLE_DOCX),
            target: 'pdf',
        });
        expect(isCoreError(result)).toBe(false);
        if (isCoreError(result)) throw new Error('unreachable');
        expect(result.bytes.byteLength).toBeGreaterThan(0);
        expect(Array.isArray(result.losses)).toBe(true);
    });

    test('unsupported pair returns an error string, never throws', async () => {
        const result = await convert({
            name: 'sample.docx',
            bytes: new Uint8Array(SAMPLE_DOCX),
            target: 'docx',
        });
        expect(isCoreError(result)).toBe(true);
        if (!isCoreError(result)) throw new Error('unreachable');
        expect(result.error).toContain('unsupported pair');
        expect(result.usage).toBe(true);
    });
});

describe('toHtml', () => {
    test('markdown to HTML — happy path', async () => {
        const result = await toHtml({ markdown: '# Title\n\nSome *text*.\n' });
        expect(isCoreError(result)).toBe(false);
        if (isCoreError(result)) throw new Error('unreachable');
        expect(result.html).toContain('<h1>Title</h1>');
        expect(result.html).toContain('<em>text</em>');
    });
});

/**
 * Negative controls: each hostile input must come out with no LIVE tag or
 * attribute token. Escaped text (`&lt;img …`) is inert and allowed — the
 * assertions target the tag token (`<img`, `<script`), an `on*=` attribute
 * inside a tag, and an `href` carrying the `javascript:` scheme.
 */
const HOSTILE = {
    javascriptLink: '[x](javascript:alert(1))',
    rawHtml: '<img src=x onerror=alert(1)>',
    mermaidImg: '```mermaid\n<img src=x onerror=alert(1)>\n```\n',
    mermaidScript: '```mermaid\n</div><script>alert(1)</script>\n```\n',
};

function expectNoLiveMarkup(html: string): void {
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i);
}

describe('toHtml — safe + sanitized', () => {
    for (const [name, markdown] of Object.entries(HOSTILE)) {
        test(`negative control: ${name} renders no live markup`, async () => {
            const result = await toHtml({ markdown });
            if (isCoreError(result)) throw new Error(result.error);
            expectNoLiveMarkup(result.html);
        });
    }

    test('the Mermaid body stays escaped text inside a code block', async () => {
        const result = await toHtml({ markdown: HOSTILE.mermaidScript });
        if (isCoreError(result)) throw new Error(result.error);
        expect(result.html).toContain('<code class="language-mermaid">');
        expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('task-list checkboxes survive as disabled inputs, checked state kept', async () => {
        const result = await toHtml({ markdown: '- [ ] todo\n- [x] done\n' });
        if (isCoreError(result)) throw new Error(result.error);
        expect(result.html).toContain('<li><input disabled="" type="checkbox" /> todo</li>');
        expect(result.html).toContain('<li><input checked="" disabled="" type="checkbox" /> done</li>');
    });

    test('the sanitiser pass runs with the task-list allowlist (differential)', async () => {
        // Reference runtime built from md's public descriptors and the fw
        // sanitiser defaults. The sanitiser re-serialises the renderer's
        // `<input ...>` as `<input ... />`, so `sanitize: true` and
        // `sanitize: false` differ ONLY when the pass really runs.
        const runtime = new ModuleRuntime();
        runtime.registerAll(toModuleDefinitions('md fw_require', mdFwRequire));
        runtime.registerAll(toModuleDefinitions('md modules', mdModules));
        const md = runtime.resolve('md') as {
            renderHtml(markdown: string, opts: Record<string, unknown>): string;
        };
        const defaults = (
            runtime.resolve('sanitize') as {
                defaultAllowlist: { tags: Set<string>; attributes: Record<string, Set<string>> };
            }
        ).defaultAllowlist;
        const sanitizeOpts = {
            allowedTags: new Set([...defaults.tags, 'input']),
            allowedAttributes: { ...defaults.attributes, input: new Set(['type', 'checked', 'disabled']) },
        };
        const markdown = '- [ ] todo\n- [x] done\n';
        const sanitised = md.renderHtml(markdown, { safe: true, sanitize: true, sanitizeOpts });
        const unsanitised = md.renderHtml(markdown, { safe: true, sanitize: false });

        const result = await toHtml({ markdown });
        if (isCoreError(result)) throw new Error(result.error);
        expect(result.html).toBe(sanitised);
        expect(result.html).not.toBe(unsanitised);
    });

    test('raw HTML inputs never survive: every <input> is a task-list disabled checkbox', async () => {
        const markdown = [
            '- [x] done',
            '',
            '<input type="text" name="x">',
            '',
            'inline <input type="checkbox"> control',
            '',
        ].join('\n');
        const result = await toHtml({ markdown });
        if (isCoreError(result)) throw new Error(result.error);
        const inputs = result.html.match(/<input\b[^>]*>/gi) ?? [];
        expect(inputs.length).toBe(1);
        expect(inputs[0]!).toMatch(/^<input (checked="" )?disabled="" type="checkbox" \/>$/);
    });

    test('benign parity: headings, emphasis, list, table, link and Mermaid keep their structure', async () => {
        const markdown = [
            '# Title',
            '',
            'Some *emphasis* and **strong** text with [a link](https://example.com "t").',
            '',
            '- one',
            '- two',
            '',
            '| a | b |',
            '|---|---|',
            '| 1 | 2 |',
            '',
            '```mermaid',
            'graph TD; A-->B',
            '```',
            '',
        ].join('\n');
        const result = await toHtml({ markdown });
        if (isCoreError(result)) throw new Error(result.error);
        expect(result.html).toBe(
            '<h1>Title</h1>\n' +
                '<p>Some <em>emphasis</em> and <strong>strong</strong> text with <a href="https://example.com" title="t">a link</a>.</p>\n' +
                '<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n' +
                '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n' +
                '<pre><code class="language-mermaid">graph TD; A--&gt;B\n</code></pre>\n',
        );
    });
});

describe('buildMd registration', () => {
    test('@awacloud/md: mdHtmlDocument resolves only when extras are registered', () => {
        // Pins the mechanism `buildMd()` relies on (it is module-private, so
        // it cannot be called from here): `modules` lists `mdHtmlDocument`,
        // whose dependency `mdToc` lives in `extras`.
        const bare = new ModuleRuntime();
        bare.registerAll(toModuleDefinitions('md fw_require', mdFwRequire));
        bare.registerAll(toModuleDefinitions('md modules', mdModules));
        expect(() => bare.resolve('mdHtmlDocument')).toThrow(/Module not found: mdToc/);

        const full = new ModuleRuntime();
        full.registerAll(toModuleDefinitions('md fw_require', mdFwRequire));
        full.registerAll(toModuleDefinitions('md modules', mdModules));
        full.registerAll(toModuleDefinitions('md extras', mdExtras));
        expect(full.resolve('mdHtmlDocument')).toBeDefined();
    });
});
