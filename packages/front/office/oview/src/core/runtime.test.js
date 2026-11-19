// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview The copy's coupling to oconv's internals, locked. "Copy with
 * formatting" composes oconv's read chain by module NAME instead of its
 * `toMd` facade (BL-2859, pilot answer OP-L14A), so a rename or a reshape
 * inside oconv must fail here, loudly, rather than in a user's paste.
 */
import '../../tests/setup-dom.js';   // FIRST — registers window/document
import { describe, test, expect } from 'bun:test';
import * as oconv from '@awacloud/oconv';
import { createViewerRuntime, OCONV_CHAIN, OCONV_MODULES } from './runtime.js';
import { fixture } from '../../tests/context.js';

describe('oview runtime — the oconv read chain', () => {
    test('every module the copy names is in oconv\'s module array', () => {
        const names = new Set(oconv.modules.map((m) => m.name));
        const missing = OCONV_MODULES.filter((n) => !names.has(n));
        expect(missing).toEqual([]);
    });

    test('every format resolves its reader, its IR reader and the method it calls', async () => {
        const rt = createViewerRuntime();
        await rt.engine('oconv');
        for (const [format, [reader, toIr, method]] of Object.entries(OCONV_CHAIN)) {
            expect({ format, read: typeof rt.resolve(reader).read }).toEqual({ format, read: 'function' });
            expect({ format, [method]: typeof rt.resolve(toIr)[method] }).toEqual({ format, [method]: 'function' });
        }
        expect(typeof rt.resolve('oconvIrToMd').irToMd).toBe('function');
    });

    test('the chain covers every format oconv\'s toMd reads, and only those', () => {
        expect(Object.keys(OCONV_CHAIN).sort()).toEqual(['docx', 'odp', 'ods', 'odt', 'pdf', 'pptx', 'xlsx']);
    });

    test('the chain gives toMd\'s markdown body and assets for a real document', async () => {
        const bytes = fixture('rich.docx');
        const rt = createViewerRuntime();
        const { oconv: chain } = await rt.engine('oconv');
        const at = '2030-01-02T03:04:05.000Z';
        const ours = await chain.toMd({ name: 'rich.docx', bytes, format: 'docx', convertedAt: at });
        // The facade itself, on its own runtime (bun applies no sanity).
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const ref = new ModuleRuntime();
        ref.registerAll(oconv.fw_require);
        ref.registerAll(oconv.modules);
        const theirs = await ref.resolve('oconv').toMd({ name: 'rich.docx', bytes, format: 'docx', convertedAt: at });
        const body = (/** @type {string} */ md) => md.slice(md.indexOf('\n---', 3) + 4);
        expect(body(ours.markdown)).toMatch(/^#{1,6} /m);
        expect(body(ours.markdown)).toBe(body(theirs.markdown));
        expect(ours.assets.map((a) => a.name)).toEqual(theirs.assets.map((a) => a.name));
    });

    // T30 (a2), D51: the copy calls pdfToIr with no option, so it infers as
    // toMd does: its body of a pdf equals toMd's.
    test('the chain gives toMd\'s markdown body for a pdf too (T30 a2)', async () => {
        const bytes = fixture('images.pdf');
        const rt = createViewerRuntime();
        const { oconv: chain } = await rt.engine('oconv');
        const at = '2030-01-02T03:04:05.000Z';
        const ours = await chain.toMd({ name: 'images.pdf', bytes, format: 'pdf', convertedAt: at });
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const ref = new ModuleRuntime();
        ref.registerAll(oconv.fw_require);
        ref.registerAll(oconv.modules);
        const theirs = await ref.resolve('oconv').toMd({ name: 'images.pdf', bytes, format: 'pdf', convertedAt: at });
        const body = (/** @type {string} */ md) => md.slice(md.indexOf('\n---', 3) + 4);
        expect(body(ours.markdown)).toBe(body(theirs.markdown));
    });

    // T30 (e), D47: the copy renders through irToMd with no option, so it
    // takes its 256 MiB output budget: D11's shape (one 1 MiB string shared
    // by 300 cells, 300 MiB of text from a 4 KB file) is refused by name
    // instead of running the tab out of memory.
    test('a document past 256 MiB of text is refused by name, not rendered', async () => {
        const rt = createViewerRuntime();
        const { oconv: chain } = await rt.engine('oconv');
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const ref = new ModuleRuntime();
        ref.registerAll(oconv.fw_require);
        ref.registerAll(oconv.modules);
        // Letters at random: a run of one letter trips the archive's ratio guard first.
        const big = (() => { let n = 7; let s = ''; for (let i = 0; i < 1 << 20; i++) { n = (Math.imul(n, 1103515245) + 12345) >>> 0; s += String.fromCharCode(97 + (n >>> 27) % 26); } return s; })();
        const bytes = ref.resolve('xlsx').write({ sheets: [{ name: 'S', rows: Array.from({ length: 100 }, () => [big, big, big]) }] });
        await expect(chain.toMd({ name: 'shared.xlsx', bytes, format: 'xlsx', convertedAt: '2030-01-02T03:04:05.000Z' }))
            .rejects.toThrow('oconv: output too large');
    });

    // T30 (d), D46: the copy calls the sheet readers with no option, so it
    // takes their 5,000,000 cell budget: a sheet that would pad to 6.5 M
    // cells is copied in the sparse form, not padded in the browser tab.
    test('a sheet past 5 M padded cells copies in the sparse form', async () => {
        const rt = createViewerRuntime();
        const { oconv: chain } = await rt.engine('oconv');
        const { ModuleRuntime } = await import('@awacloud/fw/core/runtime.js');
        const ref = new ModuleRuntime();
        ref.registerAll(oconv.fw_require);
        ref.registerAll(oconv.modules);
        const last = new Array(16384).fill(null);
        last[16383] = 'z';
        const bytes = ref.resolve('xlsx').write({ sheets: [{ name: 'Wide', rows: [['a'], ...Array.from({ length: 398 }, () => []), last] }] });
        const r = await chain.toMd({ name: 'wide.xlsx', bytes, format: 'xlsx', convertedAt: '2030-01-02T03:04:05.000Z' });
        expect(r.markdown).toContain('A1: a\n\nXFD400: z');
        expect(r.losses.map((l) => l.code)).toContain('sheet/sparse-form');
    });
});
