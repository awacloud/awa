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

function isUsageMessage(message: string): boolean {
    return /^oconv: unsupported (format|target|pair)$/.test(message);
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
    }): Promise<{ markdown: string; losses: Loss[]; lossy: boolean }>;
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
}

export interface ToMdOutput {
    error: null;
    markdown: string;
    losses: Loss[];
    lossy: boolean;
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
        return { markdown: result.markdown, losses: result.losses, lossy: result.lossy };
    });
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
    lossy: boolean;
}

export type FromMdResult = CoreError | FromMdOutput;

/** Markdown to a target format — `oconv.fromMd`. */
export async function fromMd(input: FromMdInput): Promise<FromMdResult> {
    return guard(async () => {
        const oconv = buildOconv();
        const result = await oconv.fromMd(input);
        return { bytes: result.bytes, target: result.target, losses: result.losses, lossy: result.lossy };
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
    lossy: boolean;
}

export type ConvertResult = CoreError | ConvertOutput;

/** Cross-format pair, one of the four `oconv` ships (`docx>odt`, `odt>docx`, `docx>pdf`, `odt>pdf`) — `oconv.convert`. */
export async function convert(input: ConvertInput): Promise<ConvertResult> {
    return guard(async () => {
        const oconv = buildOconv();
        const result = await oconv.convert(input);
        return { bytes: result.bytes, format: result.format, target: result.target, losses: result.losses, lossy: result.lossy };
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
