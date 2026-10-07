// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/tests/mcp.integration.test.ts — the spawned MCP server
 * contract (`bun tools/convert/src/mcp.ts`, stdio JSON-RPC 2.0).
 *
 * Spawns the real server as a child process and drives it over its actual
 * stdin/stdout pipes: initialize → list tools → call each tool → a
 * large-output call → clean shutdown. Assertions are on the JSON-RPC
 * frames themselves, never on prose, and stderr is checked to carry no
 * protocol frame.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const MCP_ENTRY = join(ROOT, 'tools', 'convert', 'src', 'mcp.ts');
const SAMPLE_DOCX_PATH = join(import.meta.dir, 'fixtures', 'sample.docx');

interface JsonRpcFrame {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: { code: number; message: string };
}

function startServer(): {
    proc: ChildProcessWithoutNullStreams;
    send: (msg: Record<string, unknown>) => void;
    nextFrame: (timeoutMs?: number) => Promise<JsonRpcFrame>;
    stderrLines: string[];
} {
    const proc = spawn('bun', [MCP_ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] });

    const frameQueue: string[] = [];
    const waiters: Array<(line: string) => void> = [];
    const rlOut = createInterface({ input: proc.stdout });
    rlOut.on('line', (line) => {
        if (waiters.length > 0) waiters.shift()!(line);
        else frameQueue.push(line);
    });

    const stderrLines: string[] = [];
    const rlErr = createInterface({ input: proc.stderr });
    rlErr.on('line', (line) => stderrLines.push(line));

    function send(msg: Record<string, unknown>): void {
        proc.stdin.write(`${JSON.stringify(msg)}\n`);
    }

    function nextFrame(timeoutMs = 15_000): Promise<JsonRpcFrame> {
        return new Promise((resolve, reject) => {
            const queued = frameQueue.shift();
            if (queued !== undefined) {
                resolve(JSON.parse(queued) as JsonRpcFrame);
                return;
            }
            const timer = setTimeout(() => reject(new Error('timeout waiting for a JSON-RPC frame')), timeoutMs);
            waiters.push((line) => {
                clearTimeout(timer);
                resolve(JSON.parse(line) as JsonRpcFrame);
            });
        });
    }

    return { proc, send, nextFrame, stderrLines };
}

describe('convert MCP server — spawned contract', () => {
    const server = startServer();
    afterAll(() => {
        if (!server.proc.killed) server.proc.kill('SIGKILL');
    });

    test('initialize → tools/list → call each tool → shutdown, asserting on JSON-RPC frames', async () => {
        server.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const init = await server.nextFrame();
        expect(init.id).toBe(1);
        expect(init.error).toBeUndefined();
        const initResult = init.result as { protocolVersion: string; serverInfo: { name: string } };
        expect(initResult.protocolVersion).toBe('2024-11-05');
        expect(initResult.serverInfo.name).toBe('convert');

        // A notification carries no id and must produce no response frame —
        // proved by immediately following it with an id'd request and
        // asserting the NEXT frame answers that request, not the notification.
        server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

        server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const list = await server.nextFrame();
        expect(list.id).toBe(2);
        const listResult = list.result as { tools: Array<{ name: string; description: string }> };
        expect(listResult.tools.map((t) => t.name).sort()).toEqual(['convert', 'from_md', 'to_html', 'to_md']);
        for (const t of listResult.tools) expect(t.description.length).toBeGreaterThan(0);

        // to_md
        server.send({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'to_md', arguments: { path: SAMPLE_DOCX_PATH, at: '2026-01-01T00:00:00.000Z' } },
        });
        const toMdFrame = await server.nextFrame();
        expect(toMdFrame.id).toBe(3);
        const toMdResult = toMdFrame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(toMdResult.isError).toBe(false);
        const toMdPayload = JSON.parse(toMdResult.content[0]!.text) as { markdown: string; losses: unknown[]; lossy: boolean };
        expect(toMdPayload.markdown.length).toBeGreaterThan(0);
        expect(Array.isArray(toMdPayload.losses)).toBe(true);

        // from_md
        server.send({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'from_md', arguments: { markdown: '# Title\n\nSome *text*.\n', target: 'docx' } },
        });
        const fromMdFrame = await server.nextFrame();
        const fromMdResult = fromMdFrame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(fromMdResult.isError).toBe(false);
        const fromMdPayload = JSON.parse(fromMdResult.content[0]!.text) as { bytesLength: number; target: string };
        expect(fromMdPayload.target).toBe('docx');
        expect(fromMdPayload.bytesLength).toBeGreaterThan(0);

        // convert
        server.send({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'convert', arguments: { path: SAMPLE_DOCX_PATH, target: 'odt' } },
        });
        const convertFrame = await server.nextFrame();
        const convertResult = convertFrame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(convertResult.isError).toBe(false);
        const convertPayload = JSON.parse(convertResult.content[0]!.text) as { format: string; target: string };
        expect(convertPayload.format).toBe('docx');
        expect(convertPayload.target).toBe('odt');

        // to_html
        server.send({
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'to_html', arguments: { markdown: '# Title\n\nSome *text*.\n' } },
        });
        const toHtmlFrame = await server.nextFrame();
        const toHtmlResult = toHtmlFrame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(toHtmlResult.isError).toBe(false);
        const toHtmlPayload = JSON.parse(toHtmlResult.content[0]!.text) as { html: string };
        expect(toHtmlPayload.html).toContain('<h1>Title</h1>');

        // Bad input: a structured error, transport intact — proved by the
        // NEXT call (id 8) still getting an ordinary answer.
        server.send({
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'to_md', arguments: {} },
        });
        const badFrame = await server.nextFrame();
        const badResult = badFrame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(badResult.isError).toBe(true);
        const badPayload = JSON.parse(badResult.content[0]!.text) as { error: string; usage: boolean };
        expect(badPayload.error).toContain('provide either path or bytesBase64');
        expect(badPayload.usage).toBe(true);

        server.send({ jsonrpc: '2.0', id: 8, method: 'ping' });
        const pingFrame = await server.nextFrame();
        expect(pingFrame.id).toBe(8);
        expect(pingFrame.result).toEqual({});
    }, 30_000);

    test('a large output follows the documented rule: written to a file, not silently truncated', async () => {
        const bigMarkdown = `# Title\n\n${'word '.repeat(30_000)}`; // well over MAX_INLINE_TEXT_CHARS (100_000)
        server.send({
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: 'to_html', arguments: { markdown: bigMarkdown } },
        });
        const frame = await server.nextFrame();
        const result = frame.result as { isError: boolean; content: Array<{ type: string; text: string }> };
        expect(result.isError).toBe(false);
        const payload = JSON.parse(result.content[0]!.text) as {
            mode: string;
            html?: string;
            outPath: string;
            length: number;
            preview: string;
            note: string;
        };
        expect(payload.mode).toBe('file');
        expect(payload.html).toBeUndefined();
        expect(payload.preview.length).toBeLessThanOrEqual(2000);
        expect(payload.note).toContain('written to outPath');
        const onDisk = readFileSync(payload.outPath, 'utf8');
        expect(onDisk.length).toBe(payload.length);
        expect(onDisk.startsWith(payload.preview)).toBe(true);
    }, 30_000);

    test('stderr carries diagnostics only, never a JSON-RPC protocol frame', () => {
        for (const line of server.stderrLines) {
            expect(line.trim().startsWith('{"jsonrpc"')).toBe(false);
        }
        // The startup banner itself must have reached stderr (proves stderr is used for diagnostics).
        expect(server.stderrLines.some((l) => l.includes('convert-mcp'))).toBe(true);
    });

    test('SIGTERM triggers a clean shutdown, no orphaned process', async () => {
        const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
            server.proc.once('exit', (code, signal) => resolve({ code, signal }));
        });
        server.proc.kill('SIGTERM');
        const { code, signal } = await exited;
        // Measured (this host, Windows/Bun 1.3.13): Node's child_process.kill()
        // on win32 force-terminates the child at the OS level (like taskkill)
        // and never delivers a catchable signal, so `process.once('SIGTERM', …)`
        // inside mcp.ts is never reached — the process still ends promptly
        // (proving "no orphaned process"), just not via the cooperative path.
        // On POSIX, the signal IS delivered and the handler's `process.exit(0)`
        // must run. Assert per platform rather than pretend Windows proves the
        // cooperative branch it structurally cannot exercise here.
        if (process.platform === 'win32') {
            expect(signal).toBe('SIGTERM');
        } else {
            expect(code).toBe(0);
        }
    }, 15_000);
});
