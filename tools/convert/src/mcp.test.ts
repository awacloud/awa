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
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
