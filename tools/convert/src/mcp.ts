// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/mcp.ts — `@awacloud/tool-convert`'s stdio MCP server.
 *
 * Exposes the four conversion operations of `./core.ts` (`toMd`, `fromMd`,
 * `convert`, `toHtml`) as MCP tools (`to_md`, `from_md`, `convert`,
 * `to_html`) over newline-delimited JSON-RPC 2.0 on stdio — the same
 * transport discipline, error shape and "one tool call, one measured
 * answer" contract as `tools/mcp/src/server.ts` (read as a structural
 * model only; nothing here imports it — this package publishes under a
 * different licence/distribution than the unpublished `tools/mcp`, so the
 * JSON-RPC framing below is a small, self-contained reimplementation, zero
 * runtime dependencies, not a shared import).
 *
 * Every operation goes through `./core.ts` — no second mapping onto
 * `@awacloud/oconv`/`@awacloud/md` exists here. The server never throws
 * across the transport: a bad argument or a core failure both come back as
 * a structured `{ error, usage }` JSON payload inside a normal `tools/call`
 * result with `isError: true`, exactly as `core.ts` never throws either.
 *
 * ## Large-output rule
 *
 * A conversion result can be far larger than a tool response should carry.
 * Every tool accepts an optional `outPath`: when given, the output is
 * ALWAYS written there (never inlined), matching the CLI's `--out`. When
 * omitted, output under `MAX_INLINE_TEXT_CHARS` (text: `to_md`/`to_html`)
 * or `MAX_INLINE_BYTES` (binary: `from_md`/`convert`) comes back inline
 * (`mode: 'inline'`); output at or above that size is written to a fresh
 * temp file instead (`mode: 'file'`, `outPath` + size fields), with an
 * explicit `note` saying so and, for text, a `preview` of the first 2000
 * characters — clearly labelled as a preview, never a silent cut. Binary
 * output is never truncated in place of redirection: truncating document
 * bytes would corrupt them, so oversized binary output always goes to a
 * file, in full. Temp files are NOT deleted by this server (the caller has
 * not necessarily read the path yet when the tool call returns); cleanup
 * is the caller's/OS's.
 *
 * ## Loss data
 *
 * `to_md`, `from_md` and `convert` are backed by `@awacloud/oconv`, which
 * tracks fidelity losses per conversion — every successful result of these
 * three carries `losses`/`lossy` from `./core.ts`, inline or alongside the
 * file-mode payload, never as a side channel. `to_html` renders Markdown
 * through `@awacloud/md`'s safe, sanitised renderer, which drops raw HTML (a
 * block with its content, inline tags keeping their text), empties
 * `javascript:`, `vbscript:`, `file:` and `data:` URLs (images included) and
 * removes whatever the sanitiser allowlist excludes, keeping task-list
 * checkboxes as disabled inputs; it interprets no footnotes, front matter or
 * math and emits no CSS or table of contents. Its result carries no `losses`
 * field because the renderer does not itemise those drops: the absence means
 * "not itemised", never "nothing lost".
 *
 * @module tool-convert/mcp
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import {
    CONVERT_PAIRS,
    FROM_MD_TARGETS,
    TO_MD_FORMATS,
    convert as coreConvert,
    fromMd as coreFromMd,
    isCoreError,
    toHtml as coreToHtml,
    toMd as coreToMd,
    type Loss,
} from './core.ts';
import { timestampError } from './timestamp.ts';

const VERSION: string = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
const PROTOCOL_VERSION = '2024-11-05';

/** Text output (`to_md`/`to_html`) at or above this length is written to a file instead of inlined. */
export const MAX_INLINE_TEXT_CHARS = 100_000;
/** Binary output (`from_md`/`convert`) at or above this byte length is written to a file instead of base64-inlined. */
export const MAX_INLINE_BYTES = 75_000;
/** Length of the explicit preview kept alongside a file-mode text result. */
const PREVIEW_CHARS = 2000;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 framing — self-contained, zero deps (structural model:
// tools/mcp/src/core/protocol.ts; not imported, see module doc).
// ---------------------------------------------------------------------------

export interface RpcRequest {
    jsonrpc: '2.0';
    id?: number | string | null;
    method: string;
    params?: Record<string, unknown>;
}

export interface RpcError {
    code: number;
    message: string;
}

export interface RpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: RpcError;
}

export const PARSE_ERROR = -32700;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class RpcFailure extends Error {
    rpcCode: number;
    constructor(code: number, message: string) {
        super(message);
        this.rpcCode = code;
    }
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

interface SchemaProperty {
    type: string;
    description?: string;
}

export interface ToolDef {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, SchemaProperty>;
        required?: string[];
    };
    handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

type BinaryInput = { bytes: Uint8Array; name: string } | { error: string };
type TextInput = { text: string } | { error: string };

function readBinaryInput(opts: { path?: string; bytesBase64?: string; name?: string }): BinaryInput {
    if (opts.path !== undefined) {
        try {
            const raw = readFileSync(opts.path);
            return { bytes: new Uint8Array(raw), name: opts.name ?? basename(opts.path) };
        } catch (e) {
            return { error: `cannot read path: ${(e as Error).message}` };
        }
    }
    if (opts.bytesBase64 !== undefined) {
        if (opts.name === undefined) {
            return { error: 'name is required when bytesBase64 is provided (no path to derive it from)' };
        }
        try {
            const raw = Buffer.from(opts.bytesBase64, 'base64');
            return { bytes: new Uint8Array(raw), name: opts.name };
        } catch (e) {
            return { error: `invalid bytesBase64: ${(e as Error).message}` };
        }
    }
    return { error: 'provide either path or bytesBase64' };
}

function readTextInput(opts: { path?: string; text?: string }): TextInput {
    if (opts.text !== undefined) return { text: opts.text };
    if (opts.path !== undefined) {
        try {
            return { text: readFileSync(opts.path, 'utf8') };
        } catch (e) {
            return { error: `cannot read path: ${(e as Error).message}` };
        }
    }
    return { error: 'provide either markdown or path' };
}

function isInputError<T extends { error: string }>(v: unknown): v is T {
    return typeof v === 'object' && v !== null && 'error' in v;
}

/** Deliver text output inline, or to a file when it is too large / an `outPath` was requested. Never silently cut. */
export function deliverText(
    content: string,
    ext: string,
    contentKey: string,
    outPath: string | undefined,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    if (outPath !== undefined) {
        writeFileSync(outPath, content, 'utf8');
        return { ...extra, mode: 'file', outPath, length: content.length, note: 'written to outPath as requested' };
    }
    if (content.length >= MAX_INLINE_TEXT_CHARS) {
        const dir = mkdtempSync(join(tmpdir(), 'convert-mcp-'));
        const filePath = join(dir, `output.${ext}`);
        writeFileSync(filePath, content, 'utf8');
        return {
            ...extra,
            mode: 'file',
            outPath: filePath,
            length: content.length,
            preview: content.slice(0, PREVIEW_CHARS),
            note: `output is ${content.length} chars (>= ${MAX_INLINE_TEXT_CHARS}) — full content written to outPath; "preview" is an explicit, labelled excerpt, not a silent cut`,
        };
    }
    return { ...extra, mode: 'inline', [contentKey]: content, length: content.length };
}

/** Deliver binary output inline (base64) or to a file when too large / an `outPath` was requested. Oversized binary is never truncated — only redirected, in full, since a truncated document is a corrupt one. */
export function deliverBinary(
    bytes: Uint8Array,
    ext: string,
    outPath: string | undefined,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    if (outPath !== undefined) {
        writeFileSync(outPath, bytes);
        return { ...extra, mode: 'file', outPath, bytesLength: bytes.byteLength, note: 'written to outPath as requested' };
    }
    if (bytes.byteLength >= MAX_INLINE_BYTES) {
        const dir = mkdtempSync(join(tmpdir(), 'convert-mcp-'));
        const filePath = join(dir, `output.${ext}`);
        writeFileSync(filePath, bytes);
        return {
            ...extra,
            mode: 'file',
            outPath: filePath,
            bytesLength: bytes.byteLength,
            note: `output is ${bytes.byteLength} bytes (>= ${MAX_INLINE_BYTES}) — full content written to outPath; binary output is never truncated, only redirected`,
        };
    }
    return { ...extra, mode: 'inline', bytesBase64: Buffer.from(bytes).toString('base64'), bytesLength: bytes.byteLength };
}

function lossFields(losses: Loss[], lossy: boolean): Record<string, unknown> {
    return { losses, lossy };
}

async function handleToMd(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Checked BEFORE readBinaryInput: a usage error in `at` must win even
    // when the input cannot be read at all.
    const at = (args.at as string | undefined) ?? new Date().toISOString();
    const atError = timestampError(at);
    if (atError !== null) return { error: `argument at: ${atError}`, usage: true };

    const input = readBinaryInput({
        path: args.path as string | undefined,
        bytesBase64: args.bytesBase64 as string | undefined,
        name: args.name as string | undefined,
    });
    if (isInputError(input)) return { error: input.error, usage: true };

    const result = await coreToMd({
        name: input.name,
        bytes: input.bytes,
        convertedAt: at,
        format: args.format as string | undefined,
        includeNotes: args.includeNotes as boolean | undefined,
    });
    if (isCoreError(result)) return { error: result.error, usage: result.usage };
    return deliverText(result.markdown, 'md', 'markdown', args.outPath as string | undefined, lossFields(result.losses, result.lossy));
}

async function handleFromMd(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const input = readTextInput({ path: args.path as string | undefined, text: args.markdown as string | undefined });
    if (isInputError(input)) return { error: input.error, usage: true };

    const result = await coreFromMd({
        markdown: input.text,
        name: args.name as string | undefined,
        target: args.target as string | undefined,
    });
    if (isCoreError(result)) return { error: result.error, usage: result.usage };
    return deliverBinary(
        result.bytes,
        result.target,
        args.outPath as string | undefined,
        { target: result.target, ...lossFields(result.losses, result.lossy) },
    );
}

async function handleConvert(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const input = readBinaryInput({
        path: args.path as string | undefined,
        bytesBase64: args.bytesBase64 as string | undefined,
        name: args.name as string | undefined,
    });
    if (isInputError(input)) return { error: input.error, usage: true };

    const result = await coreConvert({
        name: input.name,
        bytes: input.bytes,
        format: args.format as string | undefined,
        target: args.target as string,
    });
    if (isCoreError(result)) return { error: result.error, usage: result.usage };
    return deliverBinary(
        result.bytes,
        result.target,
        args.outPath as string | undefined,
        { format: result.format, target: result.target, ...lossFields(result.losses, result.lossy) },
    );
}

async function handleToHtml(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const input = readTextInput({ path: args.path as string | undefined, text: args.markdown as string | undefined });
    if (isInputError(input)) return { error: input.error, usage: true };

    const result = await coreToHtml({ markdown: input.text });
    if (isCoreError(result)) return { error: result.error, usage: result.usage };
    // No losses field: the renderer drops content (see the module doc) but does not itemise it.
    return deliverText(result.html, 'html', 'html', args.outPath as string | undefined);
}

export const TOOLS: ToolDef[] = [
    {
        name: 'to_md',
        description:
            `Convert a document to structured Markdown via @awacloud/oconv. ` +
            `What it needs: the source file, either as a filesystem path ("path") or as inline base64 bytes ` +
            `("bytesBase64" + "name" — "name" is required in that case, since there is then no path to derive ` +
            `the extension/format from). Supported source formats: ${TO_MD_FORMATS.join(', ')}. ` +
            `What it loses: presentation/layout formatting and most inline styling beyond basic emphasis and ` +
            `headings, plus whatever this specific conversion recorded — see the result's "losses" array ` +
            `(office/oconv's docs/loss-matrix.md has the fidelity table per source format). ` +
            `Options mirror the CLI's "to-md" verb: "format" overrides extension-based detection, "includeNotes" ` +
            `(pptx/odp only, default false) includes speaker notes, "at" pins the ISO-8601 provenance timestamp ` +
            `(default: now — @awacloud/oconv never defaults it itself). "outPath" writes the markdown to that ` +
            `file instead of returning it inline; large output is written to a file automatically even without it.`,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the source file on disk.' },
                bytesBase64: { type: 'string', description: 'Inline source bytes, base64-encoded. Requires "name".' },
                name: { type: 'string', description: 'Source file name (drives format detection). Required with bytesBase64.' },
                format: { type: 'string', description: `Explicit source format, overrides name-based detection: ${TO_MD_FORMATS.join(' | ')}.` },
                includeNotes: { type: 'boolean', description: 'pptx/odp only: include speaker notes. Default false.' },
                at: {
                    type: 'string',
                    description: 'RFC 3339 date-time, e.g. 2026-01-01T00:00:00.000Z. Default: now. Any other value is a usage error.',
                },
                outPath: { type: 'string', description: 'Write the markdown to this file instead of returning it inline.' },
            },
        },
        handler: handleToMd,
    },
    {
        name: 'from_md',
        description:
            `Convert Markdown to a target document format via @awacloud/oconv. ` +
            `What it needs: the Markdown, either as inline text ("markdown") or as a file path ("path"), plus ` +
            `the required "target". Supported targets: ${FROM_MD_TARGETS.join(', ')}. ` +
            `What it loses: nothing this step introduces on its own — the produced document is only as rich as ` +
            `the input Markdown; any richer formatting from an original source was already lost at a prior ` +
            `to_md/convert step, not here. See the result's "losses" array for what @awacloud/oconv recorded ` +
            `for this specific target. "outPath" writes the output to that file instead of base64-inlining it; ` +
            `large binary output is written to a file automatically even without it (never truncated in place).`,
        inputSchema: {
            type: 'object',
            properties: {
                markdown: { type: 'string', description: 'Inline Markdown source text.' },
                path: { type: 'string', description: 'Path to a Markdown file on disk (alternative to "markdown").' },
                name: { type: 'string', description: 'Output file name — its extension drives target detection when "target" is omitted.' },
                target: { type: 'string', description: `Required. Target format: ${FROM_MD_TARGETS.join(' | ')}.` },
                outPath: { type: 'string', description: 'Write the output bytes to this file instead of base64-inlining them.' },
            },
            required: ['target'],
        },
        handler: handleFromMd,
    },
    {
        name: 'convert',
        description:
            `Direct cross-format document conversion via @awacloud/oconv, no Markdown pivot in the result. ` +
            `What it needs: the source file, either as a filesystem path ("path") or as inline base64 bytes ` +
            `("bytesBase64" + "name"), plus the required "target". Supported pairs: ${CONVERT_PAIRS.join(', ')} — no ` +
            `other source/target combination, including any same-format pair, is accepted. ` +
            `What it loses: whatever the docx/odt/pdf loss matrix records for that specific pair — see the ` +
            `result's "losses" array; a pdf target is one-way, nothing can be produced back from it, and pdf ` +
            `pairs typically carry layout-fidelity losses this pipeline does not correct for. "outPath" writes ` +
            `the output to that file instead of base64-inlining it; large binary output is written to a file ` +
            `automatically even without it (never truncated in place).`,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the source file on disk.' },
                bytesBase64: { type: 'string', description: 'Inline source bytes, base64-encoded. Requires "name".' },
                name: { type: 'string', description: 'Source file name (drives format detection). Required with bytesBase64.' },
                format: { type: 'string', description: 'Explicit source format, overrides name-based detection.' },
                target: { type: 'string', description: `Required. Target format: ${CONVERT_PAIRS.map((p) => p.split('>')[1]).join(' | ')}.` },
                outPath: { type: 'string', description: 'Write the output bytes to this file instead of base64-inlining them.' },
            },
            required: ['target'],
        },
        handler: handleConvert,
    },
    {
        name: 'to_html',
        description:
            `Convert Markdown to an HTML fragment via @awacloud/md's renderHtmlMod. ` +
            `What it needs: the Markdown, either as inline text ("markdown") or as a file path ("path"). ` +
            `What it loses: the render is safe and sanitised, so raw HTML in the Markdown is dropped (a raw HTML block ` +
            `with its content, inline tags keeping their text), links and images with a javascript:, vbscript:, file: ` +
            `or data: URL keep an empty href/src, and anything outside the sanitiser allowlist is removed; task-list ` +
            `checkboxes stay, as disabled inputs. No embedded CSS, no table of contents, and Markdown extensions ` +
            `(footnotes, front matter, math) are not interpreted. Unlike the other three tools, the result carries no ` +
            `"losses" array: the renderer does not itemise what it drops. "outPath" writes the HTML to that file instead ` +
            `of returning it inline; large output is written ` +
            `to a file automatically even without it.`,
        inputSchema: {
            type: 'object',
            properties: {
                markdown: { type: 'string', description: 'Inline Markdown source text.' },
                path: { type: 'string', description: 'Path to a Markdown file on disk (alternative to "markdown").' },
                outPath: { type: 'string', description: 'Write the HTML to this file instead of returning it inline.' },
            },
        },
        handler: handleToHtml,
    },
];

function validateArgs(def: ToolDef, args: Record<string, unknown>): string | null {
    for (const req of def.inputSchema.required ?? []) {
        if (args[req] === undefined || args[req] === null) return `missing required argument: ${req}`;
    }
    for (const [k, v] of Object.entries(args)) {
        const spec = def.inputSchema.properties[k];
        if (!spec) return `unknown argument: ${k}`;
        if (typeof v !== spec.type) return `argument ${k}: expected ${spec.type}, got ${typeof v}`;
    }
    return null;
}

function textResult(payload: Record<string, unknown>, isError: boolean): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError };
}

/**
 * Dispatch one `tools/call`. Never throws — a bad tool name, a bad
 * argument, or a handler failure all come back as a structured
 * `{ error, usage }` payload with `isError: true`.
 */
export async function callTool(
    name: string,
    args: Record<string, unknown> = {},
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
    const def = TOOLS.find((t) => t.name === name);
    if (!def) return textResult({ error: `unknown tool: ${name}`, usage: true }, true);

    const validationError = validateArgs(def, args);
    if (validationError !== null) return textResult({ error: validationError, usage: true }, true);

    try {
        const payload = await def.handler(args);
        const isError = 'error' in payload;
        return textResult(payload, isError);
    } catch (e) {
        return textResult({ error: e instanceof Error ? e.message : String(e), usage: false }, true);
    }
}

/** One JSON-RPC request → response payload (`server.ts`'s counterpart). Never throws for a `tools/call`; other methods raise `RpcFailure` for `serve()` to frame as a JSON-RPC error. */
export async function handleRequest(req: RpcRequest): Promise<unknown> {
    switch (req.method) {
        case 'initialize':
            return {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'convert', version: VERSION },
            };
        case 'notifications/initialized':
        case 'notifications/cancelled':
            return undefined; // notifications — no response
        case 'ping':
            return {};
        case 'tools/list':
            return {
                tools: TOOLS.map((def) => {
                    const { handler: _h, ...rest } = def;
                    void _h;
                    return rest;
                }),
            };
        case 'tools/call': {
            const name = req.params?.name;
            if (typeof name !== 'string') throw new RpcFailure(INVALID_PARAMS, 'tools/call requires params.name');
            const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
            return callTool(name, args);
        }
        default:
            throw new RpcFailure(METHOD_NOT_FOUND, `unknown method: ${req.method}`);
    }
}

function writeFrame(msg: RpcResponse): void {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
}

/** Read newline-delimited JSON-RPC frames from stdin and dispatch each to `handleRequest`, writing responses to stdout. Runs until stdin closes. Never writes a protocol frame to stderr. */
export async function serve(): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    const reader = Bun.stdin.stream().getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const trimmed = line.trim();
            if (!trimmed) continue;

            let req: RpcRequest;
            try {
                const parsed = JSON.parse(trimmed) as RpcRequest;
                if (parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string') {
                    throw new Error('not a JSON-RPC 2.0 request');
                }
                req = parsed;
            } catch {
                writeFrame({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'parse error' } });
                continue;
            }

            const isNotification = req.id === undefined;
            try {
                const result = await handleRequest(req);
                if (!isNotification) writeFrame({ jsonrpc: '2.0', id: req.id ?? null, result });
            } catch (e) {
                if (!isNotification) {
                    const known = e as { rpcCode?: number; message?: string };
                    writeFrame({
                        jsonrpc: '2.0',
                        id: req.id ?? null,
                        error: { code: known.rpcCode ?? INTERNAL_ERROR, message: known.message ?? String(e) },
                    });
                }
            }
        }
    }
}

if (import.meta.main) {
    // Long-running tool: one-line startup banner on stderr, never stdout —
    // stdout carries JSON-RPC frames only.
    process.stderr.write(`convert-mcp ${VERSION}: stdio JSON-RPC MCP server — Ctrl+C to stop\n`);

    process.once('SIGINT', () => {
        process.stderr.write('convert-mcp: SIGINT — shutting down\n');
        process.exit(0);
    });
    process.once('SIGTERM', () => {
        process.stderr.write('convert-mcp: SIGTERM — shutting down\n');
        process.exit(0);
    });

    serve().catch((e: unknown) => {
        process.stderr.write(`convert-mcp: fatal: ${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    });
}
