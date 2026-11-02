// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * tools/convert/src/core.ts — the runtime-agnostic `@awacloud/tool-convert`
 * conversion core.
 *
 * One exported async function per operation (`toMd`, `fromMd`, `convert`,
 * `toHtml`), each taking plain data (bytes/string + options) and returning a
 * result object that carries either the operation's output or an `error`
 * STRING — never a thrown exception across this boundary, mirroring
 * `@awacloud/oconv`'s own worker envelope
 * (`packages/front/office/oconv/src/worker.js`).
 *
 * Runtime-agnostic means measurable, not aspirational: this module touches
 * no `Bun.*` global and no Node built-in through a bare specifier — only
 * `@awacloud/fw`, `@awacloud/oconv` and `@awacloud/md`, each through its
 * PUBLISHED export path (`package.json` `exports`), never a deep relative
 * path into `packages/front/office/**`. File I/O, argv parsing and process
 * access live in `./index.ts` (the CLI shell), not here — the Node/Deno
 * runtime matrix proves this; this module must keep it true.
 *
 * ## Wiring pattern
 *
 * `@awacloud/oconv` and `@awacloud/md` are `fw` dependency-injection module
 * descriptor sets (`fw_require` + `modules`), not plain function exports —
 * the SAME pattern `packages/front/office/oconv/src/worker.js` and
 * `apps/demo/office-reader/src/convert.js` use to obtain the `oconv`/`md`
 * facades outside a browser, without a `Worker`:
 *
 * ```js
 * const runtime = new ModuleRuntime();
 * runtime.registerAll(fw_require);
 * runtime.registerAll(modules);
 * const oconv = runtime.resolve('oconv');
 * ```
 *
 * The `md` runtime also registers `extras`, because `modules` lists
 * `mdHtmlDocument`, whose dependencies (`mdToc`, `mdFrontmatter`, ...) live
 * in `extras`.
 *
 * A fresh `ModuleRuntime` is built per call — these are cheap, pure-JS
 * registrations (no I/O), and a CLI invocation is one-shot. Every imported
 * array goes through `toModuleDefinitions` (`./descriptors.ts`), a runtime
 * check that types it for `registerAll` without a cast; a malformed entry
 * surfaces as an `internal/descriptor` error result.
 *
 * ## The supported-format list (a documented limitation)
 *
 * A format/target/pair usage error should name the formats actually
 * supported, read from `oconv` rather than from a second hard-coded copy.
 * `@awacloud/oconv`'s facade (`oconv.js`) validates
 * `format`/`target`/`format>target` pairs against three `Set`s
 * (`SUPPORTED_FORMATS`, `SUPPORTED_TARGETS`, `SUPPORTED_PAIRS`) that are
 * declared INSIDE its factory closure and never exported — `@awacloud/oconv`'s
 * `package.json` `exports` map publishes exactly two subpaths (`.` and
 * `./src/worker.js`), neither of which carries a capability accessor, and
 * no other public constant exists anywhere in the package. Detection
 * itself needs no duplicate: this module forwards `name` verbatim and lets
 * `oconv`'s OWN `extensionFormat`/`extensionTarget` resolve it (identical
 * to `apps/demo/office-reader/src/convert.js`'s precedent of never
 * pre-validating and letting `oconv` reject). Only the HUMAN-FACING hint
 * appended to an `unsupported format/target/pair` message cannot be sourced
 * from `oconv` at all; the lists below mirror its three `Set`s and
 * `docs/loss-matrix.md` / `docs/convert.md` for that hint only — they gate
 * nothing. If `oconv` published these sets as data, this mirror could go.
 *
 * @module tool-convert/core
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require as oconvFwRequire, modules as oconvModules } from '@awacloud/oconv';
import { extras as mdExtras, fw_require as mdFwRequire, modules as mdModules } from '@awacloud/md';
import { toModuleDefinitions } from './descriptors.ts';
import { summarizeLosses } from './loss-summary.ts';
import { timestampError } from './timestamp.ts';

/** Mirrors `oconv.js`'s `SUPPORTED_FORMATS` — message-hint use only, see the module doc. */
export const TO_MD_FORMATS = ['docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'pdf'] as const;
/** Mirrors `oconv.js`'s `SUPPORTED_TARGETS` — message-hint use only. */
export const FROM_MD_TARGETS = ['docx', 'odt', 'pdf'] as const;
/** Mirrors `oconv.js`'s `SUPPORTED_PAIRS` — message-hint use only. */
export const CONVERT_PAIRS = ['docx>odt', 'odt>docx', 'docx>pdf', 'odt>pdf'] as const;

/**
 * One fidelity loss `@awacloud/oconv` recorded, in document order (reader
 * losses, then writer losses). Most losses carry a string `detail`; the pdf
 * writer's layout losses carry an object `detail` plus `index` and `kind`
 * (measured on `fromMd` / `convert` with a `pdf` target).
 */
export interface Loss {
    /** Namespaced code, e.g. `block/dropped`, `list/task-marker-dropped`, `layout/image-dropped`. */
    code: string;
    detail: string | Record<string, unknown>;
    /** pdf-writer losses only: the IR block index the loss refers to. */
    index?: string;
    /** pdf-writer losses only: the IR block kind (`paragraph`, `image`, ...). */
    kind?: string;
}

/**
 * One entry of a result's `lossSummary`: a distinct `code` + `detail` of the
 * `losses` ledger and how many times it occurs. Entries keep the order in
 * which each first occurs; an object `detail` is compared by its JSON form;
 * a pdf loss's `index` and `kind` are left out (`./loss-summary.ts`).
 */
export interface LossSummaryEntry {
    code: string;
    detail: string | Record<string, unknown>;
    /** Occurrences of this `code` + `detail` in `losses` (at least 1). */
    count: number;
}

/** `true` when the failure is a usage/config problem (bad format/target/pair) — the CLI shell exits 2 for these, 1 otherwise. */
export interface CoreError {
    error: string;
    usage: boolean;
}

function isCoreError(v: { error: string | null }): v is CoreError {
    return v.error !== null;
}

function appendSupportedHint(message: string): string {
    if (/unsupported format/.test(message)) return `${message} (supported: ${TO_MD_FORMATS.join(', ')})`;
    if (/unsupported target/.test(message)) return `${message} (supported: ${FROM_MD_TARGETS.join(', ')})`;
    if (/unsupported pair/.test(message)) return `${message} (supported: ${CONVERT_PAIRS.join(', ')})`;
    return message;
}

/** The `toMd` options whose refusal by `oconv` is the caller's mistake (`bad …` / `… needs format …`). */
const OPTION_MESSAGE =
    /^oconv: (bad (sheets|pdf infer|pdf declare|pdf include|odt include|docx include|form op budget|pdf recover xref|front matter|cell budget|archive limits|output budget|pdf line hyphens)|(sheets|sheet cell budget) needs format xlsx or ods|(pdf infer|pdf declare|pdf include|pdf password|pdf recover xref|pdf line hyphens|form op budget) needs format pdf|odt include needs format odt|docx include needs format docx|archive limits need an office source)$/;

function isUsageMessage(message: string): boolean {
    return /^oconv: unsupported (format|target|pair)$/.test(message) || OPTION_MESSAGE.test(message);
}

async function guard<T extends object>(fn: () => Promise<T>): Promise<CoreError | ({ error: null } & T)> {
    try {
        const result = await fn();
        return { error: null, ...result };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { error: appendSupportedHint(message), usage: isUsageMessage(message) };
    }
}

/** Facade shape resolved from `@awacloud/oconv`'s `modules`/`fw_require` — see the module doc's wiring pattern. */
interface OconvFacade {
    toMd(input: {
        name: string;
        bytes: Uint8Array;
        convertedAt: string;
        format?: string;
        includeNotes?: boolean;
        sheets?: string;
        formOpBudget?: number;
        pdfInfer?: string[];
        pdfDeclare?: string[];
        pdfInclude?: string[];
        pdfPassword?: string | Uint8Array;
        pdfRecoverXref?: boolean;
        pdfLineHyphens?: string;
        odtInclude?: string[];
        docxInclude?: string[];
        sheetCellBudget?: number;
        archiveLimits?: ArchiveLimits;
        outputBudget?: OutputBudget;
        opts?: { frontMatter?: string };
    }): Promise<{ markdown: string; losses: Loss[]; lossy: boolean; assets: Asset[] }>;
    fromMd(input: { markdown: string; name?: string; target?: string }): Promise<{
        bytes: Uint8Array;
        target: string;
        losses: Loss[];
        lossy: boolean;
    }>;
    convert(input: { bytes: Uint8Array; name?: string; format?: string; target: string }): Promise<{
        bytes: Uint8Array;
        format: string;
        target: string;
        losses: Loss[];
        lossy: boolean;
    }>;
}

/** Facade shape resolved from `@awacloud/md`'s `modules`/`fw_require`. */
interface MdFacade {
    renderHtml(
        markdown: string,
        opts?: { safe?: boolean; sanitize?: boolean; sanitizeOpts?: SanitizeOpts },
    ): string;
}

/** Sanitiser options `toHtml` passes — fw `sanitize`'s override shape (it REPLACES the default allowlist). */
interface SanitizeOpts {
    allowedTags: Set<string>;
    allowedAttributes: Record<string, Set<string>>;
}

/** The fw `sanitize` facade, resolved from `@awacloud/md`'s `fw_require` — only its default allowlist is read. */
interface SanitizeFacade {
    defaultAllowlist: { tags: Set<string>; attributes: Record<string, Set<string>> };
}

function buildOconv(): OconvFacade {
    const runtime = new ModuleRuntime();
    runtime.registerAll(toModuleDefinitions('@awacloud/oconv fw_require', oconvFwRequire));
    runtime.registerAll(toModuleDefinitions('@awacloud/oconv modules', oconvModules));
    return runtime.resolve('oconv') as OconvFacade;
}

/**
 * The fw sanitiser's default allowlist plus disabled task-list checkboxes
 * (`input` with `type`/`checked`/`disabled`) — the same allowlist as
 * `@awacloud/md`'s `html-document`. `safe: true` drops every raw-HTML `input`,
 * so the only inputs that reach the sanitiser are the renderer's own disabled
 * task-list checkboxes. Fresh copies, never a mutation of the default.
 */
function taskListAllowlist(s: SanitizeFacade): SanitizeOpts {
    return {
        allowedTags: new Set([...s.defaultAllowlist.tags, 'input']),
        allowedAttributes: { ...s.defaultAllowlist.attributes, input: new Set(['type', 'checked', 'disabled']) },
    };
}

function buildMd(): { md: MdFacade; sanitizeOpts: SanitizeOpts } {
    const runtime = new ModuleRuntime();
    runtime.registerAll(toModuleDefinitions('@awacloud/md fw_require', mdFwRequire));
    runtime.registerAll(toModuleDefinitions('@awacloud/md modules', mdModules));
    runtime.registerAll(toModuleDefinitions('@awacloud/md extras', mdExtras));
    return {
        md: runtime.resolve('md') as MdFacade,
        sanitizeOpts: taskListAllowlist(runtime.resolve('sanitize') as SanitizeFacade),
    };
}

export interface ToMdInput {
    /** Source file name — its extension drives format detection when `format` is omitted (`oconv`'s own rule). */
    name: string;
    bytes: Uint8Array;
    /** ISO-8601 timestamp — REQUIRED, never defaulted (`oconv`'s own contract; reproducibility is caller-owned). */
    convertedAt: string;
    /** `'docx'` | `'odt'` | `'xlsx'` | `'ods'` | `'pptx'` | `'odp'` | `'pdf'`. Explicit value wins over `name`'s extension. */
    format?: string;
    /** `pptx`/`odp` only, default `false` — forwarded verbatim to `oconv.toMd`. */
    includeNotes?: boolean;
    /**
     * `xlsx`/`ods` only: `'table'` (default, GFM tables), `'csv'` or `'tsv'` (each
     * sheet a fenced block) — forwarded verbatim to `oconv.toMd`; a bad value or
     * another format is a usage error.
     */
    sheets?: string;
    /** `pdf` only: the per-page Form XObject operator budget (a safe integer >= 1). */
    formOpBudget?: number;
    /** `pdf` only: inference on an untagged pdf — `'headings'`, `'tables'`. */
    pdfInfer?: string[];
    /** `pdf` only: record a silent case — `'positional'`. */
    pdfDeclare?: string[];
    /** `pdf` only: parts brought back — `'images'` (their bytes in `assets`). */
    pdfInclude?: string[];
    /** `pdf` only: the user or owner password of an encrypted pdf. */
    pdfPassword?: string | Uint8Array;
    /** `pdf` only: `true` rebuilds an unusable cross-reference chain. */
    pdfRecoverXref?: boolean;
    /** `pdf` only: a word a hyphen cuts at a line end joined — `'drop'` (without the hyphen) or `'keep'` (with it). */
    pdfLineHyphens?: string;
    /** `odt` only: parts brought back — `'toc'`. */
    odtInclude?: string[];
    /** `docx` only: parts brought back — `'toc'`. */
    docxInclude?: string[];
    /** `xlsx`/`ods` only: a sheet whose padded table would hold more cells is written unpadded (`sheet/sparse-form`). */
    sheetCellBudget?: number;
    /** Office formats only: the reader's archive limits (`0` disables a check). */
    archiveLimits?: ArchiveLimits;
    /** Every format: a bound on the document's text; `'truncate'` keeps what fits (`doc/truncated`). */
    outputBudget?: OutputBudget;
    /** Writer options: `frontMatter` — `'full'` (default), `'compact'` or `'none'`. */
    opts?: { frontMatter?: string };
}

/** `oconv.toMd`'s `archiveLimits`: any of the office readers' four archive limits. */
export interface ArchiveLimits {
    maxParts?: number;
    maxUncompressed?: number;
    maxRatio?: number;
    maxDepth?: number;
}

/** `oconv.toMd`'s `outputBudget`: `bytes` of text, then `'throw'` (default) or `'truncate'`. */
export interface OutputBudget {
    bytes: number;
    overflow?: 'throw' | 'truncate';
}

/** One entry of `oconv`'s asset manifest: an image the markdown references by `name`. */
export interface Asset {
    kind: string;
    name: string;
    /** Present when the reader captured the image bytes. */
    bytes?: Uint8Array;
}

export interface ToMdOutput {
    error: null;
    markdown: string;
    losses: Loss[];
    /** `losses` grouped by `code` + `detail`, with a count. */
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
    /** The asset manifest, document order; `assetFiles` says which can be written. */
    assets: Asset[];
}

export type ToMdResult = CoreError | ToMdOutput;

/**
 * Any supported input format to structured Markdown — `oconv.toMd`.
 * `convertedAt` is checked against the shared RFC 3339 `date-time` rule
 * (`./timestamp.ts`) BEFORE `buildOconv()` runs, so a bad value never
 * reaches `@awacloud/oconv` — this keeps the library contract.
 */
export async function toMd(input: ToMdInput): Promise<ToMdResult> {
    const atError = timestampError(input.convertedAt);
    if (atError !== null) return { error: atError, usage: true };

    return guard(async () => {
        const oconv = buildOconv();
        const result = await oconv.toMd(input);
        return {
            markdown: result.markdown, losses: result.losses, lossSummary: summarizeLosses(result.losses), lossy: result.lossy,
            assets: result.assets,
        };
    });
}

/** An asset `assetFiles` will not write, and why. */
export interface SkippedAsset {
    name: string;
    reason: 'no bytes' | 'unsafe name';
}

/**
 * The assets a shell may write under a directory of its choice, at the
 * relative path the markdown references (`name`). A name is safe when it
 * is relative and stays inside that directory: `/`- or `\`-separated
 * segments, none empty, `.` or `..`, and no `:` (a Windows drive or
 * stream). An asset without bytes or with another name is skipped. Pure:
 * the CLI and MCP shells do the writing.
 */
export function assetFiles(assets: Asset[]): { files: { name: string; bytes: Uint8Array }[]; skipped: SkippedAsset[] } {
    const files: { name: string; bytes: Uint8Array }[] = [];
    const skipped: SkippedAsset[] = [];
    for (const a of assets) {
        const segments = a.name.split(/[\\/]/);
        if (a.name.includes(':') || segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
            skipped.push({ name: a.name, reason: 'unsafe name' });
        } else if (a.bytes === undefined) {
            skipped.push({ name: a.name, reason: 'no bytes' });
        } else {
            files.push({ name: a.name, bytes: a.bytes });
        }
    }
    return { files, skipped };
}

export interface FromMdInput {
    markdown: string;
    /** Output file name — its extension drives target detection when `target` is omitted. */
    name?: string;
    /** `'docx'` | `'odt'` | `'pdf'`. Explicit value wins over `name`'s extension. */
    target?: string;
}

export interface FromMdOutput {
    error: null;
    bytes: Uint8Array;
    target: string;
    losses: Loss[];
    /** `losses` grouped by `code` + `detail`, with a count. */
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
}

export type FromMdResult = CoreError | FromMdOutput;

/** Markdown to a target format — `oconv.fromMd`. */
export async function fromMd(input: FromMdInput): Promise<FromMdResult> {
    return guard(async () => {
        const oconv = buildOconv();
        const result = await oconv.fromMd(input);
        return {
            bytes: result.bytes, target: result.target,
            losses: result.losses, lossSummary: summarizeLosses(result.losses), lossy: result.lossy,
        };
    });
}

export interface ConvertInput {
    bytes: Uint8Array;
    /** Source file name — its extension drives `format` detection when `format` is omitted. */
    name?: string;
    /** `'docx'` | `'odt'` (explicit wins over `name`). */
    format?: string;
    /** `'docx'` | `'odt'` | `'pdf'` — REQUIRED, never derived (`name` names the SOURCE). */
    target: string;
}

export interface ConvertOutput {
    error: null;
    bytes: Uint8Array;
    format: string;
    target: string;
    losses: Loss[];
    /** `losses` grouped by `code` + `detail`, with a count. */
    lossSummary: LossSummaryEntry[];
    lossy: boolean;
}

export type ConvertResult = CoreError | ConvertOutput;

/** Cross-format pair, one of the four `oconv` ships (`docx>odt`, `odt>docx`, `docx>pdf`, `odt>pdf`) — `oconv.convert`. */
export async function convert(input: ConvertInput): Promise<ConvertResult> {
    return guard(async () => {
        const oconv = buildOconv();
        const result = await oconv.convert(input);
        return {
            bytes: result.bytes, format: result.format, target: result.target,
            losses: result.losses, lossSummary: summarizeLosses(result.losses), lossy: result.lossy,
        };
    });
}

export interface ToHtmlInput {
    markdown: string;
}

export interface ToHtmlOutput {
    error: null;
    html: string;
}

export type ToHtmlResult = CoreError | ToHtmlOutput;

/**
 * Markdown to HTML through `@awacloud/md`'s `md` facade (`.renderHtml`,
 * itself built on the published `renderHtmlMod` descriptor — see
 * `packages/front/office/md/src/md.js`'s `renderHtmlFn`) — a plain HTML
 * fragment, with no embedded CSS and no table of contents.
 *
 * The render is safe and sanitised, and both options are passed explicitly
 * rather than inherited from md's defaults: `safe: true` drops raw HTML (a raw
 * block with its content; inline tags, keeping their text) and empties any
 * `javascript:`, `vbscript:`, `file:` or `data:` URL (images included);
 * `sanitize: true` runs the fw sanitiser with its default allowlist plus
 * disabled task-list checkboxes (`input` with `type`/`checked`/`disabled`).
 * Fenced code, Mermaid included, stays escaped text. The result has no
 * `losses` field because the renderer does not itemise what it drops.
 */
export async function toHtml(input: ToHtmlInput): Promise<ToHtmlResult> {
    return guard(async () => {
        const { md, sanitizeOpts } = buildMd();
        const html = md.renderHtml(input.markdown, { safe: true, sanitize: true, sanitizeOpts });
        return { html };
    });
}

export { isCoreError };
