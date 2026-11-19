// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * The CLI's `--pdf-a` and `--pdf-fonts` on `from-md` and `convert`: a
 * document claiming PDF/A written with the caller's faces, or the optional
 * package's when `--pdf-fonts` is absent; either flag on another verb is a
 * usage error.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..', '..');
const CLI_ENTRY = join(ROOT, 'tools', 'convert', 'src', 'index.ts');
const SAMPLE_DOCX = join(import.meta.dir, 'fixtures', 'sample.docx');
const LIBERATION = join(ROOT, 'packages', 'front', 'office', 'oconv-fonts', 'vendor', 'liberation');
const latin1 = new TextDecoder('latin1');

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'convert-pdfa-cli-'));
    dirs.push(dir);
    return dir;
}

function facesDir(): string {
    const dir = scratch();
    for (const [cls, file] of [['regular', 'LiberationSans-Regular'], ['bold', 'LiberationSans-Bold'], ['italic', 'LiberationSans-Italic'],
        ['boldItalic', 'LiberationSans-BoldItalic'], ['mono', 'LiberationMono-Regular']]) {
        copyFileSync(join(LIBERATION, `${file}.ttf`), join(dir, `${cls}.ttf`));
    }
    return dir;
}

function cli(args: string[]) {
    const r = spawnSync('bun', [CLI_ENTRY, ...args]);
    return { code: r.status ?? -1, stderr: (r.stderr ?? Buffer.alloc(0)).toString('utf8') };
}

describe('convert CLI --pdf-a', () => {
    test('from-md and convert write a PDF/A claim with the faces of --pdf-fonts', () => {
        const dir = scratch();
        const md = join(dir, 'in.md');
        writeFileSync(md, '# PDF/A\n\nSome *emphasis* and `code`.\n');
        const faces = facesDir();
        const a4 = join(dir, 'a4.pdf');
        expect(cli(['from-md', md, '--target', 'pdf', '--pdf-a', '4', '--pdf-fonts', faces, '--out', a4]).code).toBe(0);
        const text = latin1.decode(readFileSync(a4));
        expect(text.startsWith('%PDF-2.0')).toBe(true);
        expect(text).toContain('<pdfaid:part>4</pdfaid:part>');
        const b2 = join(dir, 'b2.pdf');
        expect(cli(['convert', SAMPLE_DOCX, '--target', 'pdf', '--pdf-a', '2b', '--pdf-fonts', faces, '--out', b2]).code).toBe(0);
        expect(latin1.decode(readFileSync(b2)).startsWith('%PDF-1.7')).toBe(true);
    });

    test('--pdf-a without --pdf-fonts embeds the packaged faces; on another verb it is a usage error', () => {
        const dir = scratch();
        const md = join(dir, 'in.md');
        writeFileSync(md, '# T\n');
        const out = join(dir, 'alone.pdf');
        const alone = cli(['from-md', md, '--target', 'pdf', '--pdf-a', '4', '--out', out]);
        expect(alone.code).toBe(0);
        const text = latin1.decode(readFileSync(out));
        expect(text).toContain('<pdfaid:part>4</pdfaid:part>');
        expect(text).toContain('/FontFile2');
        for (const verb of ['to-md', 'to-html']) {
            const r = cli([verb, verb === 'to-md' ? SAMPLE_DOCX : md, '--pdf-a', '4']);
            expect(r.code).toBe(2);
            expect(r.stderr).toContain('--pdf-a');
        }
    });
});
