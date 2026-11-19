// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * PDF/UA through the core and the MCP server: `pdfUA` with a language
 * (`pdfLang`) and the caller's faces (`pdfFonts`) writes a tagged document
 * claiming PDF/UA-1 or PDF/UA-2 with every font embedded; `pdfUA` without
 * faces or a language, a language without `pdfUA`, or another part is
 * refused.
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
const MD = '# PDF/UA\n\nSome *emphasis*, **strong** and `code`.\n\n- one\n- two\n';
const latin1 = new TextDecoder('latin1');

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** A directory holding the five class files from the vendored Liberation faces. */
function facesDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-pdfua-'));
    dirs.push(dir);
    for (const [cls, file] of [['regular', 'LiberationSans-Regular'], ['bold', 'LiberationSans-Bold'], ['italic', 'LiberationSans-Italic'],
        ['boldItalic', 'LiberationSans-BoldItalic'], ['mono', 'LiberationMono-Regular']]) {
        copyFileSync(join(LIBERATION, `${file}.ttf`), join(dir, `${cls}.ttf`));
    }
    return dir;
}

/** What a PDF/UA claim leaves in the bytes. */
function claimOf(bytes: Uint8Array) {
    const text = latin1.decode(bytes);
    return {
        header: text.slice(0, 8),
        part: (text.match(/<pdfuaid:part>(\d)<\/pdfuaid:part>/) ?? [])[1] ?? null,
        tagged: text.includes('/StructTreeRoot'),
        lang: (text.match(/\/Lang \(([^)]*)\)/) ?? [])[1] ?? null,
    };
}

function fonts(dir: string) {
    const r = readPdfFonts(dir);
    if (r.error !== null) throw new Error(r.error);
    return r.fonts;
}

describe('core pdfUA', () => {
    test('fromMd and convert claim the part, tagged, in the language given', async () => {
        const pdfFonts = fonts(facesDir());
        const md = await fromMd({ markdown: MD, target: 'pdf', pdfUA: 2, pdfLang: 'en-GB', pdfFonts });
        if (isCoreError(md)) throw new Error(md.error);
        expect(claimOf(md.bytes)).toEqual({ header: '%PDF-2.0', part: '2', tagged: true, lang: 'en-GB' });
        const docx = await convert({ name: 'x.docx', bytes: new Uint8Array(SAMPLE_DOCX), target: 'pdf', pdfUA: 1, pdfLang: 'fr', pdfFonts });
        if (isCoreError(docx)) throw new Error(docx.error);
        expect(claimOf(docx.bytes)).toEqual({ header: '%PDF-1.7', part: '1', tagged: true, lang: 'fr' });
    });

    test('pdfUA without pdfLang, pdfLang alone, or another part is a usage error; without pdfFonts it takes the packaged faces', async () => {
        const pdfFonts = fonts(facesDir());
        const cases: [Parameters<typeof fromMd>[0], string][] = [
            [{ markdown: MD, target: 'pdf', pdfUA: 1, pdfFonts }, 'pdfLang'],
            [{ markdown: MD, target: 'pdf', pdfLang: 'en', pdfFonts }, 'pdfUA'],
            [{ markdown: MD, target: 'pdf', pdfUA: 3, pdfLang: 'en', pdfFonts }, 'pdfUA'],
        ];
        for (const [input, named] of cases) {
            const r = await fromMd(input);
            expect(isCoreError(r) && r.usage).toBe(true);
            expect((r as { error: string }).error).toContain(named);
        }
        const packaged = await fromMd({ markdown: MD, target: 'pdf', pdfUA: 1, pdfLang: 'en' });
        if (isCoreError(packaged)) throw new Error(packaged.error);
        expect(claimOf(packaged.bytes)).toMatchObject({ part: '1', tagged: true, lang: 'en' });
    });
});

describe('MCP pdfUA', () => {
    test('from_md and convert take pdfUA and pdfLang; pdfUA alone is refused', async () => {
        const dir = facesDir();
        const ok = await callTool('from_md', { markdown: MD, target: 'pdf', pdfUA: 1, pdfLang: 'en', pdfFonts: dir });
        expect(ok.isError).toBe(false);
        const payload = JSON.parse(ok.content[0]!.text);
        expect(claimOf(new Uint8Array(Buffer.from(payload.bytesBase64, 'base64'))).part).toBe('1');
        const conv = await callTool('convert', { bytesBase64: SAMPLE_DOCX.toString('base64'), name: 'x.docx', target: 'pdf', pdfUA: 2, pdfLang: 'en', pdfFonts: dir });
        expect(conv.isError).toBe(false);
        const refused = await callTool('from_md', { markdown: MD, target: 'pdf', pdfUA: 1, pdfFonts: dir });
        expect(refused.isError).toBe(true);
        expect(JSON.parse(refused.content[0]!.text).error).toContain('pdfLang');
    });
});
