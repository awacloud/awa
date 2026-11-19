// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * PDF/A through the core and the MCP server: `pdfA` with the caller's faces
 * (`pdfFonts`, read from a directory by `readPdfFonts`) writes a document
 * claiming PDF/A-4 or PDF/A-2b with every font embedded; `pdfA` without
 * faces takes the Liberation faces of the optional `@awacloud/oconv-fonts`.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { convert, fromMd, isCoreError } from './core.ts';
import { readPdfFonts } from './pdf-fonts.ts';
import { callTool } from './mcp.ts';

const LIBERATION = join(import.meta.dir, '..', '..', '..', 'packages', 'front', 'office', 'oconv-fonts', 'vendor', 'liberation');
const SAMPLE_DOCX = readFileSync(join(import.meta.dir, '..', 'tests', 'fixtures', 'sample.docx'));
const MD = '# PDF/A\n\nSome *emphasis*, **strong** and `code`.\n';
const latin1 = new TextDecoder('latin1');

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** A directory holding the five class files from the vendored Liberation faces. */
function facesDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-pdfa-'));
    dirs.push(dir);
    for (const [cls, file] of [['regular', 'LiberationSans-Regular'], ['bold', 'LiberationSans-Bold'], ['italic', 'LiberationSans-Italic'],
        ['boldItalic', 'LiberationSans-BoldItalic'], ['mono', 'LiberationMono-Regular']]) {
        copyFileSync(join(LIBERATION, `${file}.ttf`), join(dir, `${cls}.ttf`));
    }
    return dir;
}

/** What a PDF/A claim leaves in the bytes. */
function claimOf(bytes: Uint8Array) {
    const text = latin1.decode(bytes);
    return {
        header: text.slice(0, 8),
        part: (text.match(/<pdfaid:part>(\d)<\/pdfaid:part>/) ?? [])[1] ?? null,
        programs: (text.match(/\/FontFile2\b/g) ?? []).length,
        standard14: /\/BaseFont \/(Helvetica|Times|Courier)/.test(text),
    };
}

function fonts(dir: string) {
    const r = readPdfFonts(dir);
    if (r.error !== null) throw new Error(r.error);
    return r.fonts;
}

describe('readPdfFonts', () => {
    test('reads the class files present; none, or no directory, is a usage error', () => {
        const dir = facesDir();
        expect(Object.keys(fonts(dir)).sort()).toEqual(['bold', 'boldItalic', 'italic', 'mono', 'regular']);
        const empty = mkdtempSync(join(tmpdir(), 'convert-pdfa-empty-'));
        dirs.push(empty);
        for (const bad of [empty, join(empty, 'absent')]) {
            const r = readPdfFonts(bad);
            expect(r.error).toContain('pdfFonts');
            expect(isCoreError(r as { error: string | null }) && (r as { usage: boolean }).usage).toBe(true);
        }
    });
});

describe('core pdfA', () => {
    test('fromMd and convert claim the profile with every font embedded', async () => {
        const pdfFonts = fonts(facesDir());
        const md = await fromMd({ markdown: MD, target: 'pdf', pdfA: '4', pdfFonts });
        if (isCoreError(md)) throw new Error(md.error);
        expect(claimOf(md.bytes)).toMatchObject({ header: '%PDF-2.0', part: '4', standard14: false });
        expect(claimOf(md.bytes).programs).toBeGreaterThan(0);
        const docx = await convert({ name: 'x.docx', bytes: new Uint8Array(SAMPLE_DOCX), target: 'pdf', pdfA: '2b', pdfFonts });
        if (isCoreError(docx)) throw new Error(docx.error);
        expect(claimOf(docx.bytes)).toMatchObject({ header: '%PDF-1.7', part: '2', standard14: false });
    });

    test('pdfA without pdfFonts embeds the packaged Liberation faces; pdfFonts alone embeds without a claim', async () => {
        const packaged = await fromMd({ markdown: MD, target: 'pdf', pdfA: '4' });
        if (isCoreError(packaged)) throw new Error(packaged.error);
        expect(claimOf(packaged.bytes)).toMatchObject({ header: '%PDF-2.0', part: '4', standard14: false });
        expect(claimOf(packaged.bytes).programs).toBeGreaterThan(0);
        const plain = await fromMd({ markdown: MD, target: 'pdf', pdfFonts: fonts(facesDir()) });
        if (isCoreError(plain)) throw new Error(plain.error);
        expect(claimOf(plain.bytes)).toMatchObject({ part: null, standard14: false });
    });
});

describe('MCP pdfA', () => {
    test('from_md and convert take pdfA and a pdfFonts directory; pdfA alone embeds the packaged faces', async () => {
        const dir = facesDir();
        const ok = await callTool('from_md', { markdown: MD, target: 'pdf', pdfA: '4', pdfFonts: dir });
        expect(ok.isError).toBe(false);
        const payload = JSON.parse(ok.content[0]!.text);
        expect(claimOf(new Uint8Array(Buffer.from(payload.bytesBase64, 'base64'))).part).toBe('4');
        const conv = await callTool('convert', { bytesBase64: SAMPLE_DOCX.toString('base64'), name: 'x.docx', target: 'pdf', pdfA: '2b', pdfFonts: dir });
        expect(conv.isError).toBe(false);
        const alone = await callTool('from_md', { markdown: MD, target: 'pdf', pdfA: '4' });
        expect(alone.isError).toBe(false);
        const aloneBytes = JSON.parse(alone.content[0]!.text).bytesBase64;
        expect(claimOf(new Uint8Array(Buffer.from(aloneBytes, 'base64'))).part).toBe('4');
    });
});
