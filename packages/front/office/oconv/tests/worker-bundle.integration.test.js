// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Integration test — the bundled worker (office-coverage-3
 * T65, D40): `src/worker.js` is a self-contained build of
 * `src/worker/entry.js`, so a static page starts it with no import map.
 *
 * - it imports nothing (no static or dynamic import, no `import.meta`);
 * - it is up to date: a fresh `buildWorker()` equals it byte for byte;
 * - copied to a directory outside the workspace (where no `@awacloud/*`
 *   specifier could resolve), it answers the three message kinds.
 */
/* global Bun */
import { describe, test, expect } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorker, OUT } from '../tools/generate-worker.mjs';

const bundle = readFileSync(OUT, 'utf8');
// The entry's own licence header: the bundle opens with the same four lines.
const entryHeader = readFileSync(new URL('../src/worker/entry.js', import.meta.url), 'utf8').split('\n').slice(0, 4);

describe('the bundled worker (T65)', () => {
    test('opens with the licence header and the generated line', () => {
        expect(entryHeader.every((l) => l.startsWith('// ') && l.length > 10)).toBe(true);
        expect(bundle.split('\n').slice(0, 4)).toEqual(entryHeader);
        expect(bundle.split('\n')[4]).toContain('do not edit; source src/worker/entry.js');
    });

    test('imports nothing: no static import, no import(), no import.meta', () => {
        const code = bundle.split('\n').slice(5).join('\n');
        expect(code).not.toMatch(/(^|[;}\s])import\s*[{*\w"']/);
        expect(code).not.toMatch(/\bimport\s*\(/);
        expect(code).not.toContain('import.meta');
        expect(code).not.toMatch(/from\s*["']@awacloud\//);
    });

    test('is up to date: a fresh build of src/worker/entry.js equals it', async () => {
        expect(await buildWorker() === bundle).toBe(true);
    }, 120000);

    test('copied outside the workspace, it answers toMd, fromMd and convert', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'oconv-worker-'));
        try {
            const file = join(dir, 'worker.js');
            copyFileSync(OUT, file);
            const w = new Worker(file, { type: 'module' });
            const ask = (msg, transfer) => new Promise((resolve) => {
                w.onmessage = (e) => resolve(e.data);
                w.onerror = (e) => resolve({ error: String(e.message ?? e) });
                w.postMessage(msg, transfer || []);
            });
            const docx = await ask({ id: 1, markdown: '# Hello\n\nA paragraph.', target: 'docx' });
            expect([docx.id, docx.error, docx.bytes instanceof Uint8Array && docx.bytes.length > 0]).toEqual([1, null, true]);
            const bytes = docx.bytes.slice().buffer;
            const md = await ask({ id: 2, name: 'hello.docx', bytes, at: '2026-11-10T00:00:00Z' }, [bytes]);
            expect([md.id, md.error]).toEqual([2, null]);
            expect(md.markdown).toContain('Hello');
            const again = docx.bytes.slice().buffer;
            const odt = await ask({ id: 3, name: 'hello.docx', bytes: again, target: 'odt' }, [again]);
            expect([odt.id, odt.error, odt.bytes instanceof Uint8Array && odt.bytes.length > 0]).toEqual([3, null, true]);
            w.terminate();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }, 120000);
});
