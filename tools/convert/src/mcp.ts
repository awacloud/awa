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
 * three carries `losses`/`lossSummary`/`lossy` from `./core.ts`, inline or
 * alongside the file-mode payload, never as a side channel. `losses` has one
 * entry per occurrence and grows with the document; `lossSummary` has one
 * counted entry per distinct `code` + `detail`. The optional `lossView`
 * argument (`'full'`, the default, or `'summary'`) leaves `losses` out of
 * the payload when it is `'summary'` — the tool descriptions recommend it,
 * since a long document's ledger costs a caller far more tokens than its
 * summary. `to_html` renders Markdown
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

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import {
    CONVERT_PAIRS,
    FROM_MD_TARGETS,
    TO_MD_FORMATS,
    assetFiles,
    convert as coreConvert,
    fromMd as coreFromMd,
    isCoreError,
    toHtml as coreToHtml,
    toMd as coreToMd,
    type Asset,
    type Loss,
    type LossSummaryEntry,
    type ToMdInput,
} from './core.ts';
import { passwordFromFile } from './password.ts';
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
    enum?: string[];
    items?: { type: string; enum?: string[] };
    properties?: Record<string, { type: string; enum?: string[]; description?: string }>;
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

/** The values `lossView` accepts; `'full'` is the default. */
const LOSS_VIEWS = ['full', 'summary'] as const;
type LossView = (typeof LOSS_VIEWS)[number];

/** The `lossView` argument, or a usage error message. Checked before the input is read. */
function readLossView(value: unknown): LossView | { error: string } {
    if (value === undefined) return 'full';
    if ((LOSS_VIEWS as readonly unknown[]).includes(value)) return value as LossView;
    return { error: `argument lossView: expected "full" or "summary", got ${JSON.stringify(value)}` };
}

function lossFields(
    result: { losses: Loss[]; lossSummary: LossSummaryEntry[]; lossy: boolean },
    view: LossView,
): Record<string, unknown> {
    if (view === 'summary') return { lossSummary: result.lossSummary, lossy: result.lossy };
    return { losses: result.losses, lossSummary: result.lossSummary, lossy: result.lossy };
}

/** Schema description of the `lossView` argument. */
const LOSS_VIEW_DESCRIPTION =
    '"full" (default): "losses" (one entry per occurrence) and "lossSummary". "summary": "lossSummary" only. ' +
    'Any other value is a usage error.';

/** Shared description sentence of the three ledger tools. */
const LOSS_VIEW_HINT =
    `The result's "lossSummary" groups the losses by code and detail with a count; pass "lossView": "summary" ` +
    `to receive it without the per-occurrence "losses" array (recommended — that array grows with the document).`;

/**
 * The `toMd` options the arguments carry, under oconv's own names — only
 * those given; oconv validates every value. The password is read from
 * `pdfPasswordPath` (`passwordFromFile`): no argument carries it in clear.
 */
function toMdOptions(args: Record<string, unknown>): Partial<ToMdInput> | { error: string } {
    let pdfPassword: Uint8Array | undefined;
    if (args.pdfPasswordPath !== undefined) {
        try {
            pdfPassword = passwordFromFile(new Uint8Array(readFileSync(args.pdfPasswordPath as string)));
        } catch (e) {
            return { error: `cannot read pdfPasswordPath: ${(e as Error).message}` };
        }
    }
    const options: Partial<ToMdInput> = {
        includeNotes: args.includeNotes as boolean | undefined,
        sheets: args.sheets as string | undefined,
        formOpBudget: args.formOpBudget as number | undefined,
        pdfInfer: args.pdfInfer as string[] | undefined,
        pdfDeclare: args.pdfDeclare as string[] | undefined,
        pdfInclude: args.pdfInclude as string[] | undefined,
        pdfPassword,
        pdfRecoverXref: args.pdfRecoverXref as boolean | undefined,
        pdfLineHyphens: args.pdfLineHyphens as string | undefined,
        odtInclude: args.odtInclude as string[] | undefined,
        docxInclude: args.docxInclude as string[] | undefined,
        sheetCellBudget: args.sheetCellBudget as number | undefined,
        archiveLimits: args.archiveLimits as ToMdInput['archiveLimits'],
        outputBudget: args.outputBudget as ToMdInput['outputBudget'],
        opts: args.frontMatter === undefined ? undefined : { frontMatter: args.frontMatter as string },
    };
    return Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
}

/** Write the assets `assetFiles` accepts under `dir`; the payload lists what was written and what was not. */
function writeAssets(dir: string, assets: Asset[]): Record<string, unknown> {
    const { files, skipped } = assetFiles(assets);
    const written = files.map((f) => {
        const path = join(dir, f.name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, f.bytes);
        return { name: f.name, path, bytesLength: f.bytes.byteLength };
    });
    return { assets: written, assetsSkipped: skipped };
}

async function handleToMd(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Checked BEFORE readBinaryInput: a usage error in `at` or `lossView`
    // must win even when the input cannot be read at all.
    const at = (args.at as string | undefined) ?? new Date().toISOString();
    const atError = timestampError(at);
    if (atError !== null) return { error: `argument at: ${atError}`, usage: true };
    const view = readLossView(args.lossView);
    if (typeof view === 'object') return { error: view.error, usage: true };

    const input = readBinaryInput({
        path: args.path as string | undefined,
        bytesBase64: args.bytesBase64 as string | undefined,
        name: args.name as string | undefined,
    });
    if (isInputError(input)) return { error: input.error, usage: true };
    const options = toMdOptions(args);
    if (isInputError(options)) return { error: options.error, usage: true };

    const result = await coreToMd({
        name: input.name,
        bytes: input.bytes,
        convertedAt: at,
        format: args.format as string | undefined,
        ...options,
    });
    if (isCoreError(result)) return { error: result.error, usage: result.usage };
    const assets = args.assetsDir === undefined ? {} : writeAssets(args.assetsDir as string, result.assets);
    return deliverText(result.markdown, 'md', 'markdown', args.outPath as string | undefined, { ...lossFields(result, view), ...assets });
}

async function handleFromMd(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const view = readLossView(args.lossView);
    if (typeof view === 'object') return { error: view.error, usage: true };
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
        { target: result.target, ...lossFields(result, view) },
    );
}

async function handleConvert(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const view = readLossView(args.lossView);
    if (typeof view === 'object') return { error: view.error, usage: true };
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
        { format: result.format, target: result.target, ...lossFields(result, view) },
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
            `(pptx/odp only, default false) includes speaker notes, "sheets" (xlsx/ods only: "table", the default, ` +
            `"csv" or "tsv" — each sheet as a fenced csv/tsv block, far fewer tokens than a table on a dense ` +
            `sheet) chooses how sheets are written, "at" pins the ISO-8601 provenance timestamp ` +
            `(default: now — @awacloud/oconv never defaults it itself). The other options are @awacloud/oconv's ` +
            `toMd inputs of the same name, each for the source format it names: "pdfInfer" (headings, tables on an ` +
            `untagged pdf), "pdfDeclare", "pdfInclude" (["images"]: the pictures, written under "assetsDir"), ` +
            `"pdfRecoverXref", "pdfLineHyphens" ("drop" or "keep": a word cut by a line-end hyphen joined), "pdfPasswordPath" (a file holding the password of an encrypted pdf — no argument ` +
            `takes the password itself), "formOpBudget", "odtInclude" (["toc"]), "docxInclude" (["toc"]), "sheetCellBudget" (xlsx/ods: a ` +
            `sheet whose padded table would pass it is written one addressed line per value), "archiveLimits" ` +
            `(office formats: the reader's maxParts, maxUncompressed, maxRatio, maxDepth), "outputBudget" ` +
            `({bytes, overflow}: past bytes of text the conversion fails, or with overflow "truncate" keeps what ` +
            `fits) and "frontMatter" ("compact" or ` +
            `"none" shrink the front matter); one on another source format, or a value oconv refuses, is a usage ` +
            `error. "assetsDir" writes each image whose bytes the conversion returned under that directory and ` +
            `lists them in "assets" (unwritten ones in "assetsSkipped"). "outPath" writes the markdown to that ` +
            `file instead of returning it inline; large output is written to a file automatically even without it. ` +
            LOSS_VIEW_HINT,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the source file on disk.' },
                bytesBase64: { type: 'string', description: 'Inline source bytes, base64-encoded. Requires "name".' },
                name: { type: 'string', description: 'Source file name (drives format detection). Required with bytesBase64.' },
                format: { type: 'string', description: `Explicit source format, overrides name-based detection: ${TO_MD_FORMATS.join(' | ')}.` },
                includeNotes: { type: 'boolean', description: 'pptx/odp only: include speaker notes. Default false.' },
                sheets: {
                    type: 'string',
                    enum: ['table', 'csv', 'tsv'],
                    description: 'xlsx/ods only: how each sheet is written — "table" (default, a GFM table), "csv" or "tsv" (a fenced block, much smaller on a dense sheet).',
                },
                pdfInfer: {
                    type: 'array',
                    items: { type: 'string', enum: ['headings', 'tables', 'running'] },
                    description: 'pdf only: inference on an untagged pdf — headings from type size and weight, tables from rules or aligned text, running headers and footers left out.',
                },
                pdfDeclare: {
                    type: 'array',
                    items: { type: 'string', enum: ['positional'] },
                    description: 'pdf only: "positional" records one struct/positional loss when the structure was built from positions.',
                },
                pdfInclude: {
                    type: 'array',
                    items: { type: 'string', enum: ['images'] },
                    description: 'pdf only: "images" places JPEG, JPEG 2000 and raw-pixel pictures; their bytes are written under "assetsDir".',
                },
                pdfRecoverXref: { type: 'boolean', description: 'pdf only: true rebuilds an unusable cross-reference chain.' },
                pdfLineHyphens: {
                    type: 'string',
                    enum: ['drop', 'keep'],
                    description: 'pdf only: a word a hyphen cuts at a line end is joined — "drop" without the hyphen, "keep" with it (a soft hyphen always joins).',
                },
                pdfPasswordPath: {
                    type: 'string',
                    description: 'pdf only: a file holding the user or owner password of an encrypted pdf (one trailing line break is dropped).',
                },
                formOpBudget: { type: 'integer', description: 'pdf only: per-page Form XObject operator budget, default 1000000.' },
                odtInclude: {
                    type: 'array',
                    items: { type: 'string', enum: ['toc'] },
                    description: 'odt only: "toc" reads a table of contents\' entries as paragraphs.',
                },
                docxInclude: {
                    type: 'array',
                    items: { type: 'string', enum: ['toc'] },
                    description: 'docx only: "toc" reads a table of contents control\'s entries as paragraphs.',
                },
                sheetCellBudget: {
                    type: 'integer',
                    description: 'xlsx/ods only: a sheet whose padded table would hold more cells is written unpadded, one "<A1 address>: <text>" line per value (loss sheet/sparse-form).',
                },
                archiveLimits: {
                    type: 'object',
                    description: 'Office formats only: the reader\'s archive limits, each a non-negative integer (0 disables a check); odt, ods and odp take the first three.',
                    properties: {
                        maxParts: { type: 'integer', description: 'Entries in the archive (default 8192 for docx, xlsx, pptx; 4096 for odt, ods, odp).' },
                        maxUncompressed: { type: 'integer', description: 'Total inflated bytes (default 256 MiB).' },
                        maxRatio: { type: 'integer', description: 'Inflated / compressed ratio per entry (default 200).' },
                        maxDepth: { type: 'integer', description: 'Element depth of an XML part (default 1000; docx, xlsx, pptx).' },
                    },
                },
                outputBudget: {
                    type: 'object',
                    description: 'Every format: a bound on the document\'s text (UTF-8 bytes), checked before the markdown is built.',
                    properties: {
                        bytes: { type: 'integer', description: 'The budget, a positive integer.' },
                        overflow: { type: 'string', enum: ['throw', 'truncate'], description: '"throw" (default) fails; "truncate" keeps what fits (loss doc/truncated).' },
                    },
                },
                frontMatter: {
                    type: 'string',
                    enum: ['full', 'compact', 'none'],
                    description: '"full" (default), "compact" (the loss ledger counted per code and detail) or "none" (the body alone).',
                },
                assetsDir: {
                    type: 'string',
                    description: 'Write each image whose bytes the conversion returned under this directory, at the path the markdown names.',
                },
                at: {
                    type: 'string',
                    description: 'RFC 3339 date-time, e.g. 2026-01-01T00:00:00.000Z. Default: now. Any other value is a usage error.',
                },
                outPath: { type: 'string', description: 'Write the markdown to this file instead of returning it inline.' },
                lossView: { type: 'string', description: LOSS_VIEW_DESCRIPTION },
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
            `large binary output is written to a file automatically even without it (never truncated in place). ` +
            LOSS_VIEW_HINT,
        inputSchema: {
            type: 'object',
            properties: {
                markdown: { type: 'string', description: 'Inline Markdown source text.' },
                path: { type: 'string', description: 'Path to a Markdown file on disk (alternative to "markdown").' },
                name: { type: 'string', description: 'Output file name — its extension drives target detection when "target" is omitted.' },
                target: { type: 'string', description: `Required. Target format: ${FROM_MD_TARGETS.join(' | ')}.` },
                outPath: { type: 'string', description: 'Write the output bytes to this file instead of base64-inlining them.' },
                lossView: { type: 'string', description: LOSS_VIEW_DESCRIPTION },
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
            `automatically even without it (never truncated in place). ` +
            LOSS_VIEW_HINT,
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the source file on disk.' },
                bytesBase64: { type: 'string', description: 'Inline source bytes, base64-encoded. Requires "name".' },
                name: { type: 'string', description: 'Source file name (drives format detection). Required with bytesBase64.' },
                format: { type: 'string', description: 'Explicit source format, overrides name-based detection.' },
                target: { type: 'string', description: `Required. Target format: ${CONVERT_PAIRS.map((p) => p.split('>')[1]).join(' | ')}.` },
                outPath: { type: 'string', description: 'Write the output bytes to this file instead of base64-inlining them.' },
                lossView: { type: 'string', description: LOSS_VIEW_DESCRIPTION },
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
        if (!hasSchemaType(v, spec)) return `argument ${k}: expected ${describeSchemaType(spec)}, got ${Array.isArray(v) ? 'array' : typeof v}`;
    }
    return null;
}

/** The JSON-schema type check: `integer` and `array` (of `items.type`) beside the `typeof` names. Enums are left to oconv. */
function hasSchemaType(v: unknown, spec: SchemaProperty): boolean {
    if (spec.type === 'integer') return Number.isInteger(v);
    if (spec.type === 'array') return Array.isArray(v) && v.every((item) => typeof item === spec.items?.type);
    return typeof v === spec.type;
}

function describeSchemaType(spec: SchemaProperty): string {
    return spec.type === 'array' ? `array of ${spec.items?.type}` : spec.type;
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
