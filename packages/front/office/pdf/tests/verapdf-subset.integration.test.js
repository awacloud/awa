// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The vendored veraPDF subset (`_fixtures/verapdf/`): third-party
 * PDF/A, PDF/UA and ISO 32000 test files read through the base reader.
 *
 * Two layers:
 *   1. Integrity — every `MANIFEST.json` entry is on disk with its byte count
 *      and SHA-256, and no unlisted file sits beside them.
 *   2. Reading — every file reads (at least one page) and round-trips through
 *      `write` with its page count. The corpus file names carry PDF/A and
 *      PDF/UA verdicts (`-pass-` / `-fail-`); the reader does not judge them,
 *      so every file counts. The one expected refusal is the encrypted file:
 *      `read` composes no decrypt path and fails loud by design.
 *
 * Only committed bytes are read; the full corpus is never needed here.
 *
 * @module pdf/tests/verapdf-subset.integration
 */

import { describe, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { fw_require, modules } from '../src/main.js';

const DIR = fileURLToPath(new URL('_fixtures/verapdf/', import.meta.url));
const FILES = join(DIR, 'files');
const manifest = JSON.parse(readFileSync(join(DIR, 'MANIFEST.json'), 'utf8'));
const ENCRYPTED = 'PDF_UA-1/7.16 Security/7.16-t01-fail-a.pdf';

const rt = new ModuleRuntime();
for (const m of fw_require) rt.register(m);
for (const m of modules) rt.register(m);
const api = rt.resolve('pdf');

const bytesOf = (rel) => new Uint8Array(readFileSync(join(FILES, ...rel.split('/'))));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Every file under `dir`, as sorted POSIX paths relative to `dir`. */
function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(relative(FILES, p).replace(/\\/g, '/'));
    }
    return out;
}

/**
 * The integrity verdict of a file set against the manifest entries: one
 * line per difference (missing, size, hash, unlisted).
 *
 * @param {{ path: string, bytes: number, sha256: string }[]} entries
 * @param {string[]} onDisk  sorted relative paths found under `files/`
 * @param {(rel: string) => Uint8Array} read
 * @returns {string[]}
 */
function integrity(entries, onDisk, read) {
    const out = [];
    const listed = new Set(entries.map((e) => e.path));
    for (const e of entries) {
        if (!onDisk.includes(e.path)) {
            out.push(`missing: ${e.path}`);
            continue;
        }
        const b = read(e.path);
        if (b.length !== e.bytes) out.push(`size: ${e.path}`);
        else if (sha256(b) !== e.sha256) out.push(`sha256: ${e.path}`);
    }
    for (const p of onDisk) if (!listed.has(p)) out.push(`unlisted: ${p}`);
    return out;
}

describe('veraPDF subset — manifest and integrity', () => {
    test('the manifest names the pinned tag, the CC BY 4.0 licence and the 32 KiB rule', () => {
        expect(manifest.ref).toBe('v1.28.1');
        expect(manifest.licence).toBe('CC-BY-4.0');
        expect(manifest.maxBytes).toBe(32 * 1024);
        expect(manifest.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(manifest.files.length).toBe(671);
        expect(manifest.files.every((f) => f.bytes <= manifest.maxBytes)).toBe(true);
        expect(manifest.files.map((f) => f.path)).toEqual([...manifest.files.map((f) => f.path)].sort());
    });

    test('every file is on disk with its byte count and SHA-256; nothing unlisted', () => {
        expect(existsSync(FILES)).toBe(true);
        expect(integrity(manifest.files, walk(FILES).sort(), bytesOf)).toEqual([]);
    });

    test('negative controls: a flipped byte and an unlisted file are reported', () => {
        const first = manifest.files[0];
        const flipped = (rel) => {
            const b = bytesOf(rel);
            if (rel === first.path) b[b.length - 1] ^= 0xff;
            return b;
        };
        expect(integrity([first], [first.path], flipped)).toEqual([`sha256: ${first.path}`]);
        expect(integrity([first], [first.path, 'x/extra.pdf'], bytesOf)).toEqual(['unlisted: x/extra.pdf']);
        expect(integrity([first], [], bytesOf)).toEqual([`missing: ${first.path}`]);
    });
});

describe('veraPDF subset — read and round-trip through the base reader', () => {
    const outcomes = manifest.files.map((f) => {
        try {
            const doc = api.read(bytesOf(f.path));
            if (doc.pages.length < 1) return { path: f.path, read: '0 pages' };
            const back = api.read(api.write(doc));
            return { path: f.path, read: 'ok', roundtrip: back.pages.length === doc.pages.length ? 'ok' : 'page count' };
        } catch (e) {
            return { path: f.path, read: e.code ?? String(e.message) };
        }
    });

    test('every file reads and round-trips except the encrypted one', () => {
        const misses = outcomes.filter((o) => o.read !== 'ok' || o.roundtrip !== 'ok');
        expect(misses).toEqual([{ path: ENCRYPTED, read: 'pdf/document/encrypted' }]);
    });

    test('the encrypted file is refused by default, and its compressed page tree is refused on opt-in', () => {
        expect(() => api.read(bytesOf(ENCRYPTED))).toThrow(expect.objectContaining({ code: 'pdf/document/encrypted' }));
        // The raw container (`allowEncrypted`) cannot reach objects held in an
        // object stream of an encrypted file: its page tree lives in one.
        expect(() => api.read(bytesOf(ENCRYPTED), { allowEncrypted: true }))
            .toThrow(expect.objectContaining({ code: 'pdf/document/objstm-encrypted' }));
    });

    test('every corpus section of the tag is represented', () => {
        const sections = new Set(manifest.files.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : '(root)')));
        expect([...sections].sort()).toEqual([
            '(root)', 'ISO 32000-1', 'ISO 32000-2', 'PDF_A-1b', 'PDF_A-2b', 'PDF_A-3b', 'PDF_A-4', 'PDF_A-4e',
            'PDF_A-4f', 'PDF_UA-1', 'PDF_UA-2', 'TWG test files', 'Undefined',
        ]);
    });
});
