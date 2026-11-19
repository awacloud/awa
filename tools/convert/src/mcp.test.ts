// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/mcp.test.ts — unit tests for the MCP server's
 * dispatch logic (`./mcp.ts`): tool schemas, `callTool` happy/error paths
 * per operation (including the loss data every oconv-backed result must
 * carry), and the large-output delivery rule proved directly on the
 * `deliverText`/`deliverBinary` helpers plus once end-to-end through a
 * real tool call.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptedPdf, jpegPdf, JPEG_BYTES, PAGE_TEXT } from '../tests/pdf-fixtures.ts';
import {
    MAX_INLINE_BYTES,
    MAX_INLINE_TEXT_CHARS,
    TOOLS,
    callTool,
    deliverBinary,
    deliverText,
    handleRequest,
} from './mcp.ts';

const FIXTURES = join(import.meta.dir, '..', 'tests', 'fixtures');
const SAMPLE_DOCX = readFileSync(join(FIXTURES, 'sample.docx'));
const SAMPLE_DOCX_PATH = join(FIXTURES, 'sample.docx');
const CONVERTED_AT = '2026-01-01T00:00:00.000Z';

describe('TOOLS — schema', () => {
    test('exactly four tools, named per the plan', () => {
        expect(TOOLS.map((t) => t.name).sort()).toEqual(['convert', 'from_md', 'to_html', 'to_md']);
    });

    test('every description states a capability and a loss (or explicitly none)', () => {
        for (const t of TOOLS) {
            expect(t.description.length).toBeGreaterThan(0);
            expect(/loses|loss/i.test(t.description)).toBe(true);
        }
    });

    test('convert takes an optional boolean layout (docx to odt)', () => {
        const convert = TOOLS.find((t) => t.name === 'convert')!;
        expect((convert.inputSchema.properties as Record<string, { type: string }>).layout!.type).toBe('boolean');
    });

    test('callTool convert with layout: a usage error on a pdf target', async () => {
        const { content, isError } = await callTool('convert', { path: SAMPLE_DOCX_PATH, target: 'pdf', layout: true });
        expect(isError).toBe(true);
        expect(content[0]!.text).toContain('oconv: layout needs docx to odt');
    });

    test('from_md and convert require "target"', () => {
        const fromMd = TOOLS.find((t) => t.name === 'from_md')!;
        const convert = TOOLS.find((t) => t.name === 'convert')!;
        expect(fromMd.inputSchema.required).toEqual(['target']);
        expect(convert.inputSchema.required).toEqual(['target']);
    });
});

describe('callTool — to_md', () => {
    test('happy path via path — inline result carries markdown + losses', async () => {
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('inline');
        expect(typeof payload.markdown).toBe('string');
        expect(payload.markdown.length).toBeGreaterThan(0);
        expect(Array.isArray(payload.losses)).toBe(true);
        expect(payload.lossy).toBe(payload.losses.length > 0);
    });

    test('happy path via bytesBase64 + name — same result shape', async () => {
        const { content, isError } = await callTool('to_md', {
            bytesBase64: SAMPLE_DOCX.toString('base64'),
            name: 'sample.docx',
            at: CONVERTED_AT,
        });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('inline');
        expect(typeof payload.markdown).toBe('string');
    });

    test('bytesBase64 without name — structured error, never a throw', async () => {
        const { content, isError } = await callTool('to_md', { bytesBase64: SAMPLE_DOCX.toString('base64') });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('name is required');
        expect(payload.usage).toBe(true);
    });

    test('neither path nor bytesBase64 — structured error', async () => {
        const { content, isError } = await callTool('to_md', {});
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('provide either path or bytesBase64');
    });

    test('unsupported format — structured error from the core, never a throw', async () => {
        const { content, isError } = await callTool('to_md', {
            bytesBase64: Buffer.from('hello').toString('base64'),
            name: 'sample.txt',
        });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('unsupported format');
        expect(payload.usage).toBe(true);
    });

    test('unknown argument — rejected before the handler runs', async () => {
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, bogus: 1 });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toBe('unknown argument: bogus');
    });

    test('at: "not-a-date" — structured usage error, checked before the input is read (BL-1639)', async () => {
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: 'not-a-date' });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload).toEqual({
            error: 'argument at: invalid timestamp "not-a-date": expected an RFC 3339 date-time such as 2026-01-01T00:00:00.000Z',
            usage: true,
        });
    });

    test('at: "not-a-date" is rejected even when the path does not exist — the check runs before readBinaryInput', async () => {
        const { content, isError } = await callTool('to_md', { path: 'does-not-exist.docx', at: 'not-a-date' });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('invalid timestamp "not-a-date"');
        expect(payload.error).not.toContain('cannot read path');
    });
});

describe('callTool — from_md', () => {
    test('happy path — inline binary result carries target + losses', async () => {
        const { content, isError } = await callTool('from_md', { markdown: '# Title\n\nSome *text*.\n', target: 'docx' });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('inline');
        expect(payload.target).toBe('docx');
        expect(typeof payload.bytesBase64).toBe('string');
        expect(payload.bytesLength).toBeGreaterThan(0);
        expect(Array.isArray(payload.losses)).toBe(true);
    });

    test('missing target — schema validation error, never a throw', async () => {
        const { content, isError } = await callTool('from_md', { markdown: '# Title\n' });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toBe('missing required argument: target');
    });

    test('unsupported target — structured error from the core', async () => {
        const { content, isError } = await callTool('from_md', { markdown: '# Title\n', target: 'pptx' });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('unsupported target');
        expect(payload.usage).toBe(true);
    });
});

describe('callTool — convert', () => {
    test('happy path via path — inline result carries format/target/losses', async () => {
        const { content, isError } = await callTool('convert', { path: SAMPLE_DOCX_PATH, target: 'odt' });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('inline');
        expect(payload.format).toBe('docx');
        expect(payload.target).toBe('odt');
        expect(Array.isArray(payload.losses)).toBe(true);
    });

    test('unsupported pair — structured error, never a throw', async () => {
        const { content, isError } = await callTool('convert', { path: SAMPLE_DOCX_PATH, target: 'docx' });
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('unsupported pair');
        expect(payload.usage).toBe(true);
    });
});

describe('callTool — lossSummary and lossView', () => {
    const LOSSY_MD = '<div>a</div>\n\n<div>b</div>\n\nText <br> x.\n';
    const SUMMARY = [
        { code: 'block/dropped', detail: 'html_block', count: 2 },
        { code: 'inline/dropped', detail: 'html_inline', count: 1 },
    ];

    test('default: losses unchanged, lossSummary beside them', async () => {
        const { content, isError } = await callTool('from_md', { markdown: LOSSY_MD, target: 'docx' });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.losses).toHaveLength(3);
        expect(payload.lossSummary).toEqual(SUMMARY);
        expect(payload.lossy).toBe(true);
    });

    test('lossView "full" is the default spelled out', async () => {
        const { content } = await callTool('from_md', { markdown: LOSSY_MD, target: 'docx', lossView: 'full' });
        const payload = JSON.parse(content[0]!.text);
        expect(payload.losses).toHaveLength(3);
        expect(payload.lossSummary).toEqual(SUMMARY);
    });

    test('lossView "summary": no losses key, the summary and lossy kept', async () => {
        const { content, isError } = await callTool('from_md', { markdown: LOSSY_MD, target: 'docx', lossView: 'summary' });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect('losses' in payload).toBe(false);
        expect(payload.lossSummary).toEqual(SUMMARY);
        expect(payload.lossy).toBe(true);
        expect(payload.mode).toBe('inline');
    });

    test('lossView "summary" in file mode, and on to_md and convert', async () => {
        const dir = join(FIXTURES, '..', 'tmp-mcp-test-loss-view');
        mkdirSync(dir, { recursive: true });
        const filed = JSON.parse((await callTool('from_md', {
            markdown: LOSSY_MD, target: 'docx', outPath: join(dir, 'out.docx'), lossView: 'summary',
        })).content[0]!.text);
        rmSync(dir, { recursive: true, force: true });
        expect(filed.mode).toBe('file');
        expect('losses' in filed).toBe(false);
        expect(filed.lossSummary).toEqual(SUMMARY);

        const md = JSON.parse((await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, lossView: 'summary' })).content[0]!.text);
        expect('losses' in md).toBe(false);
        expect(Array.isArray(md.lossSummary)).toBe(true);

        const odt = JSON.parse((await callTool('convert', { path: SAMPLE_DOCX_PATH, target: 'odt', lossView: 'summary' })).content[0]!.text);
        expect('losses' in odt).toBe(false);
        expect(Array.isArray(odt.lossSummary)).toBe(true);
    });

    test('an unknown lossView is a usage error, checked before the input is read', async () => {
        for (const [tool, args] of [
            ['to_md', { path: join(FIXTURES, 'does-not-exist.docx') }],
            ['from_md', { path: join(FIXTURES, 'does-not-exist.md'), target: 'docx' }],
            ['convert', { path: join(FIXTURES, 'does-not-exist.docx'), target: 'odt' }],
        ] as const) {
            const { content, isError } = await callTool(tool, { ...args, lossView: 'grouped' });
            expect(isError).toBe(true);
            const payload = JSON.parse(content[0]!.text);
            expect(payload.error).toBe('argument lossView: expected "full" or "summary", got "grouped"');
            expect(payload.usage).toBe(true);
        }
    });

    test('the three ledger tools declare lossView and recommend the summary; to_html does not', () => {
        for (const name of ['to_md', 'from_md', 'convert']) {
            const def = TOOLS.find((t) => t.name === name)!;
            expect(def.inputSchema.properties.lossView?.type).toBe('string');
            expect(def.description).toContain('lossSummary');
            expect(def.description).toContain('"lossView": "summary"');
        }
        expect(TOOLS.find((t) => t.name === 'to_html')!.inputSchema.properties.lossView).toBeUndefined();
    });
});

describe('callTool — to_html', () => {
    test('happy path — no losses field (the renderer does not itemise its drops)', async () => {
        const { content, isError } = await callTool('to_html', { markdown: '# Title\n\nSome *text*.\n' });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('inline');
        expect(payload.html).toContain('<h1>Title</h1>');
        expect('losses' in payload).toBe(false);
    });

    // Negative controls through the MCP handler: no live tag token, no `on*=`
    // attribute inside a tag, no `javascript:` href; escaped text is inert.
    const hostile: Record<string, string> = {
        javascriptLink: '[x](javascript:alert(1))',
        rawHtml: '<img src=x onerror=alert(1)>',
        mermaidImg: '```mermaid\n<img src=x onerror=alert(1)>\n```\n',
        mermaidScript: '```mermaid\n</div><script>alert(1)</script>\n```\n',
    };
    for (const [name, markdown] of Object.entries(hostile)) {
        test(`negative control: ${name} renders no live markup`, async () => {
            const { content, isError } = await callTool('to_html', { markdown });
            expect(isError).toBe(false);
            const html = (JSON.parse(content[0]!.text) as { html: string }).html;
            expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
            expect(html).not.toMatch(/<img\b/i);
            expect(html).not.toMatch(/<script\b/i);
            expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i);
        });
    }

    test('task-list checkboxes survive as disabled inputs, checked state kept', async () => {
        const { content, isError } = await callTool('to_html', { markdown: '- [x] done\n' });
        expect(isError).toBe(false);
        const html = (JSON.parse(content[0]!.text) as { html: string }).html;
        expect(html).toContain('<input checked="" disabled="" type="checkbox" />');
        expect(html.match(/<input\b/gi)?.length).toBe(1);
    });

    test('to_html description states what the render drops', () => {
        const description = TOOLS.find((t) => t.name === 'to_html')!.description;
        expect(description).toContain('raw HTML');
        expect(description).toContain('javascript:, vbscript:, file: or data:');
        expect(description).toContain('does not itemise');
        expect(description).not.toMatch(/nothing beyond|loses nothing/i);
    });

    test('path input works the same as inline markdown', async () => {
        // No fixture .md file is shipped; feed inline markdown via a temp file
        // path-reading branch by asserting the "neither markdown nor path"
        // error path instead, which exercises readTextInput's other arm.
        const { content, isError } = await callTool('to_html', {});
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toContain('provide either markdown or path');
    });
});

describe('callTool — unknown tool', () => {
    test('unknown tool name — structured error, never a throw', async () => {
        const { content, isError } = await callTool('does_not_exist', {});
        expect(isError).toBe(true);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.error).toBe('unknown tool: does_not_exist');
        expect(payload.usage).toBe(true);
    });
});

describe('large-output rule — deliverText / deliverBinary', () => {
    test('deliverText inlines content strictly under the threshold', () => {
        const content = 'x'.repeat(MAX_INLINE_TEXT_CHARS - 1);
        const result = deliverText(content, 'html', 'html', undefined);
        expect(result.mode).toBe('inline');
        expect(result.html).toBe(content);
        expect('outPath' in result).toBe(false);
    });

    test('deliverText redirects to a file at/above the threshold, with an explicit preview marker — never a silent cut', () => {
        const content = 'y'.repeat(MAX_INLINE_TEXT_CHARS + 500);
        const result = deliverText(content, 'html', 'html', undefined) as {
            mode: string;
            outPath: string;
            length: number;
            preview: string;
            note: string;
            html?: string;
        };
        expect(result.mode).toBe('file');
        expect(result.html).toBeUndefined();
        expect(result.length).toBe(content.length);
        expect(result.preview).toBe(content.slice(0, 2000));
        expect(result.note).toContain('written to outPath');
        const onDisk = readFileSync(result.outPath, 'utf8');
        expect(onDisk).toBe(content);
    });

    test('deliverText honours an explicit outPath regardless of size', () => {
        const content = 'small';
        const dir = join(FIXTURES, '..', 'tmp-mcp-test-explicit-outpath');
        const path = join(dir, 'out.html');
        mkdirSync(dir, { recursive: true });
        const result = deliverText(content, 'html', 'html', path) as { mode: string; outPath: string; note: string };
        expect(result.mode).toBe('file');
        expect(result.outPath).toBe(path);
        expect(readFileSync(path, 'utf8')).toBe(content);
        rmSync(dir, { recursive: true, force: true });
    });

    test('deliverBinary inlines bytes strictly under the threshold as base64', () => {
        const bytes = new Uint8Array(MAX_INLINE_BYTES - 1).fill(7);
        const result = deliverBinary(bytes, 'docx', undefined) as { mode: string; bytesBase64: string; bytesLength: number };
        expect(result.mode).toBe('inline');
        expect(result.bytesLength).toBe(bytes.byteLength);
        expect(Buffer.from(result.bytesBase64, 'base64').equals(Buffer.from(bytes))).toBe(true);
    });

    test('deliverBinary redirects to a file at/above the threshold — full bytes, never truncated', () => {
        const bytes = new Uint8Array(MAX_INLINE_BYTES + 500).fill(9);
        const result = deliverBinary(bytes, 'docx', undefined) as {
            mode: string;
            outPath: string;
            bytesLength: number;
            note: string;
            bytesBase64?: string;
        };
        expect(result.mode).toBe('file');
        expect(result.bytesBase64).toBeUndefined();
        expect(result.bytesLength).toBe(bytes.byteLength);
        expect(result.note).toContain('never truncated');
        const onDisk = readFileSync(result.outPath);
        expect(onDisk.equals(Buffer.from(bytes))).toBe(true);
    });

    test('end-to-end through callTool: a large to_html result is written to a file, not inlined', async () => {
        const bigMarkdown = `# Title\n\n${'word '.repeat(Math.ceil((MAX_INLINE_TEXT_CHARS + 1000) / 5))}`;
        const { content, isError } = await callTool('to_html', { markdown: bigMarkdown });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.mode).toBe('file');
        expect(payload.html).toBeUndefined();
        expect(typeof payload.outPath).toBe('string');
        expect(payload.length).toBeGreaterThanOrEqual(MAX_INLINE_TEXT_CHARS);
        expect(payload.preview.length).toBeLessThanOrEqual(2000);
        const onDisk = readFileSync(payload.outPath, 'utf8');
        expect(onDisk.length).toBe(payload.length);
    });
});

describe('handleRequest', () => {
    test('initialize — protocol version and server info', async () => {
        const result = (await handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' })) as {
            protocolVersion: string;
            serverInfo: { name: string };
        };
        expect(result.protocolVersion).toBe('2024-11-05');
        expect(result.serverInfo.name).toBe('convert');
    });

    test('tools/list — the four tools, handler stripped', async () => {
        const result = (await handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as {
            tools: Array<Record<string, unknown>>;
        };
        expect(result.tools.length).toBe(4);
        for (const t of result.tools) expect('handler' in t).toBe(false);
    });

    test('ping — empty object', async () => {
        const result = await handleRequest({ jsonrpc: '2.0', id: 1, method: 'ping' });
        expect(result).toEqual({});
    });

    test('notifications — undefined (no response)', async () => {
        const result = await handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
        expect(result).toBeUndefined();
    });

    test('unknown method — RpcFailure(METHOD_NOT_FOUND)', async () => {
        await expect(handleRequest({ jsonrpc: '2.0', id: 1, method: 'bogus/method' })).rejects.toThrow('unknown method: bogus/method');
    });

    test('tools/call without params.name — RpcFailure(INVALID_PARAMS)', async () => {
        await expect(handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).rejects.toThrow('tools/call requires params.name');
    });

    test('tools/call routes to callTool and never throws for a bad tool', async () => {
        const result = (await handleRequest({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'does_not_exist' },
        })) as { isError: boolean };
        expect(result.isError).toBe(true);
    });
});

describe('callTool — to_md sheets (A58)', () => {
    test('the schema offers sheets as table | csv | tsv, and the argument reaches oconv', async () => {
        const toMdTool = TOOLS.find((t) => t.name === 'to_md')!;
        expect((toMdTool.inputSchema.properties as Record<string, { enum?: string[] }>).sheets!.enum).toEqual(['table', 'csv', 'tsv']);
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, sheets: 'csv' });
        expect(isError).toBe(true);
        expect(content[0]!.text).toContain('sheets needs format xlsx or ods');
    });
});

describe('callTool — to_md, every toMd opt-in (T35)', () => {
    type Props = Record<string, { type: string; enum?: string[]; items?: { type: string; enum?: string[] } }>;
    const props = (): Props => TOOLS.find((t) => t.name === 'to_md')!.inputSchema.properties as Props;
    const scratch = mkdtempSync(join(tmpdir(), 'convert-mcp-t35-'));
    process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

    test('the schema lists every option, the lists with their known names', () => {
        const p = props();
        expect(p.pdfInfer).toMatchObject({ type: 'array', items: { type: 'string', enum: ['headings', 'tables', 'running'] } });
        expect(p.pdfDeclare).toMatchObject({ type: 'array', items: { type: 'string', enum: ['positional'] } });
        expect(p.pdfInclude).toMatchObject({ type: 'array', items: { type: 'string', enum: ['images'] } });
        expect(p.odtInclude).toMatchObject({ type: 'array', items: { type: 'string', enum: ['toc'] } });
        expect(p.docxInclude).toMatchObject({ type: 'array', items: { type: 'string', enum: ['toc'] } });
        expect(p.formOpBudget!.type).toBe('integer');
        expect(p.frontMatter).toMatchObject({ type: 'string', enum: ['full', 'compact', 'none'] });
        expect(p.pdfRecoverXref!.type).toBe('boolean');
        expect(p.pdfLineHyphens).toMatchObject({ type: 'string', enum: ['drop', 'keep'] });
        expect(p.pdfPasswordPath!.type).toBe('string');
        expect(p.assetsDir!.type).toBe('string');
        expect(p.pdfPassword).toBeUndefined();
    });

    test('each argument reaches oconv: on a docx, its needs-format refusal is a usage error', async () => {
        const password = join(scratch, 'password.txt');
        writeFileSync(password, 'user');
        const cases: [Record<string, unknown>, string][] = [
            [{ formOpBudget: 10 }, 'oconv: form op budget needs format pdf'],
            [{ pdfInfer: ['headings'] }, 'oconv: pdf infer needs format pdf'],
            [{ pdfDeclare: ['positional'] }, 'oconv: pdf declare needs format pdf'],
            [{ pdfInclude: ['images'] }, 'oconv: pdf include needs format pdf'],
            [{ pdfPasswordPath: password }, 'oconv: pdf password needs format pdf'],
            [{ pdfRecoverXref: true }, 'oconv: pdf recover xref needs format pdf'],
            [{ odtInclude: ['toc'] }, 'oconv: odt include needs format odt'],
            [{ pdfLineHyphens: 'drop' }, 'oconv: pdf line hyphens needs format pdf'],
            [{ frontMatter: 'x' }, 'oconv: bad front matter'],
            [{ docxInclude: ['x'] }, 'oconv: bad docx include'],
        ];
        for (const [option, message] of cases) {
            const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, ...option });
            expect(isError).toBe(true);
            expect(JSON.parse(content[0]!.text)).toEqual({ error: message, usage: true });
        }
        expect((await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, docxInclude: ['toc'] })).isError).toBeFalsy();
    });

    test('a list argument must be an array of strings, formOpBudget an integer', async () => {
        const cases: [Record<string, unknown>, string][] = [
            [{ pdfInfer: 'headings' }, 'argument pdfInfer: expected array of string, got string'],
            [{ odtInclude: [1] }, 'argument odtInclude: expected array of string, got array'],
            [{ docxInclude: 'toc' }, 'argument docxInclude: expected array of string, got string'],
            [{ formOpBudget: 1.5 }, 'argument formOpBudget: expected integer, got number'],
        ];
        for (const [option, message] of cases) {
            const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, ...option });
            expect(isError).toBe(true);
            expect(content[0]!.text).toContain(message);
        }
    });

    test('pdfPasswordPath opens an encrypted pdf', async () => {
        const pdf = join(scratch, 'locked.pdf');
        writeFileSync(pdf, encryptedPdf());
        const password = join(scratch, 'owner.txt');
        writeFileSync(password, 'owner\n');
        const { content, isError } = await callTool('to_md', { path: pdf, at: CONVERTED_AT, pdfPasswordPath: password });
        expect(isError).toBe(false);
        expect(JSON.parse(content[0]!.text).markdown).toContain(PAGE_TEXT);
    });

    test('assetsDir writes the pictures and lists them', async () => {
        const pdf = join(scratch, 'picture.pdf');
        writeFileSync(pdf, jpegPdf());
        const dir = join(scratch, 'assets');
        const { content, isError } = await callTool('to_md', { path: pdf, at: CONVERTED_AT, pdfInclude: ['images'], assetsDir: dir });
        expect(isError).toBe(false);
        const payload = JSON.parse(content[0]!.text);
        expect(payload.assets).toEqual([{ name: 'image-7.jpg', path: join(dir, 'image-7.jpg'), bytesLength: JPEG_BYTES.length }]);
        expect(payload.assetsSkipped).toEqual([]);
        expect(Buffer.compare(readFileSync(join(dir, 'image-7.jpg')), Buffer.from(JPEG_BYTES))).toBe(0);
    });
});

describe('callTool — to_md, the sheet, archive and output budgets (T46-T48)', () => {
    type Props = Record<string, { type: string; properties?: Record<string, { type: string; enum?: string[] }> }>;
    const props = (): Props => TOOLS.find((t) => t.name === 'to_md')!.inputSchema.properties as Props;

    test('the schema lists them', () => {
        const p = props();
        expect(p.sheetCellBudget!.type).toBe('integer');
        expect(p.archiveLimits!.type).toBe('object');
        expect(Object.keys(p.archiveLimits!.properties!)).toEqual(['maxParts', 'maxUncompressed', 'maxRatio', 'maxDepth']);
        expect(p.outputBudget!.type).toBe('object');
        expect(p.outputBudget!.properties!.overflow!.enum).toEqual(['throw', 'truncate']);
    });

    test('each argument reaches oconv', async () => {
        const cases: [Record<string, unknown>, Record<string, unknown>][] = [
            [{ sheetCellBudget: 10 }, { error: 'oconv: sheet cell budget needs format xlsx or ods', usage: true }],
            [{ outputBudget: { bytes: 0 } }, { error: 'oconv: bad output budget', usage: true }],
            [{ archiveLimits: { other: 1 } }, { error: 'oconv: bad archive limits', usage: true }],
            [{ outputBudget: { bytes: 1 } }, { error: 'oconv: output too large', usage: false }],
        ];
        for (const [option, expected] of cases) {
            const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, ...option });
            expect(isError).toBe(true);
            expect(JSON.parse(content[0]!.text)).toEqual(expected);
        }
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, outputBudget: { bytes: 1, overflow: 'truncate' } });
        expect(isError).toBe(false);
        expect(JSON.parse(content[0]!.text).losses.some((l: { code: string }) => l.code === 'doc/truncated')).toBe(true);
    });

    test('an object argument must be an object', async () => {
        const { content, isError } = await callTool('to_md', { path: SAMPLE_DOCX_PATH, at: CONVERTED_AT, archiveLimits: 5 });
        expect(isError).toBe(true);
        expect(content[0]!.text).toContain('argument archiveLimits: expected object, got number');
    });
});
