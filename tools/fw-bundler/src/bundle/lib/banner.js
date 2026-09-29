// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-bundler/src/bundle/lib/banner.js
/**
 * @fileoverview Opt-in legal-comment banner for the `bundle` subcommand.
 *
 * Why a POST-step: a minifier decides which comments survive, and the
 * decision differs per backend and per option set. Prepending the banner to
 * the FINAL bytes, after `Bun.build` (or the esbuild/rollup backend) has
 * written them, means no minifier setting can strip it.
 *
 * The banner is generic — this tool knows nothing about any licence. The
 * caller supplies plain text lines (`--banner-file <path>` on the CLI,
 * `opts.banner` programmatically); this module dresses them as ONE legal
 * comment (`/*!` … `*\/`) and writes it at byte 0 of every emitted JS bundle.
 *
 * Deterministic by construction: the rendered banner is a pure function of
 * the supplied text (EOLs normalised to LF, trailing whitespace and leading /
 * trailing blank lines dropped) — no timestamp, no path, no environment.
 *
 * Omitted ⇒ nothing in this module runs: the caller only calls it when a
 * banner was requested, so a run without one is byte-identical to a run of a
 * build that never had the option.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

/**
 * Dress plain banner text as a legal comment block, terminated by one LF.
 *
 * @param {string} text  Plain text, one banner line per line (any EOL).
 * @returns {string}     `/*!\n * <line>\n … *\/\n`
 * @throws {Error} when the text is empty after normalisation, or contains a
 *   comment terminator (which would close the comment early and inject code).
 */
export function renderBanner(text) {
    if (typeof text !== 'string') throw new Error('banner: text must be a string');
    const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/).map((l) => l.replace(/\s+$/, ''));
    while (lines.length > 0 && lines[0] === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 0) throw new Error('banner: text is empty');
    if (lines.some((l) => l.includes('*/'))) {
        throw new Error('banner: text must not contain "*/" (it would terminate the legal comment)');
    }
    return ['/*!', ...lines.map((l) => (l === '' ? ' *' : ` * ${l}`)), ' */', ''].join('\n');
}

/**
 * Read a banner text file and render it.
 * @param {string} path
 * @returns {string}
 */
export function loadBannerFile(path) {
    let text;
    try { text = readFileSync(path, 'utf8'); }
    catch (err) { throw new Error(`banner: cannot read --banner-file ${path}: ${err.message}`, { cause: err }); }
    return renderBanner(text);
}

/**
 * Size / hash / gzip-size of a buffer, measured the way the active backend
 * measures its own outputs (`Bun.gzipSync` for bun, `node:zlib` otherwise), so
 * a bannered meta reads like any other.
 *
 * @param {Buffer} buf
 * @param {string} backend  `activeBackendName()`
 * @returns {{ bytes: number, hashSha256: string, gzBytes: number }}
 */
export function measure(buf, backend) {
    const gz = backend === 'bun' && typeof Bun !== 'undefined' ? Bun.gzipSync(buf) : gzipSync(buf);
    return {
        bytes: buf.byteLength,
        hashSha256: createHash('sha256').update(buf).digest('hex'),
        gzBytes: gz.byteLength,
    };
}

/**
 * Write `banner` at byte 0 of `file`, then measure the FINAL bytes.
 *
 * Idempotent: a file that already starts with exactly this banner is left
 * untouched, so re-applying never stacks a second copy.
 *
 * @param {string} file     Emitted bundle path.
 * @param {string} banner   Output of {@link renderBanner}.
 * @param {string} backend  `activeBackendName()`
 * @returns {{ bytes: number, hashSha256: string, gzBytes: number }}
 */
export function applyBanner(file, banner, backend) {
    const body = readFileSync(file);
    const head = Buffer.from(banner, 'utf8');
    const already = body.byteLength >= head.byteLength && body.subarray(0, head.byteLength).equals(head);
    const final = already ? body : Buffer.concat([head, body]);
    if (!already) writeFileSync(file, final);
    return measure(final, backend);
}
